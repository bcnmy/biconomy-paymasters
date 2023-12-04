// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOracleAggregator {
    function getTokenValueOfOneNativeToken(
        address _token
    ) external view returns (uint128 exchangeRate);
}
