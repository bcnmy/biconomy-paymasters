// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {SmartAccount} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/SmartAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

// Could also use published package or added submodule.

contract BiconomyAccountImplementation is SmartAccount {
    /**
     * @dev Constructor that sets the owner of the contract and the entry point contract.
     * @param anEntryPoint The address of the entry point contract.
     */
    constructor(IEntryPoint anEntryPoint) SmartAccount(anEntryPoint) {}
}
