// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IOracleAggregator {
    struct TokenInfo {
        uint8 tokenDecimals;
        address tokenOracle;
        address nativeOracle;
        bool isDerivedFeed;
        uint24 priceUpdateThreshold;
    }

    error MismatchInBaseAndQuoteDecimals();
    error InvalidPriceFromRound();
    error LatestRoundIncomplete();
    error PriceFeedStale();
    error OracleAddressCannotBeZero();

    function getTokenValueOfOneNativeToken(address _token) external view returns (uint128 exchangeRate);
}
