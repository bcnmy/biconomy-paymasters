// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;


import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IEntryPoint } from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import { UserOperation } from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import { UserOperationLib } from "@account-abstraction/contracts/interfaces/UserOperation.sol";import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { BasePaymaster } from "../BasePaymaster.sol";
import { IOracleAggregator } from "./oracles/IOracleAggregator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@account-abstraction/contracts/core/Helpers.sol" as Helpers;
import {TokenPaymasterErrors} from "../common/Errors.sol";

// todo add title and author
// todo add nonReentrant where applicable
// todo add revert codes
// todo add try and catch for certain flows (call/static call and if else based on success and fallback)
// todo formal verification

contract BiconomyTokenPaymaster is BasePaymaster, ReentrancyGuard, TokenPaymasterErrors {

    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;
    using SafeERC20 for IERC20;

    // In case we also add gasless aspect and more (hybrid) (based on paymasterAndData)
    /*enum PaymentMode {
      GASLESS,
      ERC20,
      FIXED_FEE
    }*/

    enum ExchangeRateSource {
        EXTERNAL_EXCHANGE_RATE,
        CHAINLINK_PRICE_ORACLE_BASED
    }

    struct PaymasterData {
      ExchangeRateSource priceSource;
      uint48 validUntil;
      uint48 validAfter;
      IERC20 feeToken; 
      uint256 exchangeRate;
      uint256 fee;
      // SponsoringMode mode;
      bytes signature;
    }

    // Gas used in EntryPoint._handlePostOp() method (including this#postOp() call)
    uint256 private unaccountedEPGasOverhead;

    // Review it's basically same as above
    // calculated cost of the postOp
    uint256 private constant COST_OF_POST = 45000; // TBD

    // (Potentially) Always rely on verifyingSigner..
    address public verifyingSigner;

    address public feeReceiver;

    // todo: marked for removal
    // RAW early notes
    // paymasterAndData would not have exchange mode 
    // paymasterAndData: [paymaster, token, validUntil, validAfter, fee, exchangeRate, useOracle, /*mode,*/ signature] ...
    // does it need maxCost after signature offset?
    // it would also need fee (flat amount in no of tokens we are charging / would be USD value)

    
    // todo: once everything is clear define/ review offsets
    uint256 private constant VALID_PND_OFFSET = 21;
    // Others in between if we just do concat and not abi.encode
    uint256 private constant SIGNATURE_OFFSET = 181;
    
    // account implementation defines approval check method in deployment transaaction but binds to a wallet
    // address public immutable smartAccountFactory;

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
        unaccountedEPGasOverhead = 45000; // TBD
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
        emit OracleAggregatorChanged(oldFeeReceiver, _newFeeReceiver, msg.sender);

    }

    function setTokenAllowed(address _token) external payable onlyOwner {
        require(_token != address(0), "Token address cannot be zero");
        supportedTokens[_token] = true;
        emit NewFeeTokenSupported(_token, msg.sender);
    }

    function setUnaccountedEPGasOverhead(uint256 value) external onlyOwner {
        uint256 oldValue = unaccountedEPGasOverhead;
        unaccountedEPGasOverhead = value;
        emit EPGasOverheadChanged(oldValue, value);
    }

    /**
     * add a deposit for this paymaster, used for paying for transaction fees
     */
    function deposit() public payable virtual override {
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
        return supportedTokens[_token];
    }

    /**
     * @dev Returns the exchange price of the token in wei.
     */
    function exchangePrice(
        address _token
    ) external view virtual returns (uint256 exchangeRate) {
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
    function withdrawTokensTo(IERC20 token, address target, uint256 amount) public {
        require(owner() == msg.sender, "only owner can withdraw tokens");
        token.safeTransfer(target, amount);
    }

    function pack(UserOperation calldata userOp) internal pure returns (bytes memory ret) {
        bytes calldata pnd = userOp.paymasterAndData;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let ofs := userOp
            let len := sub(sub(pnd.offset, ofs), 32)
            ret := mload(0x40)
            mstore(0x40, add(ret, add(len, 32)))
            mstore(ret, len)
            calldatacopy(add(ret, 32), ofs, len)
        }
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
        address sender = userOp.getSender();
        return
            keccak256(
                abi.encode(
                    // todo: review could remove pack and use just like verifying paymaster and use --via-ir flag while compiling
                    pack(userOp),
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
        require(userOp.verificationGasLimit > COST_OF_POST, "TokenPaymaster: gas too low for postOp");

        // could be just PaymasterData based on implementation of parsePaymasterAndData
        (
            ExchangeRateSource priceSource,
            uint48 validUntil,
            uint48 validAfter,
            address feeToken,
            uint256 exchangeRate,
            uint256 fee,
            bytes calldata signature
        ) = parsePaymasterAndData(userOp.paymasterAndData);

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
        uint256 gasPriceUserOp = userOp.gasPrice();

        // if (feeToken != address(0)) {

            // todo check if the token is supported (and skip 0 address check)
            // review revert if unsuppported

            uint256 costOfPost = userOp.gasPrice() * COST_OF_POST; // unaccountedEPGasOverhead

            // This model assumes irrespective of priceSource exchangeRate is always sent from outside
            // for below checks you would either need maxCost or some exchangeRate
            uint256 tokenRequiredPreFund = ((requiredPreFund + costOfPost) *
            exchangeRate) / 10 ** 18;

            if (userOp.initCode.length != 0) {
            _validateConstructor(userOp, feeToken, tokenRequiredPreFund + fee);
            } else {
            require(
                IERC20(feeToken).allowance(account, address(this)) >=
                    (tokenRequiredPreFund + fee),
                "Paymaster: not enough allowance"
            );
        }

            require(
            IERC20(feeToken).balanceOf(account) >= (tokenRequiredPreFund + fee),
            "Paymaster: not enough balance"
            );

            context = abi.encode(account, feeToken, priceSource, exchangeRate, fee, gasPriceUserOp);
        // }
       
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

        (address account, IERC20 feeToken, ExchangeRateSource priceSource, uint256 exchangeRate, uint256 fee, uint256 gasPriceUserOp) = abi
            .decode(context, (address, IERC20, ExchangeRateSource, uint256, uint256, uint256));

        uint256 effectiveExchangeRate = exchangeRate;

        if (priceSource == ExchangeRateSource.CHAINLINK_PRICE_ORACLE_BASED) {
            effectiveExchangeRate = this.exchangePrice(address(feeToken));
        } 

        uint256 actualTokenCost = ((actualGasCost + (COST_OF_POST * gasPriceUserOp)) * effectiveExchangeRate) / 1e18;
        if (mode != PostOpMode.postOpReverted) {
            // review if below silently fails should notify in event accordingly
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

            // OR

            // PaymasterData memory
        )
    {
        priceSource = ExchangeRateSource(uint8(bytes1(paymasterAndData[VALID_PND_OFFSET - 1 : VALID_PND_OFFSET])));
        (validUntil, validAfter, feeToken, exchangeRate, fee) = abi.decode(
            paymasterAndData[VALID_PND_OFFSET:SIGNATURE_OFFSET],
            (uint48, uint48, address, uint256, uint256)
        );
        signature = paymasterAndData[SIGNATURE_OFFSET:];

        // return PaymasterData(priceSource, validUntil, validAfter, feeToken, exchangeRate, fee, /*mode,*/ signature);
    }
}