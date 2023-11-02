// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVerifyingSingletonPaymaster {
    event EPGasOverheadChanged(
        uint256 indexed _oldValue,
        uint256 indexed _newValue
    );

    event FixedPriceMarkupChanged(
        uint32 indexed _oldValue,
        uint32 indexed _newValue
    );

    event VerifyingSignerChanged(
        address indexed _oldSigner,
        address indexed _newSigner,
        address indexed _actor
    );
    event GasDeposited(address indexed _paymasterId, uint256 indexed _value);
    event GasWithdrawn(
        address indexed _paymasterId,
        address indexed _to,
        uint256 indexed _value
    );
    event GasBalanceDeducted(
        address indexed _paymasterId,
        uint256 indexed _charge
    );
    event FeeCollected(uint256 indexed _premium);

    /**
     * @dev Returns the current balance of the paymasterId(aka fundingId)
     * @param paymasterId The address of the paymasterId
     */
    function getBalance(
        address paymasterId
    ) external view returns (uint256 balance);

    /**
     * @dev updates the verifyingSigner address
     * @param _newVerifyingSigner The new verifyingSigner address
     */
    function setSigner(address _newVerifyingSigner) external payable;

    /**
     * @dev updates the postOp + unacocunted gas overhead
     * @param value The new value
     */
    function setUnaccountedEPGasOverhead(uint256 value) external payable;
}
