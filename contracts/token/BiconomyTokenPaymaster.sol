// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;


import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IEntryPoint } from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import { UserOperation } from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import { UserOperationLib } from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { BasePaymaster } from "../BasePaymaster.sol";
import { IOracleAggregator } from "./oracles/IOracleAggregator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@account-abstraction/contracts/core/Helpers.sol" as Helpers;
import {TokenPaymasterErrors} from "../common/Errors.sol";

// todo add revert codes in errors. structure errors.sol
// todo add try and catch for certain flows (call/static call and if else based on success and fallback)
// todo formal verification
// todo add and review natspecs

// Biconomy Token Paymaster
/**
 * A token-based paymaster that accepts token deposits for supported ERC20 tokens.
 * It is an extension of VerifyingPaymaster which trusts external signer to authorize the transaction, but also with an ability to withdraw tokens. 
 * Optionally a safe guard deposit may be used in future versions.
 * validatePaymasterUserOp doesn't call any external contracts but currently relies on exchangeRate passed externally.
 * based on the exchangeRate and requiredPrefund validation stage ensure the account has enough token allowance and balance, hence only checking referenced state.
 * All withdrawn tokens will be transferred to dynamic fee receiver address.
 */
contract BiconomyTokenPaymaster is BasePaymaster, ReentrancyGuard, TokenPaymasterErrors {

    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;
    using SafeERC20 for IERC20;

    enum ExchangeRateSource {
        EXTERNAL_EXCHANGE_RATE,
        CHAINLINK_PRICE_ORACLE_BASED
    }

    // Gas used in EntryPoint._handlePostOp() method (including this#postOp() call)
    uint256 private UNACCOUNTED_COST = 45000; // TBD

    // Always rely on verifyingSigner..
    address public verifyingSigner;

    // receiver of withdrawn fee tokens
    address public feeReceiver;
    
    // review offsets and define more if needed
    // others in between if we just do concat and not abi.encode
    uint256 private constant VALID_PND_OFFSET = 21;

    uint256 private constant SIGNATURE_OFFSET = 181;
    
    // if we make use of validateConstructor
    // account implementation defines approval check method in deployment transaaction but binds to a wallet
    // address public immutable smartAccountFactory;

    // review
    // notice: Since it's always verified by the signing service, below gated mapping state could be avoided.
    mapping(address => bool) private supportedTokens;

    IOracleAggregator public oracleAggregator;

    event EPGasOverheadChanged(
        uint256 indexed _oldValue,
        uint256 indexed _newValue
    );

    event VerifyingSignerChanged(
        address indexed _oldSigner,
        address indexed _newSigner,
        address indexed _actor
    );

    event OracleAggregatorChanged(
        address indexed _oldoracleAggregator,
        address indexed _neworacleAggregator,
        address indexed _actor
    );

    event FeeReceiverChanged(
        address indexed _oldfeeReceiver,
        address indexed _newfeeReceiver,
        address indexed _actor
    );

    event NewFeeTokenSupported(
        address indexed _token,
        address indexed _actor
    );

    event TokenPaymasterOperation(address indexed sender, address indexed token, uint256 cost);

    constructor(
        address _owner,
        IEntryPoint _entryPoint,
        address _verifyingSigner,
        IOracleAggregator _oracleAggregator
        // potentially take router param as well
        // optionally get fee receiver if we need to (can always set after deploying!)
    ) payable BasePaymaster(_owner, _entryPoint) {
        if(_owner == address(0)) revert OwnerCannotBeZero();
        if (address(_entryPoint) == address(0)) revert EntryPointCannotBeZero();
        if(address(_oracleAggregator) == address(0)) revert OracleAggregatorCannotBeZero();
        if (_verifyingSigner == address(0))
            revert VerifyingSignerCannotBeZero();
         _transferOwnership(_owner);
        assembly {
            sstore(verifyingSigner.slot, _verifyingSigner)
        }
        oracleAggregator = _oracleAggregator;
        feeReceiver = address(this); // initialize with self (could also be _owner)
    }

    /**
     * @dev Set a new verifying signer address.
     * Can only be called by the owner of the contract.
     * @param _newVerifyingSigner The new address to be set as the verifying signer.
     * @notice If _newVerifyingSigner is set to zero address, it will revert with an error.
     * After setting the new signer address, it will emit an event VerifyingSignerChanged.
     */
    function setSigner(address _newVerifyingSigner) external payable onlyOwner {
        if (_newVerifyingSigner == address(0))
            revert VerifyingSignerCannotBeZero();
        address oldSigner = verifyingSigner;
        assembly {
            sstore(verifyingSigner.slot, _newVerifyingSigner)
        }
        emit VerifyingSignerChanged(oldSigner, _newVerifyingSigner, msg.sender);
    }

    // notice payable in setVerifyingSigner
    // todo review payable in onlyOwner methods from GO POV
    function setOracleAggregator(address _newOracleAggregator) external payable onlyOwner {
        if (_newOracleAggregator == address(0))
            revert OracleAggregatorCannotBeZero();
        address oldOA = address(oracleAggregator);
        assembly {
            sstore(oracleAggregator.slot, _newOracleAggregator)
        }
        emit OracleAggregatorChanged(oldOA, _newOracleAggregator, msg.sender);
    }

    function setFeeReceiver(address _newFeeReceiver) external payable onlyOwner {
         if (_newFeeReceiver == address(0))
            revert FeeReceiverCannotBeZero();
        address oldFeeReceiver = feeReceiver;
        assembly {
            sstore(feeReceiver.slot, _newFeeReceiver)
        }
        emit FeeReceiverChanged(oldFeeReceiver, _newFeeReceiver, msg.sender);

    }

    function setTokenAllowed(address _token) external payable onlyOwner {
        require(_token != address(0), "Token address cannot be zero");
        supportedTokens[_token] = true;
        emit NewFeeTokenSupported(_token, msg.sender);
    }

    function setUnaccountedEPGasOverhead(uint256 value) external onlyOwner {
        uint256 oldValue = UNACCOUNTED_COST;
        UNACCOUNTED_COST = value;
        emit EPGasOverheadChanged(oldValue, value);
    }

    /**
     * add a deposit for this paymaster, used for paying for transaction fees
     */
    function deposit() public payable virtual override nonReentrant {
        IEntryPoint(entryPoint).depositTo{value: msg.value}(address(this));
    }

    /**
     * @dev Withdraws the specified amount of gas tokens from the paymaster's balance and transfers them to the specified address.
     * @param withdrawAddress The address to which the gas tokens should be transferred.
     * @param amount The amount of gas tokens to withdraw.
     */
    function withdrawTo(
        address payable withdrawAddress,
        uint256 amount
    ) public override nonReentrant {
        if (withdrawAddress == address(0)) revert CanNotWithdrawToZeroAddress();
        entryPoint.withdrawTo(withdrawAddress, amount);
    }

    /**
     * @dev Returns true if this contract supports the given fee token address.
     */
    function isSupportedToken(
        address _token
    ) external view virtual returns (bool) {
        return _isSupportedToken(_token);
    }

    function _isSupportedToken(address _token) private view returns (bool) {
        return supportedTokens[_token];
    }

    /**
     * @dev Returns the exchange price of the token in wei.
     */
    function exchangePrice(
        address _token
    ) public view virtual returns (uint256 exchangeRate) {
        // get price from oracle aggregator. could be in yul / staticcall then try catch / if else on success and data
        exchangeRate = IOracleAggregator(oracleAggregator).getTokenValueOfOneEth(_token);
        // exchangeRate = (exchangeRate * 99) / 100; // 1% conver chainlink `Deviation threshold`

        // if price feed is not available in aggregator then fallback to exchange rate or throw (depending on priceSource)
    }

    /**
     * @dev pull tokens out of paymaster in case they were sent to the paymaster at any point.
     * @param token the token deposit to withdraw
     * @param target address to send to
     * @param amount amount to withdraw
     */
    function withdrawTokensTo(IERC20 token, address target, uint256 amount) public nonReentrant {
        require(owner() == msg.sender, "only owner can withdraw tokens"); // add revert code
        token.safeTransfer(target, amount);
    }


     /**
     * @dev This method is called by the off-chain service, to sign the request.
     * It is called on-chain from the validatePaymasterUserOp, to validate the signature.
     * @notice That this signature covers all fields of the UserOperation, except the "paymasterAndData",
     * which will carry the signature itself.
     * @return hash we're going to sign off-chain (and validate on-chain)
     */
    function getHash(
        UserOperation calldata userOp,
        ExchangeRateSource priceSource,
        uint48 validUntil,
        uint48 validAfter,
        address feeToken,
        uint256 exchangeRate,
        uint256 fee
    ) public view returns (bytes32) {
        //can't use userOp.hash(), since it contains also the paymasterAndData itself.
        return
            keccak256(
                abi.encode(
                    userOp.getSender(),
                    userOp.nonce,
                    keccak256(userOp.initCode),
                    keccak256(userOp.callData),
                    userOp.callGasLimit,
                    userOp.verificationGasLimit,
                    userOp.preVerificationGas,
                    userOp.maxFeePerGas,
                    userOp.maxPriorityFeePerGas,
                    block.chainid,
                    address(this),
                    priceSource,
                    validUntil,
                    validAfter,
                    feeToken,
                    exchangeRate,
                    fee
                )
            );
    }

    function _validateConstructor(
        UserOperation calldata userOp,
        address token,
        uint256 tokenRequiredPreFund
    ) internal view {
        address factory = address(bytes20(userOp.initCode));
        // checking allowance being given in first userOp for an account would depend on implementation of factory as well
    }

    /**
     * @dev Verify that an external signer signed the paymaster data of a user operation.
     * The paymaster data is expected to be the paymaster and a signature over the entire request parameters.
     * @param userOp The UserOperation struct that represents the current user operation.
     * userOpHash The hash of the UserOperation struct.
     * @param requiredPreFund The required amount of pre-funding for the paymaster.
     * @return context A context string returned by the entry point after successful validation.
     * @return validationData An integer returned by the entry point after successful validation.
     */
    // review try to avoid stack too deep. currently need to use viaIR
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 requiredPreFund
    ) internal override returns (bytes memory context, uint256 validationData) {

        // verificationGasLimit is dual-purposed, as gas limit for postOp. make sure it is high enough
        // make sure that verificationGasLimit is high enough to handle postOp
        require(userOp.verificationGasLimit > UNACCOUNTED_COST, "TokenPaymaster: gas too low for postOp");

        // todo: in this method try to resolve stack too deep (though via-ir is good enough)
        (
            ExchangeRateSource priceSource,
            uint48 validUntil,
            uint48 validAfter,
            address feeToken,
            uint256 exchangeRate,
            uint256 fee,
            bytes calldata signature
        ) = parsePaymasterAndData(userOp.paymasterAndData);

        // review
        // we only "require" it here so that the revert reason on invalid signature will be of "VerifyingPaymaster", and not "ECDSA"
        if (signature.length != 65) revert InvalidPaymasterSignatureLength(signature.length);

        bytes32 _hash = getHash(userOp, priceSource, validUntil, validAfter, feeToken, exchangeRate, fee).toEthSignedMessageHash();

        context = "";
        
        //don't revert on signature failure: return SIG_VALIDATION_FAILED
        if (
            verifyingSigner !=
            _hash.recover(signature)
        ) {
            // empty context and sigFailed true
            return (context, Helpers._packValidationData(true, validUntil, validAfter));
        }

        address account = userOp.getSender();

        require(_isSupportedToken(feeToken), "TokenPaymaster: token is not supported as fee token") ;

        uint256 costOfPost = userOp.maxFeePerGas * UNACCOUNTED_COST; // unaccountedEPGasOverhead

        // This model assumes irrespective of priceSource exchangeRate is always sent from outside
        // for below checks you would either need maxCost or some exchangeRate
        uint256 tokenRequiredPreFund = ((requiredPreFund + costOfPost) * exchangeRate) / 10 ** 18;

        // todo 
        // review: allowance check possibly can be marked for removal and just rely on balance check
        // postOp would fail anyway if user removes allowance or doesn't have balance
        /*if (userOp.initCode.length != 0) {
        _validateConstructor(userOp, feeToken, tokenRequiredPreFund + fee);
        } else {
            require(
             IERC20(feeToken).allowance(account, address(this)) >=
                (tokenRequiredPreFund + fee),
                "Paymaster: not enough allowance"
            );
        }*/

        require(
            IERC20(feeToken).balanceOf(account) >= (tokenRequiredPreFund + fee),
            "Paymaster: not enough balance"
        );

        context = abi.encode(account, feeToken, priceSource, exchangeRate, fee, userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas);
       
        return (context, Helpers._packValidationData(false, validUntil, validAfter));
    }

    /**
     * @dev Executes the paymaster's payment conditions
     * @param mode tells whether the op succeeded, reverted, or if the op succeeded but cause the postOp to revert
     * @param context payment conditions signed by the paymaster in `validatePaymasterUserOp`
     * @param actualGasCost amount to be paid to the entry point in wei
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal virtual override {

        (address account, IERC20 feeToken, ExchangeRateSource priceSource, uint256 exchangeRate, uint256 fee, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas) = abi
            .decode(context, (address, IERC20, ExchangeRateSource, uint256, uint256, uint256, uint256));

        uint256 effectiveExchangeRate = exchangeRate;

        if (priceSource == ExchangeRateSource.CHAINLINK_PRICE_ORACLE_BASED) {
            effectiveExchangeRate = exchangePrice(address(feeToken));
        } 

        uint256 gasPriceUserOp = maxFeePerGas;
        // review Could do below if we're okay to touch BASEFEE in postOp call
        /*unchecked {
            if (maxFeePerGas == maxPriorityFeePerGas) {
            } else {
                gasPriceUserOp = Math.min(maxFeePerGas, maxPriorityFeePerGas + block.basefee);
            }
        }*/

        uint256 actualTokenCost = ((actualGasCost + (UNACCOUNTED_COST * gasPriceUserOp)) * effectiveExchangeRate) / 1e18;
        if (mode != PostOpMode.postOpReverted) {
            // review if below silently fails should notify in event accordingly
            // failure example
            // https://dashboard.tenderly.co/yashasvi/project/tx/mumbai/0xa01f4f57eb28b430b287e55e9baf2e2fd7f45b565ee932b0d96d28211d0272ff?trace=0.3.1.1.2.1.0 
            feeToken.safeTransferFrom(account, feeReceiver, actualTokenCost + fee);
            emit TokenPaymasterOperation(account, address(feeToken), actualTokenCost + fee);
        } 
        // there could be else bit acting as deposit paymaster
        /*else {

        }*/
    }

    function parsePaymasterAndData(
        bytes calldata paymasterAndData
    )
        public
        pure
        returns (
            ExchangeRateSource priceSource,
            uint48 validUntil,
            uint48 validAfter,
            address feeToken,
            uint256 exchangeRate,
            uint256 fee,
            bytes calldata signature
        )
    {
        priceSource = ExchangeRateSource(uint8(bytes1(paymasterAndData[VALID_PND_OFFSET - 1 : VALID_PND_OFFSET])));
        (validUntil, validAfter, feeToken, exchangeRate, fee) = abi.decode(
            paymasterAndData[VALID_PND_OFFSET:SIGNATURE_OFFSET],
            (uint48, uint48, address, uint256, uint256)
        );
        signature = paymasterAndData[SIGNATURE_OFFSET:];
    }
}