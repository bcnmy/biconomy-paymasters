// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracleAggregator.sol";
import "./IPriceOracle.sol";
import "./FeedInterface.sol";

abstract contract OracleAggregator is Ownable, IOracleAggregator {

    error MismatchInBaseAndQuoteDecimals();

     struct TokenInfo {
        uint8 tokenDecimals;
        address tokenOracle;
        address nativeOracle;
        bool isDerivedFeed;
     }

     mapping(address => TokenInfo) internal tokensInfo;

     constructor(address _owner) {
        _transferOwnership(_owner);
    }

    function setTokenOracle(
        address token,
        uint8 tokenDecimals,
        address tokenOracle,
        address nativeOracle,
        bool isDerivedFeed
    ) external onlyOwner {
        require(
            tokenOracle != address(0),
            "feed address can not be zero"
        );
        require(
            nativeOracle != address(0),
            "feed address can not be zero"
        );
        require(
            token != address(0),
            "token address can not be zero"
        );
        tokensInfo[token].tokenOracle = tokenOracle;
        tokensInfo[token].nativeOracle = nativeOracle;
        tokensInfo[token].tokenDecimals = tokenDecimals;
        tokensInfo[token].isDerivedFeed = isDerivedFeed;
    }

    /**
     * @dev exchangeRate : each aggregator implements this method based on how it sources the quote/price
     * @notice here it is token / native sourced from chainlink so in order to get defined exchangeRate we inverse the feed
     * @param token ERC20 token address
     */
    function getTokenValueOfOneNativeToken(
        address token
    ) public view returns (uint256 exchangeRate) {
        // we'd actually want eth / token
        (
            uint256 tokenPrice,
            uint8 tokenOracleDecimals,
            uint8 tokenDecimals
        ) = _getTokenPriceAndDecimals(token);
        exchangeRate =
            10 ** (tokenOracleDecimals + tokenDecimals) /
            tokenPrice;
    }

    function _getTokenPriceAndDecimals(
        address token
    )
        internal
        view
        returns (uint256 tokenPrice, uint8 tokenOracleDecimals, uint8 tokenDecimals)
    {
        TokenInfo storage tokenInfo = tokensInfo[token];
        tokenDecimals = tokenInfo.tokenDecimals;

        if (tokenInfo.isDerivedFeed) {
            //uint8 decimals1 = FeedInterface(tokenInfo.nativeOracle).decimals();
            //uint8 decimals2 = FeedInterface(tokenInfo.tokenOracle).decimals();
            //if (decimals1 != decimals2) revert MismatchInBaseAndQuoteDecimals();

            uint256 price1 = fetchPrice(IPriceOracle(tokenInfo.nativeOracle));

            uint256 price2 = fetchPrice(IPriceOracle(tokenInfo.tokenOracle));

            tokenPrice = (price2 * (10 ** 18)) / price1;
            tokenOracleDecimals = 18;
        } else {
             tokenPrice = 
                fetchPrice(IPriceOracle(tokenInfo.tokenOracle));
             tokenOracleDecimals = FeedInterface(tokenInfo.tokenOracle).decimals();
        }
    }

     /// @notice Fetches the latest price from the given Oracle.
    /// @dev This function is used to get the latest price from the tokenOracle or nativeOracle.
    /// @param _oracle The Oracle contract to fetch the price from.
    /// @return price The latest price fetched from the Oracle.
    function fetchPrice(IPriceOracle _oracle) internal view returns (uint256 price) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = _oracle.latestRoundData();
        require(answer > 0, "BTPM: Chainlink price <= 0");
        // 2 days old price is considered stale since the price is updated every 24 hours
        require(
            updatedAt >= block.timestamp - 60 * 60 * 24 * 2,
            "BTPM: Incomplete round"
        );
        require(answeredInRound >= roundId, "BTPM: Stale price");
        price = uint256(answer);
    }    
}