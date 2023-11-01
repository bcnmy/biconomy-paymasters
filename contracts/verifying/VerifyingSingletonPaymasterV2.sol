// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

/* solhint-disable reason-string */
/* solhint-disable no-inline-assembly */
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {UserOperation, UserOperationLib} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "../BasePaymaster.sol";
import {VerifyingPaymasterErrors} from "../common/Errors.sol";
import {IVerifyingSingletonPaymaster} from "../interfaces/paymasters/IVerifyingSingletonPaymaster.sol";

contract VerifyingSingletonPaymasterV2 is
    BasePaymaster,
    ReentrancyGuard,
    VerifyingPaymasterErrors,
    IVerifyingSingletonPaymaster
{
    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;

    uint32 private constant PRICE_DENOMINATOR = 1e6;

    // paymasterAndData: concat of [paymasterAddress(address), abi.encode(paymasterId, validUntil, validAfter, priceMarkup): makes up 32*4 bytes, signature]
    uint256 private constant VALID_PND_OFFSET = 20;

    uint256 private constant SIGNATURE_OFFSET = 148;

    // Gas used in EntryPoint._handlePostOp() method (including this#postOp() call)
    uint256 private unaccountedEPGasOverhead;

    mapping(address => uint256) public paymasterIdBalances;

    address public verifyingSigner;

    uint32 public fixedPriceMarkup; // immutable? constant? 1.1e6

    // Review if fixed markup is needed in constructor (can init with value or make constant(and remove setter))
    constructor(
        address _owner,
        IEntryPoint _entryPoint,
        address _verifyingSigner,
        uint32 _fixedPriceMarkup
    ) payable BasePaymaster(_owner, _entryPoint) {
        if (address(_entryPoint) == address(0)) revert EntryPointCannotBeZero();
        // Review // maybe <= 1300000
        require(_fixedPriceMarkup <= PRICE_DENOMINATOR * 2, "markup too high");
        if (_verifyingSigner == address(0))
            revert VerifyingSignerCannotBeZero();
        assembly {
            sstore(verifyingSigner.slot, _verifyingSigner)
        }
        unaccountedEPGasOverhead = 12000;
        fixedPriceMarkup = _fixedPriceMarkup;
    }

    /**
     * @dev Add a deposit for this paymaster and given paymasterId (Dapp Depositor address), used for paying for transaction fees
     * @param paymasterId dapp identifier for which deposit is being made
     */
    function depositFor(address paymasterId) external payable nonReentrant {
        if (paymasterId == address(0)) revert PaymasterIdCannotBeZero();
        if (msg.value == 0) revert DepositCanNotBeZero();
        paymasterIdBalances[paymasterId] =
            paymasterIdBalances[paymasterId] +
            msg.value;
        entryPoint.depositTo{value: msg.value}(address(this));
        emit GasDeposited(paymasterId, msg.value);
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
        revert("user DepositFor instead");
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
        if (amount > currentBalance)
            revert InsufficientBalance(amount, currentBalance);
        paymasterIdBalances[msg.sender] =
            paymasterIdBalances[msg.sender] -
            amount;
        entryPoint.withdrawTo(withdrawAddress, amount);
        emit GasWithdrawn(msg.sender, withdrawAddress, amount);
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

    function setUnaccountedEPGasOverhead(
        uint256 value
    ) external payable onlyOwner {
        uint256 oldValue = unaccountedEPGasOverhead;
        unaccountedEPGasOverhead = value;
        emit EPGasOverheadChanged(oldValue, value);
    }

    function setFixedPriceMarkup(uint32 _markup) external payable onlyOwner {
        require(_markup <= PRICE_DENOMINATOR * 2, "markup too high");
        uint32 oldValue = fixedPriceMarkup;
        fixedPriceMarkup = _markup;
        emit FixedPriceMarkupChanged(oldValue, _markup);
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
                    keccak256(userOp.initCode),
                    keccak256(userOp.callData),
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

    // Note: do not use this in validation phase
    function getGasPrice(
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas
    ) internal view returns (uint256) {
        if (maxFeePerGas == maxPriorityFeePerGas) {
            //legacy mode (for networks that don't support basefee opcode)
            return maxFeePerGas;
        }
        return minuint256(maxFeePerGas, maxPriorityFeePerGas + block.basefee);
    }

    // Review below helpers
    function minuint256(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function maxuint256(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    function minuint32(uint32 a, uint32 b) internal pure returns (uint32) {
        return a < b ? a : b;
    }

    function maxuint32(uint32 a, uint32 b) internal pure returns (uint32) {
        return a > b ? a : b;
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
        // review: in this method try to resolve stack too deep (though via-ir is good enough)
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
        context = "";
        // Review: var can be removed
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

        require(
            priceMarkup <= 2e6,
            "Verifying PM: price markup percentage too high"
        );
        // Review if below is needed (as paymaster service may pass 0 if dynamic pricing doesn't apply)
        require(
            priceMarkup >= 1e6,
            "Verifying PM: price markup percentage too low"
        );

        // Review: may not be needed at all
        address account = userOp.getSender();

        // Review max or min
        uint32 dynamicMarkup = maxuint32(priceMarkup, fixedPriceMarkup);

        if (
            (requiredPreFund * dynamicMarkup) / PRICE_DENOMINATOR >
            paymasterIdBalances[paymasterId]
        )
            revert InsufficientBalance(
                (requiredPreFund * dynamicMarkup) / PRICE_DENOMINATOR,
                paymasterIdBalances[paymasterId]
            );

        context = abi.encode(
            account,
            paymasterId,
            priceMarkup,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            userOpHash
        );

        return (context, _packValidationData(false, validUntil, validAfter));
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
     * @param mode tells whether the op succeeded, reverted, or if the op succeeded but cause the postOp to revert
     * @param context payment conditions signed by the paymaster in `validatePaymasterUserOp`
     * @param actualGasCost amount to be paid to the entry point in wei
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal virtual override {
        // Review what is needed in context
        (
            address account,
            address paymasterId,
            uint32 priceMarkup,
            uint256 maxFeePerGas,
            uint256 maxPriorityFeePerGas,
            bytes32 userOpHash
        ) = abi.decode(
                context,
                (address, address, uint32, uint256, uint256, bytes32)
            );

        uint256 effectiveGasPrice = getGasPrice(
            maxFeePerGas,
            maxPriorityFeePerGas
        );

        // Review max or min
        uint32 dynamicMarkup = maxuint32(priceMarkup, fixedPriceMarkup);

        uint256 balToDeduct = actualGasCost +
            unaccountedEPGasOverhead *
            effectiveGasPrice;

        // deduct with premium
        paymasterIdBalances[paymasterId] =
            paymasterIdBalances[paymasterId] -
            ((balToDeduct * dynamicMarkup) / PRICE_DENOMINATOR);

        // "collect" premium
        paymasterIdBalances[owner()] =
            paymasterIdBalances[owner()] +
            ((balToDeduct * (dynamicMarkup - 1e6)) / PRICE_DENOMINATOR);

        emit GasBalanceDeducted(
            paymasterId,
            (balToDeduct * dynamicMarkup) / PRICE_DENOMINATOR
        );
        emit FeeCollected(
            (balToDeduct * (dynamicMarkup - 1e6)) / PRICE_DENOMINATOR
        );
    }
}
