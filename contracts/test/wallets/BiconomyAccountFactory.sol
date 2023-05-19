// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@biconomy/account-contracts/contracts/smart-contract-wallet/SmartAccountFactory.sol";

contract BiconomyAccountFactory is SmartAccountFactory {
    constructor(
        address _basicImplementation
    ) SmartAccountFactory(_basicImplementation) {}
}
