// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0;

import {stdStorage, StdStorage, Test} from "forge-std/Test.sol";
import {Utilities} from "../../utils/Utilities.sol";
import {console2} from "forge-std/console2.sol";
import {Vm} from "forge-std/Vm.sol";

import {BiconomyTokenPaymaster} from "../../../contracts/token/BiconomyTokenPaymaster.sol";
import {IBiconomyTokenPaymaster} from "../../../contracts/interfaces/paymasters/IBiconomyTokenPaymaster.sol";
import "../../BytesLib.sol";
import "../../../contracts/test/helpers/TestCounter.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {UserOperation} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SmartAccount} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/SmartAccount.sol";
import {EcdsaOwnershipRegistryModule} from
    "@biconomy-devx/account-contracts-v2/contracts/smart-account/modules/EcdsaOwnershipRegistryModule.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {MockToken} from "../../../contracts/test/helpers/MockToken.sol";
import {MockPriceFeed} from "../../../contracts/test/helpers/MockPriceFeed.sol";
import {MockOracle} from "../../../contracts/test/helpers/MockOracle.sol";
import {FeedInterface} from "../../../contracts/token/oracles/FeedInterface.sol";
import {SATestBase} from "../base/SATestBase.sol";

error SetupIncomplete();

using ECDSA for bytes32;

contract TokenPaymasterMumbaiTest is SATestBase {
    SmartAccount public sa;

    uint256 internal keyUser;
    uint256 internal keyVerifyingSigner;

    BiconomyTokenPaymaster public _btpm;
    AggregatorV3Interface public nativeOracle = AggregatorV3Interface(0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada);
    AggregatorV3Interface public tokenOracle = AggregatorV3Interface(0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0);
    IERC20 public usdc = IERC20(0xdA5289fCAAF71d52a80A254da614a192b693e977);
    TestCounter counter;

    function setUp() public virtual override {
        uint256 forkId = vm.createFork("https://polygon-mumbai.g.alchemy.com/v2/zX14dLXhTQqeK4LG2pNUsk7Gcet8iPXJ");
        vm.selectFork(forkId);
        super.setUp();

        console2.log("current block timestamp ", block.timestamp);

        // Deploy Smart Account with default module
        uint256 smartAccountDeploymentIndex = 0;
        bytes memory moduleSetupData = getEcdsaOwnershipRegistryModuleSetupData(alice.addr);
        sa = getSmartAccountWithModule(
            address(ecdsaOwnershipRegistryModule), moduleSetupData, smartAccountDeploymentIndex, "aliceSA"
        );

        keyUser = alice.privateKey;
        keyVerifyingSigner = bob.privateKey;

        _btpm = new BiconomyTokenPaymaster(alice.addr, entryPoint, bob.addr);
        counter = new TestCounter();

        // setting price oracle for token

        vm.startPrank(alice.addr);
        // could also make a .call using selector and handle success
        _btpm.setTokenOracle(
            address(usdc), address(tokenOracle), address(nativeOracle), true, 172800
        );
        vm.stopPrank();

        uint256 priceToLog = _btpm.getTokenValueOfOneNativeToken((address(usdc)));
        console2.log(priceToLog);

        vm.startPrank(charlie.addr);
        entryPoint.depositTo{value: 2 ether}(address(_btpm));
        vm.stopPrank();
    }

    function testDeploy() external {
        BiconomyTokenPaymaster testArtifact = new BiconomyTokenPaymaster(alice.addr, entryPoint, bob.addr);
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
        deal(address(usdc), address(_btpm), _amount);
        vm.startPrank(alice.addr);
        _btpm.withdrawERC20(usdc, dan.addr, _amount);
        assertEq(usdc.balanceOf(address(_btpm)), 0);
        assertEq(usdc.balanceOf(dan.addr), _amount);
        vm.stopPrank();
    }

    function testWithdrawERC20FailNotOwner(uint256 _amount) external {
        vm.assume(_amount < usdc.totalSupply());
        deal(address(usdc), address(_btpm), _amount);
        vm.startPrank(dan.addr);
        vm.expectRevert("Ownable: caller is not the owner");
        _btpm.withdrawERC20(usdc, dan.addr, _amount);
        vm.stopPrank();
    }

    // sanity check for everything works without paymaster
    function testCall() external {
        vm.deal(address(sa), 1e18);
        vm.deal(dan.addr, 1e18);

        bytes memory data =
            getSmartAccountExecuteCalldata(address(counter), 0, abi.encodeWithSelector(TestCounter.count.selector));

        UserOperation memory op = makeEcdsaModuleUserOp(data, sa, 0, alice, bytes(""));
        entryPoint.handleOps(arraifyOps(op), dan.addr);
    }

    // with token paymaster
    function testTokenPaymasterRefund() external {
        vm.deal(address(sa), 1e18);
        deal(address(usdc), address(sa), 100e6);
        deal(address(usdc), address(_btpm), 100e6);
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));

        bytes memory data = getSmartAccountExecuteCalldata(
            address(usdc), 0, abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        UserOperation memory op = makeEcdsaModuleUserOp(data, sa, 0, alice, bytes(""));

        bytes memory pmSig = signPaymasterSignature(op, keyVerifyingSigner);

        IBiconomyTokenPaymaster.ExchangeRateSource priceSource =
            IBiconomyTokenPaymaster.ExchangeRateSource.EXTERNAL_EXCHANGE_RATE;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint128 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm), priceSource, validUntil, validAfter, address(usdc), exchangeRate, priceMarkup, pmSig
        );

        op.signature = signUserOp(op, keyUser);

        entryPoint.handleOps(arraifyOps(op), dan.addr);

        console2.log("paymaster balance after ", usdc.balanceOf(address(_btpm)));
        assertNotEq(usdc.balanceOf(address(sa)), 100e6);
    }

    function testTokenPaymasterFailInvalidPaymasteDataLength() external {
        vm.deal(address(sa), 1e18);
        deal(address(usdc), address(sa), 100e6);
        deal(address(usdc), address(_btpm), 100e6);
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        console2.log("SA token balance before ", usdc.balanceOf(address(sa)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa, keyUser, address(usdc), 0, abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
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
        deal(address(usdc), address(sa), 100e6);
        deal(address(usdc), address(_btpm), 100e6);
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa, keyUser, address(usdc), 0, abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        bytes memory pmSig = "0x1234";
        op.paymasterAndData = abi.encodePacked(address(_btpm), pmSig);
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector, uint256(0), "AA33 reverted: BTPM: Invalid length for paymasterAndData"
            )
        );
        entryPoint.handleOps(ops, dan.addr);
    }

    function testTokenPaymasterFailInvalidPMSignature() external {
        vm.deal(address(sa), 1e18);
        deal(address(usdc), address(sa), 100e6);
        deal(address(usdc), address(_btpm), 100e6);
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa, keyUser, address(usdc), 0, abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );
        bytes memory pmSig =
            "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

        IBiconomyTokenPaymaster.ExchangeRateSource priceSource =
            IBiconomyTokenPaymaster.ExchangeRateSource.EXTERNAL_EXCHANGE_RATE;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint128 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm), priceSource, validUntil, validAfter, address(usdc), exchangeRate, priceMarkup, pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert();
        entryPoint.handleOps(ops, dan.addr);
    }

    function testTokenPaymasterFailWrongPMSignature() external {
        vm.deal(address(sa), 1e18);
        deal(address(usdc), address(sa), 100e6);
        deal(address(usdc), address(_btpm), 100e6);
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa, keyUser, address(usdc), 0, abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        bytes32 hash = keccak256((abi.encodePacked("some message")));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyVerifyingSigner, hash.toEthSignedMessageHash());
        bytes memory pmSig = abi.encodePacked(r, s, v);

        IBiconomyTokenPaymaster.ExchangeRateSource priceSource =
            IBiconomyTokenPaymaster.ExchangeRateSource.EXTERNAL_EXCHANGE_RATE;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint128 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm), priceSource, validUntil, validAfter, address(usdc), exchangeRate, priceMarkup, pmSig
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
        deal(address(usdc), address(sa), 100e6);
        deal(address(usdc), address(_btpm), 100e6);
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            sa, keyUser, address(usdc), 0, abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        IBiconomyTokenPaymaster.ExchangeRateSource priceSource =
            IBiconomyTokenPaymaster.ExchangeRateSource.EXTERNAL_EXCHANGE_RATE;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint128 exchangeRate = 977100;
        uint32 priceMarkup = 2200000;

        bytes32 hash = _btpm.getHash(op, priceSource, validUntil, validAfter, address(usdc), exchangeRate, priceMarkup);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyVerifyingSigner, hash.toEthSignedMessageHash());
        bytes memory pmSig = abi.encodePacked(r, s, v);

        op.paymasterAndData = abi.encodePacked(
            address(_btpm), priceSource, validUntil, validAfter, address(usdc), exchangeRate, priceMarkup, pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector, uint256(0), "AA33 reverted: BTPM: price markup percentage too high"
            )
        );

        entryPoint.handleOps(ops, dan.addr);
    }

    // TODO : move to separate PaymasterTestBase and rename to signTokenPaymasterSignature
    function signPaymasterSignature(UserOperation memory op, uint256 _key) public returns (bytes memory signature) {
        IBiconomyTokenPaymaster.ExchangeRateSource priceSource =
            IBiconomyTokenPaymaster.ExchangeRateSource.EXTERNAL_EXCHANGE_RATE;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint128 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        bytes32 hash = _btpm.getHash(op, priceSource, validUntil, validAfter, address(usdc), exchangeRate, priceMarkup);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, hash.toEthSignedMessageHash());
        signature = abi.encodePacked(r, s, v);
    }
}
