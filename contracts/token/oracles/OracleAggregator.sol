// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracleAggregator.sol";
import "./FeedInterface.sol";

abstract contract OracleAggregator is Ownable, IOracleAggregator {
    mapping(address => TokenInfo) internal tokensInfo;

    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    function setTokenOracle(
        address token,
        uint8 tokenDecimals,
        address tokenOracle,
        address nativeOracle,
        bool isDerivedFeed,
        uint24 priceUpdateThreshold
    ) external onlyOwner {
        if (tokenOracle == address(0)) revert OracleAddressCannotBeZero();
        if (nativeOracle == address(0)) revert OracleAddressCannotBeZero();
        require(token != address(0), "token address can not be zero");
        uint8 decimals1 = FeedInterface(nativeOracle).decimals();
        uint8 decimals2 = FeedInterface(tokenOracle).decimals();
        if (decimals1 != decimals2) revert MismatchInBaseAndQuoteDecimals();
        tokensInfo[token].tokenOracle = tokenOracle;
        tokensInfo[token].nativeOracle = nativeOracle;
        tokensInfo[token].tokenDecimals = tokenDecimals;
        tokensInfo[token].isDerivedFeed = isDerivedFeed;
        tokensInfo[token].priceUpdateThreshold = priceUpdateThreshold;
    }

    /**
     * @dev exchangeRate : each aggregator implements this method based on how it sources the quote/price
     * @notice here it is token / native sourced from chainlink so in order to get defined exchangeRate we inverse the feed
     * @param token ERC20 token address
     * @return exchangeRate : token price wrt native token
     */
    function getTokenValueOfOneNativeToken(address token) public view returns (uint128 exchangeRate) {
        // we'd actually want eth / token
        (uint256 tokenPrice, uint8 tokenOracleDecimals, uint8 tokenDecimals, bool isError) =
            _getTokenPriceAndDecimals(token);
        if (isError) return 0;
        exchangeRate = uint128(10 ** (tokenOracleDecimals + tokenDecimals) / tokenPrice);
    }

    function _getTokenPriceAndDecimals(address token)
        internal
        view
        returns (uint256 tokenPrice, uint8 tokenOracleDecimals, uint8 tokenDecimals, bool isError)
    {
        TokenInfo memory tokenInfo = tokensInfo[token];
        tokenDecimals = tokenInfo.tokenDecimals;
        uint24 priceUpdateThreshold = tokenInfo.priceUpdateThreshold;

        if (tokenInfo.isDerivedFeed) {
            (uint256 price1, bool isError1) = fetchPrice(FeedInterface(tokenInfo.nativeOracle), priceUpdateThreshold);
            (uint256 price2, bool isError2) = fetchPrice(FeedInterface(tokenInfo.tokenOracle), priceUpdateThreshold);
            isError = isError1 || isError2;
            if (isError) return (0, 0, 0, isError);
            tokenPrice = (price2 * (10 ** 18)) / price1;
            tokenOracleDecimals = 18;
        } else {
            (tokenPrice, isError) = fetchPrice(FeedInterface(tokenInfo.tokenOracle), priceUpdateThreshold);
            tokenOracleDecimals = FeedInterface(tokenInfo.tokenOracle).decimals();
        }
    }

    /**
     * @dev This function is used to get the latest price from the tokenOracle or nativeOracle.
     * @notice Fetches the latest price from the given Oracle.
     * @param _oracle The Oracle contract to fetch the price from.
     * @param _priceUpdateThreshold The time after which the price is considered stale.
     * @return price The latest price fetched from the Oracle.
     */
    function fetchPrice(FeedInterface _oracle, uint24 _priceUpdateThreshold) internal view returns (uint256 price, bool isError) {
        try _oracle.latestRoundData() returns (
            uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
        ) {
            // validateRound
            if (answer <= 0) return (0, true);
            // price older than set _priceUpdateThreshold is considered stale
            // _priceUpdateThreshold for oracle feed is usually heartbeat interval + block time + buffer
            if (updatedAt < block.timestamp - _priceUpdateThreshold) return (0, true);
            price = uint256(answer);
            return (price, false);
        } catch Error(string memory reason) {
            return (0, true);
        } catch {
            return (0, true);
        }
    }
}
