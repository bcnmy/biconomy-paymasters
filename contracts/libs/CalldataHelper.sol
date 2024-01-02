// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library CalldataHelper {
    function calldataKeccak(
        bytes calldata data
    ) internal pure returns (bytes32 ret) {
        assembly ("memory-safe") {
            let mem := mload(0x40)
            let len := data.length
            calldatacopy(mem, data.offset, len)
            ret := keccak256(mem, len) 
        }
    }
}