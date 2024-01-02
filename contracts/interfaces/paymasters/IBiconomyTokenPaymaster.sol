// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBiconomyTokenPaymaster {
    /**
     * price source can be off-chain calculation or oracles
     * for oracle based it can be based on chainlink feeds or TWAP oracles
     * for ORACLE_BASED oracle aggregator address has to be passed in paymasterAndData
     */
    enum ExchangeRateSource {
        EXTERNAL_EXCHANGE_RATE,
        ORACLE_BASED
    }

    /**
     * Designed to enable the community to track change in storage variable UNACCOUNTED_COST which is used
     * to maintain gas execution cost which can't be calculated within contract
     */
    event EPGasOverheadChanged(
        uint256 indexed _oldOverheadCost, uint256 indexed _newOverheadCost, address indexed _actor
    );

    /**
     * Designed to enable the community to track change in storage variable verifyingSigner which is used
     * to authorize any operation for this paymaster (validation stage) and provides signature
     */
    event VerifyingSignerChanged(address indexed _oldSigner, address indexed _newSigner, address indexed _actor);

    /**
     * Designed to enable the community to track change in storage variable feeReceiver which is an address (self or other SCW/EOA)
     * responsible for collecting all the tokens being withdrawn as fees
     */
    event FeeReceiverChanged(address indexed _oldfeeReceiver, address indexed _newfeeReceiver, address indexed _actor);

    /**
     * Designed to enable tracking how much fees were charged from the sender and in which ERC20 token
     * More information can be emitted like exchangeRate used, what was the source of exchangeRate etc
     */
    // priceMarkup = Multiplier value to calculate markup, 1e6 means 1x multiplier = No markup
    event TokenPaymasterOperation(
        address indexed sender,
        address indexed token,
        uint256 indexed totalCharge,
        uint32 priceMarkup,
        bytes32 userOpHash,
        uint128 exchangeRate,
        ExchangeRateSource priceSource
    );

    /**
     * Notify in case paymaster failed to withdraw tokens from sender
     */
    event TokenPaymentDue(address indexed token, address indexed account, uint256 indexed charge);

    event Received(address indexed sender, uint256 value);
}
