// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./DerivedPriceFeed.sol";

contract DerivedPriceFeedFactory {
    event DerivedPriceFeedDeployed(
        address indexed _feedAddress,
        string indexed description
    );

    // TODO // Might use CREATe2 or CREATE3 way here
    function deployDerivedPriceFeed(
        address _nativeOracleAddress,
        address _tokenOracleAddress,
        string memory _description
    ) external returns (address) {
        DerivedPriceFeed deployedFeed = new DerivedPriceFeed(
            _nativeOracleAddress,
            _tokenOracleAddress,
            _description
        );
        emit DerivedPriceFeedDeployed(address(deployedFeed), _description);
        return address(deployedFeed);
    }
}
