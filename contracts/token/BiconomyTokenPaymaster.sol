// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// import "@openzeppelin/contracts/access/Ownable.sol";

import { IEntryPoint } from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import { UserOperation } from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import { UserOperationLib } from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { BasePaymaster } from "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// if Base is BaePaymaster it is immediately Ownable.. todo ;)
// Should be adhere only to IPaymaster or core BasePaymaster as well? IPaymaster + Ownable / BasePayamster 

contract BiconomyTokenPaymaster /*is BasePaymaster*/ {

    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;

    // (Potentially) Always rely on verifyingSigner..
    address public immutable verifyingSigner;

    // tentative
    // paymasterAndData would not have exchange rate
    // paymasterAndData: [paymaster, validUntil, validAfter, token, signature] ... does it need maxCost after signature offset?

    uint256 private constant VALID_TIMESTAMP_OFFSET = 20;

    uint256 private constant TOKEN_OFFSET = 84;

    uint256 private constant SIGNATURE_OFFSET = 104;

    // calculated cost of the postOp
    uint256 private constant COST_OF_POST = 40000; // TBD

    constructor(IEntryPoint _entryPoint, address _owner, address _verifyingSigner) /*BasePaymaster(_entryPoint)*/ {
        // _transferOwnership(_owner);
        verifyingSigner = _verifyingSigner;
    }

}