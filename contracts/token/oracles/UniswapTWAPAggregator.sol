// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracleAggregator.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// Uniswap based
// quoter reference : https://soliditydeveloper.com/uniswap3
// more reference: https://tyllen-bicakcic.gitbook.io/fetching-spot-prices/

error WrongPoolProvided();
error ExchangeRateQueryFailed();

// WIP
contract UniswapTWAPAggregator is Ownable, IOracleAggregator {
    using Address for address;

    /// @notice The Uniswap V3 Quoter contract
    IQuoter public immutable quoter;

    /// @notice The ERC-20 token that wraps the native asset for current chain
    address public immutable wrappedNative;

    address private constant NATIVE_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // For tokens which do not have a direct pool as wrapped asset / token on uniswap we fix the fee as 500
    // Owner may allow this with fixed fee passed to Quoter as the quoter doesn't care about the pool
    bool internal allowFixedFee = false;

    struct TokenInfo {
        address poolAddress;
        uint24 uniswapPoolFee;
    }

    mapping(address => TokenInfo) public tokensInfo;

    constructor(address _owner, address _quoter, address _weth) {
        require(
            _quoter != address(0),
            "UniswapTWAPAggregator:: quoter address can not be zero"
        );
        require(
            _weth != address(0),
            "UniswapTWAPAggregator:: wrapped native token address can not be zero"
        );
        _transferOwnership(_owner);
        quoter = IQuoter(_quoter);
        wrappedNative = _weth;
    }

    function setAllowFixedPoolFee(bool _flag) external onlyOwner {
        allowFixedFee = _flag;
    }

    function setTokenOracle(
        address token,
        address poolAddress
    ) external onlyOwner {
        if (poolAddress == NATIVE_ADDRESS) {
            tokensInfo[token].poolAddress = NATIVE_ADDRESS;
            tokensInfo[token].uniswapPoolFee = 500;
        } else {
            tokensInfo[token].poolAddress = poolAddress;
            address token0 = IUniswapV3Pool(poolAddress).token0();
            address token1 = IUniswapV3Pool(poolAddress).token1();
            // one of them should be wrapped native token
            if (token0 == wrappedNative || token1 == wrappedNative) {
                uint24 fee = IUniswapV3Pool(poolAddress).fee();
                tokensInfo[token].uniswapPoolFee = fee;
            } else {
                revert WrongPoolProvided();
            }
        }
    }

    function getTokenValueOfOneNativeToken(
        address token
    ) external view virtual returns (uint256 exchangeRate) {
        // we'd actually want eth / token
        exchangeRate = 0;

        uint24 poolFee = tokensInfo[token].uniswapPoolFee;
        address poolAddress = tokensInfo[token].poolAddress;
        require(
            poolFee != 0,
            "UniswapTWAPAggregator: token and pool fee not set"
        );
        if (poolAddress == NATIVE_ADDRESS) {
            require(
                allowFixedFee,
                "UniswapTWAPAggregator: Shall not proceed with unreliable pool fee"
            );
        }

        // prepare data for quoteExactInputSingle
        bytes memory _data = abi.encodeWithSelector(
            IQuoter.quoteExactInputSingle.selector,
            wrappedNative,
            token,
            poolFee,
            1e18, // always considering wrapped asset decimals 18 // otherwise use ERC20MetaData
            0
        );
        (bool success, bytes memory returndata) = address(quoter).staticcall(
            _data
        );

        // Todo : review
        // https://polygonscan.com/address/0x090117C290aE39ac6Da716717b62f5C44e81926C
        // Quoter: https://polygonscan.com/address/0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6#code
        // https://dashboard.tenderly.co/yashasvi/project/tx/polygon/0xf4137fb19d8249f5d97d8eb90628165645865456e3a6143d44eb8a913d5ff2b1
        exchangeRate = abi.decode(returndata, (uint256));
    }
}
