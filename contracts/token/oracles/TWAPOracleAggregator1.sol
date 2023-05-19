// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracleAggregator.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract TWAPOracleAggregator is Ownable, IOracleAggregator {
    // WIP

    function getTokenPrice(
        address token
    ) external view returns (uint256 tokenPrice) {
        tokenPrice = 0;
    }

    // exchangeRate basically
    // if let's say UniswapV3 router can return a quote
    // offchain services would rely on API to provide a quote (1incvh v5.0 / CMC etc)
    function getTokenValueOfOneEth(
        address token
    ) external view virtual returns (uint256 exchangeRate) {
        // we'd actually want eth / token
        exchangeRate = 0;
    }
}
