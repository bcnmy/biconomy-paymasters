// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/* solhint-disable reason-string */
/* solhint-disable no-inline-assembly */
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {UserOperation, UserOperationLib} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "../BasePaymaster.sol";
import {SponsorshipPaymasterErrors} from "../common/Errors.sol";
import {MathLib} from "../libs/MathLib.sol";
import {AddressUtils} from "../libs/AddressUtils.sol";
import {ISponsorshipPaymaster} from "../interfaces/paymasters/ISponsorshipPaymaster.sol";

/**
 * @title SponsorshipPaymaster
 * @author livingrockrises<chirag@biconomy.io>
 * @notice Based on Infinitism 'VerifyingPaymaster' contract
 * @dev This contract is used to sponsor the transaction fees of the user operations
 * Uses a verifying signer to provide the signature if predetermined conditions are met 
 * regarding the user operation calldata. Also this paymaster is Singleton in nature which 
 * means multiple Dapps/Wallet clients willing to sponsor the transactions can share this paymaster.
 * Maintains it's own accounting of the gas balance for each Dapp/Wallet client 
 * and Manages it's own deposit on the EntryPoint.
 */
contract SponsorshipPaymaster is
    BasePaymaster,
    ReentrancyGuard,
    SponsorshipPaymasterErrors,
    ISponsorshipPaymaster
{
    using ECDSA for bytes32;
    using AddressUtils for address;
    using UserOperationLib for UserOperation;

    uint32 private constant PRICE_DENOMINATOR = 1e6;

    // paymasterAndData: concat of [paymasterAddress(address), abi.encode(paymasterId, validUntil, validAfter, priceMarkup): makes up 32*4 bytes, signature]
    uint256 private constant VALID_PND_OFFSET = 20;

    uint256 private constant SIGNATURE_OFFSET = 148;

    // Gas used in EntryPoint._handlePostOp() method (including this#postOp() call)
    uint256 private unaccountedEPGasOverhead;

    uint32 private fixedPriceMarkup;

    mapping(address => uint256) public paymasterIdBalances;

    address public verifyingSigner;

    address public feeCollector;

    constructor(
        address _owner,
        IEntryPoint _entryPoint,
        address _verifyingSigner,
        address _feeCollector
    ) payable BasePaymaster(_owner, _entryPoint) {
        if (address(_entryPoint) == address(0)) revert EntryPointCannotBeZero();
        if (_verifyingSigner == address(0))
            revert VerifyingSignerCannotBeZero();
        if (_feeCollector == address(0)) revert FeeCollectorCannotBeZero();
        assembly {
            sstore(verifyingSigner.slot, _verifyingSigner)
            sstore(feeCollector.slot, _feeCollector)
        }
        unaccountedEPGasOverhead = 35500;
        fixedPriceMarkup = 1100000; // 10%
    }

    /**
     * @dev Add a deposit for this paymaster and given paymasterId (Dapp Depositor address), used for paying for transaction fees
     * @param paymasterId dapp identifier for which deposit is being made
     */
    function depositFor(address paymasterId) external payable nonReentrant {
        if(paymasterId.isContract()) revert PaymasterIdCannotBeContract();
        if (paymasterId == address(0)) revert PaymasterIdCannotBeZero();
        if (msg.value == 0) revert DepositCanNotBeZero();
        paymasterIdBalances[paymasterId] += msg.value;
        entryPoint.depositTo{value: msg.value}(address(this));
        emit GasDeposited(paymasterId, msg.value);
    }

    /**
     * @dev Set a new verifying signer address.
     * Can only be called by the owner of the contract.
     * @param _newVerifyingSigner The new address to be set as the verifying signer.
     * @notice If _newVerifyingSigner is set to zero address, it will revert with an error.
     * After setting the new signer address, it will emit an event VerifyingSignerChanged.
     */
    function setSigner(
        address _newVerifyingSigner
    ) external payable override onlyOwner {
        if (_newVerifyingSigner == address(0))
            revert VerifyingSignerCannotBeZero();
        address oldSigner = verifyingSigner;
        assembly {
            sstore(verifyingSigner.slot, _newVerifyingSigner)
        }
        emit VerifyingSignerChanged(oldSigner, _newVerifyingSigner, msg.sender);
    }

    /**
     * @dev Set a new fee collector address.
     * Can only be called by the owner of the contract.
     * @param _newFeeCollector The new address to be set as the fee collector.
     * @notice If _newFeeCollector is set to zero address, it will revert with an error.
     * After setting the new fee collector address, it will emit an event FeeCollectorChanged.
     */
    function setFeeCollector(
        address _newFeeCollector
    ) external payable onlyOwner {
        if(_newFeeCollector.isContract()) revert FeeCollectorCannotBeContract();
        if (_newFeeCollector == address(0)) revert FeeCollectorCannotBeZero();
        address oldFeeCollector = feeCollector;
        assembly {
            sstore(feeCollector.slot, _newFeeCollector)
        }
        emit FeeCollectorChanged(oldFeeCollector, _newFeeCollector, msg.sender);
    }

    /**
     * @dev Set a new unaccountedEPGasOverhead value.
     * @param value The new value to be set as the unaccountedEPGasOverhead.
     * @notice only to be called by the owner of the contract.
     */
    function setUnaccountedEPGasOverhead(
        uint256 value
    ) external payable onlyOwner {
        require(value <= 200000, "Gas overhead too high");
        uint256 oldValue = unaccountedEPGasOverhead;
        unaccountedEPGasOverhead = value;
        emit EPGasOverheadChanged(oldValue, value);
    }

    /**
     * @dev Set a new fixedPriceMarkup value.
     * @param _markup The new value to be set as the fixedPriceMarkup.
     * @notice only to be called by the owner of the contract.
     * @notice The markup is in percentage, so 1100000 is 10%.
     * @notice The markup can not be higher than 100%
     */
    function setFixedPriceMarkup(uint32 _markup) external payable onlyOwner {
        require(_markup <= PRICE_DENOMINATOR * 2, "Markup too high");
        require(_markup >= PRICE_DENOMINATOR, "Markup too low"); // if allowed that would mean discounted
        uint32 oldValue = fixedPriceMarkup;
        fixedPriceMarkup = _markup;
        emit FixedPriceMarkupChanged(oldValue, _markup);
    }

    /**
     * @dev get the current deposit for paymasterId (Dapp Depositor address)
     * @param paymasterId dapp identifier
     */
    function getBalance(
        address paymasterId
    ) external view returns (uint256 balance) {
        balance = paymasterIdBalances[paymasterId];
    }

    /**
     @dev Override the default implementation.
     */
    function deposit() public payable virtual override {
        revert("Use depositFor() instead");
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
        uint256 currentBalance = paymasterIdBalances[msg.sender];
        require(amount <= currentBalance, "Sponsorship Paymaster: Insufficient withdrawable funds");
        paymasterIdBalances[msg.sender] = currentBalance - amount;
        entryPoint.withdrawTo(withdrawAddress, amount);
        emit GasWithdrawn(msg.sender, withdrawAddress, amount);
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
        address paymasterId,
        uint48 validUntil,
        uint48 validAfter,
        uint32 priceMarkup
    ) public view returns (bytes32) {
        //can't use userOp.hash(), since it contains also the paymasterAndData itself.
        return
            keccak256(
                abi.encode(
                    userOp.getSender(),
                    userOp.nonce,
                    userOp.initCode,
                    userOp.callData,
                    userOp.callGasLimit,
                    userOp.verificationGasLimit,
                    userOp.preVerificationGas,
                    userOp.maxFeePerGas,
                    userOp.maxPriorityFeePerGas,
                    block.chainid,
                    address(this),
                    paymasterId,
                    validUntil,
                    validAfter,
                    priceMarkup
                )
            );
    }

    function parsePaymasterAndData(
        bytes calldata paymasterAndData
    )
        public
        pure
        returns (
            address paymasterId,
            uint48 validUntil,
            uint48 validAfter,
            uint32 priceMarkup,
            bytes calldata signature
        )
    {
        (paymasterId, validUntil, validAfter, priceMarkup) = abi.decode(
            paymasterAndData[VALID_PND_OFFSET:SIGNATURE_OFFSET],
            (address, uint48, uint48, uint32)
        );

        signature = paymasterAndData[SIGNATURE_OFFSET:];
    }

    /**
     * @dev Executes the paymaster's payment conditions
     * @param context payment conditions signed by the paymaster in `validatePaymasterUserOp`
     * @param actualGasCost amount to be paid to the entry point in wei
     */
    function _postOp(
        PostOpMode /** mode */,
        bytes calldata context,
        uint256 actualGasCost
    ) internal virtual override {
        (
            address paymasterId,
            uint32 dynamicMarkup,
            uint256 maxFeePerGas,
            uint256 maxPriorityFeePerGas,
            bytes32 userOpHash
        ) = abi.decode(context, (address, uint32, uint256, uint256, bytes32));

        uint256 effectiveGasPrice = getGasPrice(
            maxFeePerGas,
            maxPriorityFeePerGas
        );

        uint256 balToDeduct = actualGasCost +
            unaccountedEPGasOverhead *
            effectiveGasPrice;

        uint256 costIncludingPremium = (balToDeduct * dynamicMarkup) /
            PRICE_DENOMINATOR;

        // deduct with premium
        paymasterIdBalances[paymasterId] -= costIncludingPremium;

        uint256 actualPremium = costIncludingPremium - balToDeduct;
        // "collect" premium
        paymasterIdBalances[feeCollector] += actualPremium;

        emit GasBalanceDeducted(paymasterId, costIncludingPremium, userOpHash);
        // Review if we should emit balToDeduct as well
        emit PremiumCollected(paymasterId, actualPremium);
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
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    ) internal override returns (bytes memory context, uint256 validationData) {
        (
            address paymasterId,
            uint48 validUntil,
            uint48 validAfter,
            uint32 priceMarkup,
            bytes calldata signature
        ) = parsePaymasterAndData(userOp.paymasterAndData);

        bytes32 hash = getHash(
            userOp,
            paymasterId,
            validUntil,
            validAfter,
            priceMarkup
        );
        uint256 sigLength = signature.length;
        // we only "require" it here so that the revert reason on invalid signature will be of "VerifyingPaymaster", and not "ECDSA"
        if (sigLength != 65) revert InvalidPaymasterSignatureLength(sigLength);
        //don't revert on signature failure: return SIG_VALIDATION_FAILED
        if (
            verifyingSigner != hash.toEthSignedMessageHash().recover(signature)
        ) {
            // empty context and sigFailed with time range provided
            return (context, _packValidationData(true, validUntil, validAfter));
        }

        require(priceMarkup <= 2e6, "Verifying PM:high markup %");

        uint32 dynamicMarkup = MathLib.maxuint32(priceMarkup, fixedPriceMarkup);

        uint256 effectiveCost = (requiredPreFund * dynamicMarkup) /
            PRICE_DENOMINATOR;

        if (effectiveCost > paymasterIdBalances[paymasterId])
            revert InsufficientBalance(
                effectiveCost,
                paymasterIdBalances[paymasterId]
            );
        // require(effectiveCost <= paymasterIdBalances[paymasterId], "BTPM: account does not have enough token balance");

        context = abi.encode(
            paymasterId,
            dynamicMarkup,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            userOpHash
        );

        return (context, _packValidationData(false, validUntil, validAfter));
    }

    // Note: do not use this in validation phase
    function getGasPrice(
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas
    ) internal view returns (uint256) {
        if (maxFeePerGas == maxPriorityFeePerGas) {
            //legacy mode (for networks that don't support basefee opcode)
            return maxFeePerGas;
        }
        return
            MathLib.minuint256(
                maxFeePerGas,
                maxPriorityFeePerGas + block.basefee
            );
    }
}
