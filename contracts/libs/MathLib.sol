// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

library MathLib {
    function minuint256(uint256 a, uint256 b) internal pure returns (uint256 result) {
        assembly {
            result := xor(b, mul(xor(b, a), gt(a, b)))
        }
    }

    function maxuint256(uint256 a, uint256 b) internal pure returns (uint256 result) {
        assembly {
            result := xor(a, mul(xor(a, b), gt(b, a)))
        }
    }

    function minuint32(uint32 a, uint32 b) internal pure returns (uint32 result) {
        assembly {
            result := xor(b, mul(xor(b, a), gt(a, b)))
        }
    }

    function maxuint32(uint32 a, uint32 b) internal pure returns (uint32 result) {
        assembly {
            result := xor(a, mul(xor(a, b), gt(b, a)))
        }
    }
}
