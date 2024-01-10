// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IOracleAggregator {
    error MismatchInBaseAndQuoteDecimals();
    error InvalidPriceFromRound();
    error LatestRoundIncomplete();
    error PriceFeedStale();
    error OracleAddressCannotBeZero();

    struct TokenInfo {
        uint8 tokenDecimals;
        address tokenOracle;
        address nativeOracle;
        bool isDerivedFeed;
    }

    function getTokenValueOfOneNativeToken(address _token) external view returns (uint128 exchangeRate);
}
