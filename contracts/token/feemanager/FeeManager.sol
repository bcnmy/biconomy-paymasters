// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

// optional aid contract
contract FeeManager is Ownable {
    constructor(address _owner) {
        _transferOwnership(_owner);
    }
}
