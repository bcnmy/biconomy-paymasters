// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0;

import {stdStorage, StdStorage, Test} from "forge-std/Test.sol";
import {Utilities} from "./utils/Utilities.sol";
import {console} from "forge-std/console.sol";
import {Vm} from "forge-std/Vm.sol";

import {ChainlinkOracleAggregator} from "../contracts/token/oracles/ChainlinkOracleAggregator.sol";
import {IOracleAggregator} from "../contracts/token/oracles/IOracleAggregator.sol";
import {BiconomyTokenPaymaster} from "../contracts/token/BiconomyTokenPaymaster.sol";

import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {MockToken} from "../contracts/test/helpers/MockToken.sol";
import {MockPriceFeed} from "../contracts/test/helpers/MockPriceFeed.sol";
import {BiconomyAccountImplementation} from "../contracts/test/wallets/BiconomyAccountImpl.sol";
import {BiconomyAccountFactory} from "../contracts/test/wallets/BiconomyAccountFactory.sol";
import {FeedInterface} from "../contracts/token/oracles/FeedInterface.sol";


error SetupIncomplete();

contract TokenPaymasterTest is Test {
    using stdStorage for StdStorage;

    Utilities internal utils;
    address payable[] internal users;

    ChainlinkOracleAggregator public _oa1;
    BiconomyTokenPaymaster public  _btpm;
    IEntryPoint public _ep;

    address payable internal alice; // owner
    address payable internal bob; // verifyingSigner
    address payable internal charlie;
    address payable internal walletOwner;
    address payable internal unauthorized;

    MockToken usdc;
    MockPriceFeed usdcMaticFeed;

    BiconomyAccountFactory smartAccountFactory;
    BiconomyAccountImplementation smartAccount;

    function setUp() public {
        utils = new Utilities();
        users = utils.createUsers(5);

        alice = users[0];
        // labels alice's address in call traces as "Alice [<address>]"
        vm.label(alice, "Alice");

        bob = users[1];
        vm.label(bob, "Bob");

        charlie = users[2];
        vm.label(charlie, "Charlie");

        walletOwner = users[3];
        vm.label(walletOwner, "Account Owner");

        address WETH9 = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

         _ep = new EntryPoint();
        _btpm = new BiconomyTokenPaymaster(alice, _ep, bob, WETH9);

         _oa1 = new ChainlinkOracleAggregator(alice);
         usdc = new MockToken();
         usdcMaticFeed = new MockPriceFeed();

         // setting price oracle for token

        bytes memory _data = abi.encodeWithSelector(
            FeedInterface.getThePrice.selector
        );

        vm.prank(alice);

        // could also make a .call using selector and handle success
        _oa1.setTokenOracle(address(usdc), address(usdcMaticFeed), 18, _data, true);

        vm.stopPrank();

        uint priceToLog = _oa1.getTokenValueOfOneNativeToken((address(usdc)));
        console.log(priceToLog); 

        smartAccount = new BiconomyAccountImplementation(_ep);
        smartAccountFactory = new BiconomyAccountFactory(address(smartAccount));

        address accountAddress = smartAccountFactory.deployCounterFactualAccount(walletOwner, 0);
        console.log(" smart account address ", accountAddress);

        // resetting the state
        smartAccount = BiconomyAccountImplementation(payable(accountAddress));

        vm.deal(charlie, 2 ether);
        vm.prank(charlie);

        _ep.depositTo{value: 2 ether}(address(_btpm));

        vm.stopPrank();

        // mint tokens to addresses
        usdc.mint(walletOwner, 100e6);
        usdc.mint(accountAddress, 100e6);
    }

    function testCheckStates() public {
        assertEq(_btpm.owner(),alice);
        assertEq(_btpm.verifyingSigner(),bob);
        assertEq(_btpm.feeReceiver(),address(_btpm));
    }

    function testParsePaymasterData() public {
        string memory paymasterAndData = "0x0987404beb853f24f36c76c3e18adcad7ab44f930100000000000000000000000000000000000000000000000000000000deadbeef00000000000000000000000000000000000000000000000000000000000012340000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000007ed8428288323e8583defc90bfdf2dad91cff88900000000000000000000000000000000000000000000000000000000000d34e300000000000000000000000000000000000000000000000000000000000000001984ae5a976a7eb4ee0292a2fa344721f074ce31a90d3182318bdbcec8b447f55690ffa572e58e1f40e93d3e7060b0a20a8b3493226d269adf3cb4d467e9996d1c";

        /*(
            ExchangeRateSource priceSource,
            uint48 validUntil,
            uint48 validAfter,
            address feeToken,
            address oracleAggregator,
            uint256 exchangeRate,
            uint256 fee,
            bytes calldata signature
        ) = _btpm.parsePaymasterAndData((paymasterAndData));*/
    }
 }
