// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0;

import {stdStorage, StdStorage, Test} from "forge-std/Test.sol";
import {Utilities} from "./utils/Utilities.sol";
import {console2} from "forge-std/console2.sol";
import {Vm} from "forge-std/Vm.sol";

import {ChainlinkOracleAggregator} from "../contracts/token/oracles/ChainlinkOracleAggregator.sol";
import {IOracleAggregator} from "../contracts/token/oracles/IOracleAggregator.sol";
import {BiconomyTokenPaymaster} from "../contracts/token/BiconomyTokenPaymaster.sol";
import "./BytesLib.sol";
import "../contracts/test/helpers/TestCounter.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {UserOperation} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import {IStakeManager} from "@account-abstraction/contracts/interfaces/IStakeManager.sol";
import {SmartAccount} from "@biconomy/account-contracts/contracts/smart-contract-wallet/SmartAccount.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {MockToken} from "../contracts/test/helpers/MockToken.sol";
import {MockPriceFeed} from "../contracts/test/helpers/MockPriceFeed.sol";
import {BiconomyAccountImplementation} from "../contracts/test/wallets/BiconomyAccountImpl.sol";
import {BiconomyAccountFactory} from "../contracts/test/wallets/BiconomyAccountFactory.sol";
import {FeedInterface} from "../contracts/token/oracles/FeedInterface.sol";
import {VerifyingSingletonPaymaster} from "../contracts/verifying/VerifyingSingletonPaymaster.sol";

error SetupIncomplete();

using ECDSA for bytes32;

contract SimulationTest is Test {
    using stdStorage for StdStorage;

    function testSimulation() external {
        vm.createSelectFork("https://subnets.avax.network/pgjjtk/testnet/rpc");

        vm.startPrank(0x58006a3BC89Dfc5c60E9433EF7c8dF6023c6805d);

        VerifyingSingletonPaymaster v = VerifyingSingletonPaymaster(
            0x0000064E9C653e373AF18ef27F70bE83dF5476B7
        );

        console2.log(v.getBalance(0x58006a3BC89Dfc5c60E9433EF7c8dF6023c6805d));

        v.depositFor{value: 1 ether}(
            0x58006a3BC89Dfc5c60E9433EF7c8dF6023c6805d
        );
        vm.stopPrank();
    }
}
