// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IOracleAggregator {
    function getTokenValueOfOneEth(
        address _token
    ) external view returns (uint256 exchangeRate);
}
