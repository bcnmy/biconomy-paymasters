// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockOracle is AggregatorV3Interface {
    uint256 internal priceToReturn;
    string internal desc;

    constructor(uint256 _fixedPrice, string memory _description) {
        priceToReturn = _fixedPrice;
        desc = _description;
    }

    function decimals() public view returns (uint8) {
        return 8;
    }

    function description() public view returns (string memory) {
        return desc;
    }

    function version() public view returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId)
        public
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        roundId = _roundId;
        answer = int256(priceToReturn);
        startedAt = 0;
        updatedAt = 0;
        answeredInRound = 0;
    }

    function latestRoundData()
        public
        view
        virtual
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        roundId = 36893488147419318063;
        answer = int256(priceToReturn);
        startedAt = 1780336251;
        updatedAt = 1780509051;
        answeredInRound = 36893488147419318063;
    }
}
