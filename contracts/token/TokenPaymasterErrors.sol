// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.23;

contract TokenPaymasterErrors {
    /**
     * @notice Throws when the Entrypoint address provided is address(0)
     */
    error EntryPointCannotBeZero();

    /**
     * @notice Throws when the owner address provided is address(0)
     */
    error OwnerCannotBeZero();

    /**
     * @notice Throws when the verifiying signer address provided is address(0)
     */
    error VerifyingSignerCannotBeZero();

    /**
     * @notice Throws when the 0 has been provided as deposit
     */
    error DepositCanNotBeZero();

    /**
     * @notice Throws when trying to withdraw to address(0)
     */
    error CanNotWithdrawToZeroAddress();

    /**
     * @notice Throws when trying to withdraw more than balance available
     * @param amountRequired required balance
     * @param currentBalance available balance
     */
    /*error InsufficientTokenBalance(
        uint256 amountRequired,
        uint256 currentBalance
    );*/

    /**
     * @notice Throws when signature provided has invalid length
     * @param sigLength length oif the signature provided
     */
    // error InvalidPaymasterSignatureLength(uint256 sigLength);

    /**
     * @notice Throws when the fee receiver address provided is address(0)
     */
    error FeeReceiverCannotBeZero();

    error TokensAndAmountsLengthMismatch();

    error NativeTokenBalanceZero();

    error NativeTokensWithdrawalFailed();

    error CannotBeUnrealisticValue();
}
