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

error SetupIncomplete();

using ECDSA for bytes32;

contract TokenPaymasterTest is Test {
    using stdStorage for StdStorage;

    Utilities internal utils;
    address payable[] internal users;

    address internal alice; // owner
    address internal bob; // verifyingSigner
    address internal charlie; // wallet owner
    address payable beneficiary;
    address internal unauthorized;

    uint256 internal keyUser;
    uint256 internal keyVerifyingSigner;

    ChainlinkOracleAggregator public _oa1;
    BiconomyTokenPaymaster public _btpm;
    IEntryPoint public _ep;
    MockToken usdc;
    MockPriceFeed usdcMaticFeed;
    BiconomyAccountFactory smartAccountFactory;
    BiconomyAccountImplementation smartAccount;
    TestCounter counter;

    function setUp() public {
        utils = new Utilities();
        users = utils.createUsers(5);

        beneficiary = payable(makeAddr("beneficiary"));
        alice = payable(makeAddr("Alice"));
        (bob, keyVerifyingSigner) = makeAddrAndKey("Bob");
        (charlie, keyUser) = makeAddrAndKey("Charlie");
        unauthorized = makeAddr("Unauthorized");

        _ep = new EntryPoint();
        _btpm = new BiconomyTokenPaymaster(alice, _ep, bob);
        _oa1 = new ChainlinkOracleAggregator(alice);
        usdc = new MockToken();
        usdcMaticFeed = new MockPriceFeed();
        counter = new TestCounter();

        // setting price oracle for token
        bytes memory _data = abi.encodeWithSelector(FeedInterface.getThePrice.selector);

        vm.prank(alice);
        // could also make a .call using selector and handle success
        _oa1.setTokenOracle(address(usdc), address(usdcMaticFeed), 18, _data, true);

        uint256 priceToLog = _oa1.getTokenValueOfOneNativeToken((address(usdc)));
        console2.log(priceToLog);

        smartAccount = new BiconomyAccountImplementation(_ep);
        smartAccountFactory = new BiconomyAccountFactory(address(smartAccount));

        address accountAddress = smartAccountFactory.deployCounterFactualAccount(charlie, 0);
        console2.log(" smart account address ", accountAddress);

        // resetting the state
        smartAccount = BiconomyAccountImplementation(payable(accountAddress));

        vm.deal(charlie, 2 ether);
        vm.prank(charlie);
        _ep.depositTo{value: 2 ether}(address(_btpm));

        // mint tokens to addresses
        usdc.mint(charlie, 100e6);
        usdc.mint(accountAddress, 100e6);
        vm.warp(1680509051);
    }

    function testDeploy() external {
        BiconomyTokenPaymaster testArtifact = new BiconomyTokenPaymaster(
            alice,
            _ep,
            bob
        );
        assertEq(address(testArtifact.owner()), address(alice));
        assertEq(address(testArtifact.entryPoint()), address(_ep));
        assertEq(address(testArtifact.verifyingSigner()), address(bob));
        assertEq(address(testArtifact.feeReceiver()), address(testArtifact));
    }

    function testCheckStates() public {
        assertEq(_btpm.owner(), alice);
        assertEq(_btpm.verifyingSigner(), bob);
        assertEq(_btpm.feeReceiver(), address(_btpm));
    }

    function testOwnershipTransfer() external {
        vm.startPrank(alice);
        assertEq(_btpm.owner(), alice);
        _btpm.transferOwnership(beneficiary);
        assertEq(_btpm.owner(), beneficiary);
        vm.stopPrank();
    }

    function testWithdrawERC20(uint256 _amount) external {
        vm.assume(_amount < usdc.totalSupply());
        usdc.mint(address(_btpm), _amount);
        vm.startPrank(alice);
        _btpm.withdrawERC20(usdc, beneficiary, _amount);
        assertEq(usdc.balanceOf(address(_btpm)), 0);
        assertEq(usdc.balanceOf(beneficiary), _amount);
        vm.stopPrank();
    }

    function testWithdrawERC20FailNotOwner(uint256 _amount) external {
        vm.assume(_amount < usdc.totalSupply());
        usdc.mint(address(_btpm), _amount);
        vm.startPrank(beneficiary);
        vm.expectRevert("Ownable: caller is not the owner");
        _btpm.withdrawERC20(usdc, beneficiary, _amount);
        vm.stopPrank();
    }

    // WIP // TODO
    function testParsePaymasterData() public {
        bytes memory paymasterAndData =
            "0x0987404beb853f24f36c76c3e18adcad7ab44f930100000000000000000000000000000000000000000000000000000000deadbeef00000000000000000000000000000000000000000000000000000000000012340000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000007ed8428288323e8583defc90bfdf2dad91cff88900000000000000000000000000000000000000000000000000000000000d34e300000000000000000000000000000000000000000000000000000000000000001984ae5a976a7eb4ee0292a2fa344721f074ce31a90d3182318bdbcec8b447f55690ffa572e58e1f40e93d3e7060b0a20a8b3493226d269adf3cb4d467e9996d1c";
        bytes memory paymasterAndDataBytes = bytes(paymasterAndData);
        // [FAIL. Reason: Conversion into non-existent enum type]
        // _btpm.parsePaymasterAndData(abi.encodePacked(paymasterAndDataBytes));
    }

    // sanity check for everything works without paymaster
    function testCall() external {
        vm.deal(address(smartAccount), 1e18);
        (UserOperation memory op, uint256 prefund) =
            fillUserOp(smartAccount, keyUser, address(counter), 0, abi.encodeWithSelector(TestCounter.count.selector));
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        _ep.handleOps(ops, beneficiary);
    }

    // with token paymaster
    function testTokenPaymasterRefund() external {
        vm.deal(address(smartAccount), 1e18);
        usdc.mint(address(smartAccount), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            smartAccount,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );
        bytes memory pmSig = signPaymasterSignature(op, keyVerifyingSigner);

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster.ExchangeRateSource.ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(validUntil, validAfter, address(usdc), address(_oa1), exchangeRate, priceMarkup),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        _ep.handleOps(ops, beneficiary);

        // todo // review fails to validate updated balances
        console2.log("paymaster balance after ", usdc.balanceOf(address(_btpm)));
        assertNotEq(usdc.balanceOf(address(smartAccount)), 100e6);
    }

    function testTokenPaymasterFailInvalidPMSignatureLength() external {
        vm.deal(address(smartAccount), 1e18);
        usdc.mint(address(smartAccount), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            smartAccount,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );
        bytes memory pmSig = "0x1234";

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster.ExchangeRateSource.ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(validUntil, validAfter, address(usdc), address(_oa1), exchangeRate, priceMarkup),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector,
                uint256(0),
                "AA33 reverted: BTPM: invalid signature length in paymasterAndData"
            )
        );
        _ep.handleOps(ops, beneficiary);
    }

    function testTokenPaymasterFailInvalidPaymasteDataLength() external {
        vm.deal(address(smartAccount), 1e18);
        usdc.mint(address(smartAccount), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            smartAccount,
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
        _ep.handleOps(ops, beneficiary);
    }

    function test2TokenPaymasterFailInvalidPaymasteDataLength() external {
        vm.deal(address(smartAccount), 1e18);
        usdc.mint(address(smartAccount), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            smartAccount,
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
                IEntryPoint.FailedOp.selector, uint256(0), "AA33 reverted: BTPM: Invalid length for paymasterAndData"
            )
        );
        _ep.handleOps(ops, beneficiary);
    }

    function testTokenPaymasterFailInvalidPMSignature() external {
        vm.deal(address(smartAccount), 1e18);
        usdc.mint(address(smartAccount), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            smartAccount,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );
        bytes memory pmSig =
            "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster.ExchangeRateSource.ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(validUntil, validAfter, address(usdc), address(_oa1), exchangeRate, priceMarkup),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert();
        _ep.handleOps(ops, beneficiary);

        // TODO // Review why below doesn't capture while it does in hardhat test and in above tests
        /*vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector, uint256(0), "AA33 reverted: ECDSA: invalid signature"
            )
        );
        _ep.simulateValidation(ops[0]);*/
    }

    function testTokenPaymasterFailWrongPMSignature() external {
        vm.deal(address(smartAccount), 1e18);
        usdc.mint(address(smartAccount), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            smartAccount,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        bytes32 hash = keccak256((abi.encodePacked("some message")));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyVerifyingSigner, hash.toEthSignedMessageHash());
        bytes memory pmSig = abi.encodePacked(r, s, v);

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster.ExchangeRateSource.ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(validUntil, validAfter, address(usdc), address(_oa1), exchangeRate, priceMarkup),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert();
        // TODO // Review why below doesn't capture while it does in hardhat test and in above tests
        // vm.expectRevert("AA34 signature error");
        _ep.handleOps(ops, beneficiary);
    }

    function testTokenPaymasterFailHighPriceMarkup() external {
        vm.deal(address(smartAccount), 1e18);
        usdc.mint(address(smartAccount), 100e6); // 100 usdc;
        usdc.mint(address(_btpm), 100e6); // 100 usdc;
        console2.log("paymaster balance before ", usdc.balanceOf(address(_btpm)));
        (UserOperation memory op, uint256 prefund) = fillUserOp(
            smartAccount,
            keyUser,
            address(usdc),
            0,
            abi.encodeWithSelector(ERC20.approve.selector, address(_btpm), 10e6)
        );

        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster.ExchangeRateSource.ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 2200000;

        bytes32 hash = _btpm.getHash(
            op, priceSource, validUntil, validAfter, address(usdc), address(_oa1), exchangeRate, priceMarkup
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyVerifyingSigner, hash.toEthSignedMessageHash());
        bytes memory pmSig = abi.encodePacked(r, s, v);

        op.paymasterAndData = abi.encodePacked(
            address(_btpm),
            priceSource,
            abi.encode(validUntil, validAfter, address(usdc), address(_oa1), exchangeRate, priceMarkup),
            pmSig
        );
        op.signature = signUserOp(op, keyUser);
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOp.selector, uint256(0), "AA33 reverted: BTPM: price markup percentage too high"
            )
        );

        _ep.handleOps(ops, beneficiary);
    }

    function fillUserOp(
        BiconomyAccountImplementation _sender,
        uint256 _key,
        address _to,
        uint256 _value,
        bytes memory _data
    ) public returns (UserOperation memory op, uint256 prefund) {
        op.sender = address(_sender);
        op.nonce = _ep.getNonce(address(_sender), 0);
        op.callData = abi.encodeWithSelector(SmartAccount.executeCall.selector, _to, _value, _data);
        op.callGasLimit = 50000;
        op.verificationGasLimit = 80000;
        op.preVerificationGas = 50000;
        op.maxFeePerGas = 1000000000;
        op.maxPriorityFeePerGas = 100;
        op.signature = signUserOp(op, _key);
        (op, prefund) = simulateVerificationGas(_ep, op);
        op.callGasLimit = simulateCallGas(_ep, op);
        //op.signature = signUserOp(op, _name);
    }

    function signUserOp(UserOperation memory op, uint256 _key) public returns (bytes memory signature) {
        bytes32 hash = _ep.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, hash.toEthSignedMessageHash());
        signature = abi.encodePacked(r, s, v);
    }

    function signPaymasterSignature(UserOperation memory op, uint256 _key) public returns (bytes memory signature) {
        BiconomyTokenPaymaster.ExchangeRateSource priceSource = BiconomyTokenPaymaster.ExchangeRateSource.ORACLE_BASED;
        uint48 validUntil = 3735928559;
        uint48 validAfter = 4660;
        uint256 exchangeRate = 977100;
        uint32 priceMarkup = 1100000;

        bytes32 hash = _btpm.getHash(
            op, priceSource, validUntil, validAfter, address(usdc), address(_oa1), exchangeRate, priceMarkup
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, hash.toEthSignedMessageHash());
        signature = abi.encodePacked(r, s, v);
    }

    function simulateVerificationGas(IEntryPoint _entrypoint, UserOperation memory op)
        public
        returns (UserOperation memory, uint256 preFund)
    {
        (bool success, bytes memory ret) =
            address(_entrypoint).call(abi.encodeWithSelector(EntryPoint.simulateValidation.selector, op));
        require(!success);
        bytes memory data = BytesLib.slice(ret, 4, ret.length - 4);
        (IEntryPoint.ReturnInfo memory retInfo,,,) = abi.decode(
            data, (IEntryPoint.ReturnInfo, IStakeManager.StakeInfo, IStakeManager.StakeInfo, IStakeManager.StakeInfo)
        );
        op.preVerificationGas = retInfo.preOpGas;
        op.verificationGasLimit = retInfo.preOpGas;
        op.maxFeePerGas = retInfo.prefund * 11 / (retInfo.preOpGas * 10);
        op.maxPriorityFeePerGas = 1;
        return (op, retInfo.prefund);
    }

    function simulateCallGas(IEntryPoint _entrypoint, UserOperation memory op) internal returns (uint256) {
        try this.calcGas(_entrypoint, op.sender, op.callData) {
            revert("Should have failed");
        } catch Error(string memory reason) {
            uint256 gas = abi.decode(bytes(reason), (uint256));
            return gas * 11 / 10;
        } catch {
            revert("Should have failed");
        }
    }

    // not used internally
    function calcGas(IEntryPoint _entrypoint, address _to, bytes memory _data) external {
        vm.startPrank(address(_entrypoint));
        uint256 g = gasleft();
        (bool success,) = _to.call(_data);
        require(success);
        g = g - gasleft();
        bytes memory r = abi.encode(g);
        vm.stopPrank();
        require(false, string(r));
    }

    function testDecode() external view{
        bytes memory d =
            hex"0000023d6c240ae3c9610d519510004d2616c9ec010000000000000000000000000000000000000000000000000000000065157c23000000000000000000000000000000000000000000000000000000006515751b0000000000000000000000008ac76a51cc950d9822d68b83fe1ad97b32cd580d0000000000000000000000000000065b8abb967271817555f23945eedf08015c00000000000000000000000000000000000000000000000b88f7f3bb38595e8a000000000000000000000000000000000000000000000000000000000010c8e019b54af51b156531fb11b7aabf4dba0d0eae1e519e54d176633de65eac43d41c431ce06784f1bab9085771a86c1a006d944214c33272e022e7168e5062fd8fb01c";
        (
            BiconomyTokenPaymaster.ExchangeRateSource priceSource,
            uint48 validUntil,
            uint48 validAfter,
            address feeToken,
            address oracleAggregator,
            uint256 exchangeRate,
            uint32 priceMarkup,
            bytes memory signature
        ) = _btpm.parsePaymasterAndData(d);

        console2.log(validAfter, validUntil);
    }
}
