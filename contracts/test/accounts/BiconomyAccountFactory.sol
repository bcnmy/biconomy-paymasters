// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Could also use published package or added submodule.

import {SmartAccountFactory} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/factory/SmartAccountFactory.sol";

contract BiconomyAccountFactory is SmartAccountFactory {
    constructor(
        address _basicImplementation,
        address _newOwner
    ) SmartAccountFactory(_basicImplementation, _newOwner) {}
}
