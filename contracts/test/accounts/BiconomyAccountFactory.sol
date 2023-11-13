// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; // temp

// Could also use published package or added submodule.

// temp
import {SmartAccountFactory} from "lib/scw-contracts/contracts/smart-account/factory/SmartAccountFactory.sol";

contract BiconomyAccountFactory is SmartAccountFactory {
    constructor(
        address _basicImplementation,
        address _newOwner
    ) SmartAccountFactory(_basicImplementation, _newOwner) {}
}
