// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {SmartAccount} from "../../../lib/scw-contracts/contracts/smart-account/SmartAccount.sol";

// Note: Could also use published package or added submodule.

contract BiconomyAccountImplementation is SmartAccount {
    /**
     * @dev Constructor that sets the owner of the contract and the entry point contract.
     * @param anEntryPoint The address of the entry point contract.
     */
    constructor(IEntryPoint anEntryPoint) SmartAccount(anEntryPoint) {}
}
