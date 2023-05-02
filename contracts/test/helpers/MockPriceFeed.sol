// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

//@review againsnt chainlink reference PriceConverter https://docs.chain.link/docs/get-the-latest-price/
//@review decimals for individual feeds
contract MockPriceFeed {
    AggregatorV3Interface internal priceFeed1;
    AggregatorV3Interface internal priceFeed2;

    constructor() {
        // todo // do not hard code // polygon values
        priceFeed1 = AggregatorV3Interface(
            0xAB594600376Ec9fD91F8e885dADF0CE036862dE0
        ); // matic usd
        priceFeed2 = AggregatorV3Interface(
            0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7
        ); // usdc usd
    }

    function decimals() public view returns (uint8) {
        return 18;
    }

    function getThePrice() public view returns (int) {
        // Always using decimals 18 for derived price feeds
        int usdcMatic = 1043 * 1e15;
        return usdcMatic;
    }
}
