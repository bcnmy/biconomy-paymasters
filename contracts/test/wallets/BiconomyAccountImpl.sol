// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@biconomy/account-contracts/contracts/smart-contract-wallet/SmartAccount.sol";

contract BiconomyAccountImplementation is SmartAccount {
    /**
     * @dev Constructor that sets the owner of the contract and the entry point contract.
     * @param anEntryPoint The address of the entry point contract.
     */
    constructor(IEntryPoint anEntryPoint) SmartAccount(anEntryPoint) {}
}
