// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracleAggregator.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";

// Uniswap based
// quoter reference : https://soliditydeveloper.com/uniswap3
// more reference: https://tyllen-bicakcic.gitbook.io/fetching-spot-prices/

// WIP
contract UniswapTWAPAggregator is Ownable, IOracleAggregator {
    /// @notice The Uniswap V3 Quoter contract
    IQuoter public immutable quoter;

    mapping(address => UniswapHelperConfig) internal tokensInfo;

    // to be added for all supported tokens
    // fee to be fetched from pool contract
    struct UniswapHelperConfig {
        address poolAddress;
        // uint24 uniswapPoolFee;
        // uint8 slippage;
    }

    constructor(address _owner, address _quoter) {
        _transferOwnership(_owner);
        quoter = IQuoter(_quoter);
    }

    function setTokenOracle(
        address token,
        address poolAddress
    ) external onlyOwner {
        tokensInfo[token].poolAddress = poolAddress;
    }

    // exchangeRate basically
    // if let's say UniswapV3 router can return a quote
    // offchain services would rely on API to provide a quote (1incvh v5.0 / CMC etc)
    function getTokenValueOfOneNativeToken(
        address token
    ) external view virtual returns (uint256 exchangeRate) {
        // we'd actually want eth / token
        exchangeRate = 0;

        // quoter fee from poolAddress

        // prepare data for quoteExactInputSingle

        // for example MATIC / USDC pool https://polygonscan.com/address/0xa374094527e1673a86de625aa59517c5de346d32#readContract
        /*quoteExactInputSingle(
        immutables.token0,  // token0 is WMATIC address
        immutables.token1,  // token1 is USDC address
        immutables.fee,
        amountIn, // token0 is the token that goes as amountIn. 
        0
        )*/

        // callstatic
        // IQuoter(quoter).quoteExactInputSingle
    }
}
