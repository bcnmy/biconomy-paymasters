// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

//@notice chainlink reference PriceConverter https://docs.chain.link/docs/get-the-latest-price/
// good practices: https://twitter.com/saxenism/status/1656632735291588609?s=20

error MismatchInBaseAndQuoteDecimals();
error InvalidPriceFromRound();
error LatestRoundIncomplete();
error PriceFeedStale();

// @note: CAKE / BNB is already available here : https://bscscan.com/address/0xcB23da9EA243f53194CBc2380A6d4d9bC046161f#readContract
// just use appropriate method calldata when registering in oracle aggregator

contract CAKEPriceFeedBNBMainnet {
    AggregatorV3Interface internal priceFeed1;
    AggregatorV3Interface internal priceFeed2;

    constructor() {
        priceFeed1 = AggregatorV3Interface(
            0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE
        ); // BNB usd
        priceFeed2 = AggregatorV3Interface(
            0xB6064eD41d4f67e353768aA239cA86f4F73665a1
        ); // CAKE usd

        // If either of the base or quote price feeds have mismatch in decimal then it could be a problem, so throw!
        uint8 decimals1 = priceFeed1.decimals();
        uint8 decimals2 = priceFeed2.decimals();

        if (decimals1 != decimals2) revert MismatchInBaseAndQuoteDecimals();

        // @review could add Sequencer uptime feed for L2s
    }

    function decimals() public view returns (uint8) {
        return 18;
    }

    function description() public view returns (string memory) {
        return "CAKE / BNB";
    }

    function validateRound(
        uint80 roundId,
        int256 price,
        uint256 updatedAt,
        uint80 answeredInRound,
        uint256 staleFeedThreshold
    ) internal view {
        if (price <= 0) revert InvalidPriceFromRound();
        // 2 days old price is considered stale since the price is updated every 24 hours
        if (updatedAt < block.timestamp - staleFeedThreshold)
            revert PriceFeedStale();
        if (updatedAt == 0) revert LatestRoundIncomplete();
        if (answeredInRound < roundId) revert PriceFeedStale();
    }

    function getThePrice() public view returns (int) {
        /**
         * Returns the latest price of price feed 1
         */

        (
            uint80 roundID1,
            int256 price1,
            ,
            uint256 updatedAt1,
            uint80 answeredInRound1
        ) = priceFeed1.latestRoundData();

        // By default 2 days old price is considered stale BUT it may vary per price feed
        // comapred to stable coin feeds this may have different heartbeat
        validateRound(
            roundID1,
            price1,
            updatedAt1,
            answeredInRound1,
            60 * 60 * 24 * 2
        );

        /**
         * Returns the latest price of price feed 2
         */

        (
            uint80 roundID2,
            int256 price2,
            ,
            uint256 updatedAt2,
            uint80 answeredInRound2
        ) = priceFeed2.latestRoundData();

        // By default 2 days old price is considered stale BUT it may vary per price feed
        validateRound(
            roundID2,
            price2,
            updatedAt2,
            answeredInRound2,
            60 * 60 * 24 * 2
        );

        // Always using decimals 18 for derived price feeds
        int cake_BNB = (price2 * (10 ** 18)) / price1;
        return cake_BNB;
    }
}
