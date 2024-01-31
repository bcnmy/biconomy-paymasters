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
        bool isDerivedFeed
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
        TokenInfo storage tokenInfo = tokensInfo[token];
        tokenDecimals = tokenInfo.tokenDecimals;

        if (tokenInfo.isDerivedFeed) {
            (uint256 price1, bool isError1) = fetchPrice(FeedInterface(tokenInfo.nativeOracle));
            (uint256 price2, bool isError2) = fetchPrice(FeedInterface(tokenInfo.tokenOracle));
            isError = isError1 || isError2;
            if (isError) return (0, 0, 0, isError);
            tokenPrice = (price2 * (10 ** 18)) / price1;
            tokenOracleDecimals = 18;
        } else {
            (tokenPrice, isError) = fetchPrice(FeedInterface(tokenInfo.tokenOracle));
            tokenOracleDecimals = FeedInterface(tokenInfo.tokenOracle).decimals();
        }
    }

    /**
     * @dev This function is used to get the latest price from the tokenOracle or nativeOracle.
     * @notice Fetches the latest price from the given Oracle.
     * @param _oracle The Oracle contract to fetch the price from.
     * @return price The latest price fetched from the Oracle.
     */
    function fetchPrice(FeedInterface _oracle) internal view returns (uint256 price, bool isError) {
        try _oracle.latestRoundData() returns (
            uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
        ) {
            // validateRound
            if (answer <= 0) return (0, true);
            // 2 days old price is considered stale since the price is updated every 24 hours
            if (updatedAt < block.timestamp - 60 * 60 * 24 * 2) return (0, true);
            if (answeredInRound < roundId) return (0, true);
            price = uint256(answer);
            return (price, false);
        } catch Error(string memory reason) {
            return (0, true);
        } catch {
            return (0, true);
        }
    }
}
