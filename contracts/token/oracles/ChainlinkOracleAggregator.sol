// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracleAggregator.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {DerivedPriceFeed} from "./DerivedPriceFeed.sol";
import "hardhat/console.sol";

/**
 * @title Primary Oracle Aggregator contract used to maintain price feeds for chainlink supported tokens.
 */
contract ChainlinkOracleAggregator is Ownable, IOracleAggregator {
    struct TokenInfo {
        /* Number of decimals represents the precision of the price returned by the feed. For example, 
     a price of $100.50 might be represented as 100500000000 in the contract, with 9 decimal places 
     of precision */
        uint8 decimals;
        // uint8 tokenDecimals;
        bool dataSigned;
        address callAddress;
        bytes callData;
    }

    mapping(address => TokenInfo) internal tokensInfo;

    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    /**
     * @dev set price feed information for specific feed
     * @param callAddress price feed / derived price feed address to call
     * @param decimals decimals (precision) defined in this price feed
     * @param callData function selector which will be used to query price data
     * @param signed if the feed may return result as signed integrer
     */
    function setTokenOracle(
        address token,
        address callAddress,
        uint8 decimals,
        bytes calldata callData,
        bool signed
    ) external onlyOwner {
        require(
            callAddress != address(0),
            "ChainlinkOracleAggregator:: call address can not be zero"
        );
        require(
            token != address(0),
            "ChainlinkOracleAggregator:: token address can not be zero"
        );
        tokensInfo[token].callAddress = callAddress;
        tokensInfo[token].decimals = decimals;
        tokensInfo[token].callData = callData;
        tokensInfo[token].dataSigned = signed;
    }

    /**
     * @dev query deciamls used by set feed for specific token
     * @param token ERC20 token address
     */
    function getTokenOracleDecimals(
        address token
    ) external view returns (uint8 _tokenOracleDecimals) {
        _tokenOracleDecimals = tokensInfo[token].decimals;
    }

    /**
     * @dev query price feed
     * @param token ERC20 token address
     */
    function getTokenPrice(
        address token
    ) external view returns (uint256 tokenPrice) {
        // usually token / native (depends on price feed)
        (tokenPrice, ) = _getTokenPriceAndDecimals(token);
    }

    /**
     * @dev exchangeRate : each aggregator implements this method based on how it sources the quote/price
     * @notice here it is token / native sourced from chainlink so in order to get defined exchangeRate we inverse the feed
     * @param token ERC20 token address
     */
    function getTokenValueOfOneNativeToken(
        address token
    ) external view virtual returns (uint256 exchangeRate) {
        // we'd actually want eth / token
        (
            uint256 tokenPriceUnadjusted,
            uint8 tokenOracleDecimals
        ) = _getTokenPriceAndDecimals(token);
        exchangeRate =
            10 ** (tokenOracleDecimals + IERC20Metadata(token).decimals()) /
            tokenPriceUnadjusted;
    }

    function _getTokenPriceAndDecimals(
        address token
    )
        internal
        view
        returns (uint256 tokenPriceUnadjusted, uint8 tokenOracleDecimals)
    {
        // Note // If the callData is for latestAnswer, it could be for latestRoundData and then validateRound and extract price then
        TokenInfo storage tokenInfo = tokensInfo[token];
        tokenOracleDecimals = tokenInfo.decimals;
        // (bool success, bytes memory ret) = tokenInfo.callAddress.staticcall(
        //     tokenInfo.callData
        // );
        // require(success, "ChainlinkOracleAggregator:: query failed");
        // if (tokenInfo.dataSigned) {
        //     tokenPriceUnadjusted = uint256(abi.decode(ret, (int256)));
        // } else {
        //     tokenPriceUnadjusted = abi.decode(ret, (uint256));
        // }
        if (tokenInfo.dataSigned) {
            tokenPriceUnadjusted = uint256(
                DerivedPriceFeed(tokenInfo.callAddress).getThePrice()
            );
        } else {
            // ??
        }
    }
}
