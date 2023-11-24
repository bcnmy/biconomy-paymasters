// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0;

import {stdStorage, StdStorage, Test} from "forge-std/Test.sol";
import {Utilities} from "../../utils/Utilities.sol";
import {console2} from "forge-std/console2.sol";
import {Vm} from "forge-std/Vm.sol";

import {ChainlinkOracleAggregator} from "../../../contracts/token/oracles/ChainlinkOracleAggregator.sol";
import {IOracleAggregator} from "../../../contracts/token/oracles/IOracleAggregator.sol";
import {BiconomyTokenPaymaster} from "../../../contracts/token/BiconomyTokenPaymaster.sol";
import "../../BytesLib.sol";
import "../../../contracts/test/helpers/TestCounter.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {UserOperation} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SmartAccount} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/SmartAccount.sol";
import {EcdsaOwnershipRegistryModule} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/modules/EcdsaOwnershipRegistryModule.sol";


import {MockToken} from "../../../contracts/test/helpers/MockToken.sol";
import {MockPriceFeed} from "../../../contracts/test/helpers/MockPriceFeed.sol";
import {FeedInterface} from "../../../contracts/token/oracles/FeedInterface.sol";
import {SATestBase} from "../base/SATestBase.sol";

error SetupIncomplete();

using ECDSA for bytes32;

contract TokenPaymasterTest is SATestBase {
    SmartAccount sa;

    uint256 internal keyUser;
    uint256 internal keyVerifyingSigner;

    ChainlinkOracleAggregator public _oa1;
    BiconomyTokenPaymaster public _btpm;
    MockToken usdc;
    MockPriceFeed usdcMaticFeed;
    TestCounter counter;

    function setUp() public virtual override {
        super.setUp();

        // Deploy Smart Account with default module
        uint256 smartAccountDeploymentIndex = 0;
        bytes memory moduleSetupData = getEcdsaOwnershipRegistryModuleSetupData(
            alice.addr
        );
        sa = getSmartAccountWithModule(
            address(ecdsaOwnershipRegistryModule),
            moduleSetupData,
            smartAccountDeploymentIndex,
            "aliceSA"
        );

        keyUser = alice.privateKey;
        keyVerifyingSigner = bob.privateKey;

        _btpm = new BiconomyTokenPaymaster(alice.addr, entryPoint, bob.addr);
        _oa1 = new ChainlinkOracleAggregator(alice.addr);
        usdc = new MockToken();
        usdcMaticFeed = new MockPriceFeed();
        counter = new TestCounter();

        // setting price oracle for token
        bytes memory _data = abi.encodeWithSelector(
            FeedInterface.getThePrice.selector
        );

        vm.prank(alice.addr);
        // could also make a .call using selector and handle success
        _oa1.setTokenOracle(
            address(usdc),
            address(usdcMaticFeed),
            18,
            _data
        );

        uint256 priceToLog = _oa1.getTokenValueOfOneNativeToken(
            (address(usdc))
        );
        console2.log(priceToLog);

        address accountAddress = address(sa);

        vm.prank(charlie.addr);
        entryPoint.depositTo{value: 2 ether}(address(_btpm));

        // mint tokens to addresses
        usdc.mint(charlie.addr, 100e6);
        usdc.mint(accountAddress, 100e6);
        vm.warp(1680509051);
    }

    function testDeploy() external {
        BiconomyTokenPaymaster testArtifact = new BiconomyTokenPaymaster(
            alice.addr,
            entryPoint,
            bob.addr
        );
        assertEq(address(testArtifact.owner()), address(alice.addr));
        assertEq(address(testArtifact.entryPoint()), address(entryPoint));
        assertEq(address(testArtifact.verifyingSigner()), address(bob.addr));
        assertEq(address(testArtifact.feeReceiver()), address(testArtifact));
    }

    function testCheckStates() public {
        assertEq(_btpm.owner(), alice.addr);
        assertEq(_btpm.verifyingSigner(), bob.addr);
        assertEq(_btpm.feeReceiver(), address(_btpm));
    }

    function testOwnershipTransfer() external {
        vm.startPrank(alice.addr);
        assertEq(_btpm.owner(), alice.addr);
        _btpm.transferOwnership(dan.addr);
        assertEq(_btpm.owner(), dan.addr);
        vm.stopPrank();
    }

    function testWithdrawERC20(uint256 _amount) external {
        vm.assume(_amount < usdc.totalSupply());
        usdc.mint(address(_btpm), _amount);
        vm.startPrank(alice.addr);
        _btpm.withdrawERC20(usdc, dan.addr, _amount);
        assertEq(usdc.balanceOf(address(_btpm)), 0);
        assertEq(usdc.balanceOf(dan.addr), _amount);
        vm.stopPrank();
    }

    function testWithdrawERC20FailNotOwner(uint256 _amount) external {
        vm.assume(_amount < usdc.totalSupply());
        usdc.mint(address(_btpm), _amount);
        vm.startPrank(dan.addr);
        vm.expectRevert("Ownable: caller is not the owner");
        _btpm.withdrawERC20(usdc, dan.addr, _amount);
        vm.stopPrank();
    }

    // sanity check for everything works without paymaster
    function testCall() external {
        vm.deal(address(sa), 1e18);

         bytes memory data = getSmartAccountExecuteCalldata(
            address(counter),
            0,
            abi.encodeWithSelector(TestCounter.count.selector)
        );

        UserOperation memory op = makeEcdsaModuleUserOp(
            data,
            sa,
            0,
            alice,
            bytes("")
        );
        entryPoint.handleOps(arraifyOps(op), dan.addr);
    }

    // with token paymaster
    function testTokenPaymasterRefund() external {
        vm.deal(address(sa), 1e18);
        usdc.mint(address(sa), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log(
            "paymaster balance before ",
            usdc.balanceOf(address(_btpm))
        );

        bytes memory data = getSmartAccountExecuteCalldata(
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        UserOperation memory op = makeEcdsaModuleUserOp(
            data,
            sa,
            0,
            alice,
            bytes("")
        );

        bytes memory pmSig = signPaymasterSignature(op, keyVerifyingSigner);

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster
                .ExchangeRateSource
                .ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(
                validUntil,
                validAfter,
                address(usdc),
                address(_oa1),
                exchangeRate,
                priceMarkup
            ),
            pmSig
        );

        op.signature = signUserOp(op, keyUser);


        entryPoint.handleOps(arraifyOps(op), dan.addr);

        // todo // review fails to validate updated balances
        console2.log(
            "paymaster balance after ",
            usdc.balanceOf(address(_btpm))
        );
        assertNotEq(usdc.balanceOf(address(sa)), 100e6);
    }

    function testTokenPaymasterFailInvalidPaymasteDataLength() external {
        vm.deal(address(sa), 1e18);
        usdc.mint(address(sa), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log(
            "paymaster balance before ",
            usdc.balanceOf(address(_btpm))
        );
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        op.paymasterAndData = "0x1234";
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert("AA93 invalid paymasterAndData");
        entryPoint.handleOps(ops, dan.addr);
    }

    function test2TokenPaymasterFailInvalidPaymasteDataLength() external {
        vm.deal(address(sa), 1e18);
        usdc.mint(address(sa), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log(
            "paymaster balance before ",
            usdc.balanceOf(address(_btpm))
        );
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        bytes memory pmSig = "0x1234";
        op.paymasterAndData = abi.encodePacked(address(_btpm), pmSig);
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector,
                uint256(0),
                "AA33 reverted: BTPM: Invalid length for paymasterAndData"
            )
        );
        entryPoint.handleOps(ops, dan.addr);
    }

    function testTokenPaymasterFailInvalidPMSignature() external {
        vm.deal(address(sa), 1e18);
        usdc.mint(address(sa), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log(
            "paymaster balance before ",
            usdc.balanceOf(address(_btpm))
        );
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );
        bytes
            memory pmSig = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster
                .ExchangeRateSource
                .ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(
                validUntil,
                validAfter,
                address(usdc),
                address(_oa1),
                exchangeRate,
                priceMarkup
            ),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert();
        entryPoint.handleOps(ops, dan.addr);
    }

    function testTokenPaymasterFailWrongPMSignature() external {
        vm.deal(address(sa), 1e18);
        usdc.mint(address(sa), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log(
            "paymaster balance before ",
            usdc.balanceOf(address(_btpm))
        );
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        bytes32 hash = keccak256((abi.encodePacked("some message")));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            keyVerifyingSigner,
            hash.toEthSignedMessageHash()
        );
        bytes memory pmSig = abi.encodePacked(r, s, v);

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster
                .ExchangeRateSource
                .ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(
                validUntil,
                validAfter,
                address(usdc),
                address(_oa1),
                exchangeRate,
                priceMarkup
            ),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert();
        // TODO // Review why below doesn't capture while it does in hardhat test and in above tests
        // vm.expectRevert("AA34 signature error");
        entryPoint.handleOps(ops, dan.addr);
    }

    function testTokenPaymasterFailHighPriceMarkup() external {
        vm.deal(address(sa), 1e18);
        usdc.mint(address(sa), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log(
            "paymaster balance before ",
            usdc.balanceOf(address(_btpm))
        );
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster
                .ExchangeRateSource
                .ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 2200000;

        bytes32 hash = _btpm.getHash(
            op,
            priceSource,
            validUntil,
            validAfter,
            address(usdc),
            address(_oa1),
            exchangeRate,
            priceMarkup
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            keyVerifyingSigner,
            hash.toEthSignedMessageHash()
        );
        bytes memory pmSig = abi.encodePacked(r, s, v);

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(
                validUntil,
                validAfter,
                address(usdc),
                address(_oa1),
                exchangeRate,
                priceMarkup
            ),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector,
                uint256(0),
                "AA33 reverted: BTPM: price markup percentage too high"
            )
        );

        entryPoint.handleOps(ops, dan.addr);
    }

    // TODO : move to separate PaymasterTestBase and rename to signTokenPaymasterSignature
    function signPaymasterSignature(
        UserOperation memory op,
        uint256 _key
    ) public returns (bytes memory signature) {
        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster
                .ExchangeRateSource
                .ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        bytes32 hash = _btpm.getHash(
            op,
            priceSource,
            validUntil,
            validAfter,
            address(usdc),
            address(_oa1),
            exchangeRate,
            priceMarkup
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            _key,
            hash.toEthSignedMessageHash()
        );
        signature = abi.encodePacked(r, s, v);
    }
}
