// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {Test, Vm} from "forge-std/Test.sol";
import {MockToken} from "../../../contracts/test/helpers/MockToken.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {IStakeManager} from "@account-abstraction/contracts/interfaces/IStakeManager.sol";
import {UserOperation} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import {SmartAccountFactory} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/factory/SmartAccountFactory.sol";
import {SmartAccount} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/SmartAccount.sol";
import {EcdsaOwnershipRegistryModule} from "@biconomy-devx/account-contracts-v2/contracts/smart-account/modules/EcdsaOwnershipRegistryModule.sol";
import "../../BytesLib.sol";

abstract contract SATestBase is Test {
    using ECDSA for bytes32;

    // Test Environment Configuration
    string constant mnemonic =
        "test test test test test test test test test test test junk";
    uint256 constant testAccountCount = 10;
    uint256 constant initialMainAccountFunds = 100000 ether;
    uint256 constant defaultPreVerificationGas = 21000;
    // Event Topics
    bytes32 constant userOperationEventTopic =
        0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f;
    bytes32 constant userOperationRevertReasonTopic =
        0x1c4fada7374c0a9ee8841fc38afe82932dc0f8e69012e927f061a8bae611a201;

    uint32 nextKeyIndex;

    struct UserOperationEventData {
        bytes32 userOpHash;
        address sender;
        address paymaster;
        uint256 nonce;
        bool success;
        uint256 actualGasCost;
        uint256 actualGasUsed;
    }

    struct UserOperationRevertReasonEventData {
        bytes32 userOpHash;
        address sender;
        uint256 nonce;
        bytes revertReason;
    }

    // Test Accounts
    struct TestAccount {
        address payable addr;
        uint256 privateKey;
    }

    TestAccount[] testAccounts;
    TestAccount alice;
    TestAccount bob;
    TestAccount charlie;
    TestAccount dan;
    TestAccount emma;
    TestAccount frank;
    TestAccount george;
    TestAccount henry;
    TestAccount ida;

    TestAccount owner;

    // Test Tokens
    MockToken token;

    // ERC4337 Contracts
    EntryPoint entryPoint;
    SmartAccount saImplementation;
    SmartAccountFactory factory;

    // Modules
    EcdsaOwnershipRegistryModule ecdsaOwnershipRegistryModule;

    function getNextPrivateKey() internal returns (uint256) {
        return vm.deriveKey(mnemonic, ++nextKeyIndex);
    }

    function setUp() public virtual {
        // Generate Test Addresses
        for (uint256 i = 0; i < testAccountCount; i++) {
            uint256 privateKey = getNextPrivateKey();
            testAccounts.push(
                TestAccount(payable(vm.addr(privateKey)), privateKey)
            );

            deal(testAccounts[i].addr, initialMainAccountFunds);
        }

        // Name Test Addresses
        alice = testAccounts[0];
        vm.label(alice.addr, string.concat("Alice", vm.toString(uint256(0))));

        bob = testAccounts[1];
        vm.label(bob.addr, string.concat("Bob", vm.toString(uint256(1))));

        charlie = testAccounts[2];
        vm.label(
            charlie.addr,
            string.concat("Charlie", vm.toString(uint256(2)))
        );

        dan = testAccounts[3];
        vm.label(dan.addr, string.concat("Dan", vm.toString(uint256(3))));

        emma = testAccounts[4];
        vm.label(emma.addr, string.concat("Emma", vm.toString(uint256(4))));

        frank = testAccounts[5];
        vm.label(frank.addr, string.concat("Frank", vm.toString(uint256(5))));

        george = testAccounts[6];
        vm.label(george.addr, string.concat("George", vm.toString(uint256(6))));

        henry = testAccounts[7];
        vm.label(henry.addr, string.concat("Henry", vm.toString(uint256(7))));

        ida = testAccounts[7];
        vm.label(ida.addr, string.concat("Ida", vm.toString(uint256(8))));

        // Name Owner
        owner = testAccounts[8];
        vm.label(owner.addr, string.concat("Owner", vm.toString(uint256(9))));

        // Deploy Test Tokens
        token = new MockToken();
        vm.label(address(token), "Test Token");

        // Deploy ERC4337 Contracts
        entryPoint = new EntryPoint();
        vm.label(address(entryPoint), "Entry Point");

        saImplementation = new SmartAccount(entryPoint);
        vm.label(address(saImplementation), "Smart Account Implementation");

        factory = new SmartAccountFactory(
            address(saImplementation),
            owner.addr
        );
        vm.label(address(factory), "Smart Account Factory");

        // Deploy Modules
        ecdsaOwnershipRegistryModule = new EcdsaOwnershipRegistryModule();
        vm.label(
            address(ecdsaOwnershipRegistryModule),
            "ECDSA Ownership Registry Module"
        );
    }

    // Utility Functions
    function getSmartAccountWithModule(
        address _moduleSetupContract,
        bytes memory _moduleSetupData,
        uint256 _index,
        string memory _label
    ) internal returns (SmartAccount sa) {
        sa = SmartAccount(
            payable(
                factory.deployCounterFactualAccount(
                    _moduleSetupContract,
                    _moduleSetupData,
                    _index
                )
            )
        );
        vm.label(address(sa), _label);
    }

    function getSmartAccountExecuteCalldata(
        address _dest,
        uint256 _value,
        bytes memory _calldata
    ) internal pure returns (bytes memory) {
        return abi.encodeCall(SmartAccount.execute, (_dest, _value, _calldata));
    }

    function getUserOperationEventData(
        Vm.Log[] memory _entries
    ) internal returns (UserOperationEventData memory data) {
        for (uint256 i = 0; i < _entries.length; ++i) {
            if (_entries[i].topics[0] != userOperationEventTopic) {
                continue;
            }
            data.userOpHash = _entries[i].topics[1];
            data.sender = address(uint160(uint256(_entries[i].topics[2])));
            data.paymaster = address(uint160(uint256(_entries[i].topics[3])));
            (
                data.nonce,
                data.success,
                data.actualGasCost,
                data.actualGasUsed
            ) = abi.decode(_entries[i].data, (uint256, bool, uint256, uint256));
            return data;
        }
        fail("entries does not contain UserOperationEvent");
    }

    function getUserOperationRevertReasonEventData(
        Vm.Log[] memory _entries
    ) internal returns (UserOperationRevertReasonEventData memory data) {
        for (uint256 i = 0; i < _entries.length; ++i) {
            if (_entries[i].topics[0] != userOperationRevertReasonTopic) {
                continue;
            }
            data.userOpHash = _entries[i].topics[1];
            data.sender = address(uint160(uint256(_entries[i].topics[2])));
            (data.nonce, data.revertReason) = abi.decode(
                _entries[i].data,
                (uint256, bytes)
            );
            return data;
        }
        fail("entries does not contain UserOperationRevertReasonEvent");
    }

    function arraifyOps(
        UserOperation memory _op
    ) internal pure returns (UserOperation[] memory) {
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = _op;
        return ops;
    }

    function arraifyOps(
        UserOperation memory _op1,
        UserOperation memory _op2
    ) internal pure returns (UserOperation[] memory) {
        UserOperation[] memory ops = new UserOperation[](2);
        ops[0] = _op1;
        ops[1] = _op2;
        return ops;
    }

    function arraifyOps(
        UserOperation memory _op1,
        UserOperation memory _op2,
        UserOperation memory _op3
    ) internal pure returns (UserOperation[] memory) {
        UserOperation[] memory ops = new UserOperation[](3);
        ops[0] = _op1;
        ops[1] = _op2;
        ops[2] = _op3;
        return ops;
    }

    // Module Setup Data Helpers
    function getEcdsaOwnershipRegistryModuleSetupData(
        address _owner
    ) internal pure returns (bytes memory) {
        return
            abi.encodeCall(
                EcdsaOwnershipRegistryModule.initForSmartAccount,
                (_owner)
            );
    }

    // Validation Module Op Creation Helpers
    function makeEcdsaModuleUserOp(
        bytes memory _calldata,
        SmartAccount _sa,
        uint192 _nonceKey,
        TestAccount memory _signer,
        bytes memory _pnd
    ) internal view returns (UserOperation memory op) {
        op = UserOperation({
            sender: address(_sa),
            nonce: entryPoint.getNonce(address(_sa), _nonceKey),
            initCode: bytes(""),
            callData: _calldata,
            callGasLimit: gasleft() / 100,
            verificationGasLimit: gasleft() / 100,
            preVerificationGas: defaultPreVerificationGas,
            maxFeePerGas: tx.gasprice,
            maxPriorityFeePerGas: tx.gasprice - block.basefee,
            paymasterAndData: _pnd,
            signature: bytes("")
        });

        // Sign the UserOp
        bytes32 userOpHash = entryPoint.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            _signer.privateKey,
            userOpHash
        );
        op.signature = abi.encode(
            abi.encodePacked(r, s, v),
            ecdsaOwnershipRegistryModule
        );
    }


    function signUserOp(
        UserOperation memory op,
        uint256 _key
    ) public returns (bytes memory signature) {
        bytes32 hash = entryPoint.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            _key,
            hash.toEthSignedMessageHash()
        );
        signature = abi.encodePacked(r, s, v);
        signature = abi.encode(
            signature,
            address(ecdsaOwnershipRegistryModule)
        );
    }

        function simulateVerificationGas(
        IEntryPoint _entrypoint,
        UserOperation memory op
    ) public returns (UserOperation memory, uint256 preFund) {
        (bool success, bytes memory ret) = address(_entrypoint).call(
            abi.encodeWithSelector(EntryPoint.simulateValidation.selector, op)
        );
        require(!success);
        bytes memory data = BytesLib.slice(ret, 4, ret.length - 4);
        (IEntryPoint.ReturnInfo memory retInfo, , , ) = abi.decode(
            data,
            (
                IEntryPoint.ReturnInfo,
                IStakeManager.StakeInfo,
                IStakeManager.StakeInfo,
                IStakeManager.StakeInfo
            )
        );
        op.preVerificationGas = retInfo.preOpGas;
        op.verificationGasLimit = retInfo.preOpGas;
        op.maxFeePerGas = (retInfo.prefund * 11) / (retInfo.preOpGas * 10);
        op.maxPriorityFeePerGas = 1;
        return (op, retInfo.prefund);
    }

    function simulateCallGas(
        IEntryPoint _entrypoint,
        UserOperation memory op
    ) internal returns (uint256) {
        try this.calcGas(_entrypoint, op.sender, op.callData) {
            revert("Should have failed");
        } catch Error(string memory reason) {
            uint256 gas = abi.decode(bytes(reason), (uint256));
            return (gas * 11) / 10;
        } catch {
            revert("Should have failed");
        }
    }

    // not used internally
    function calcGas(
        IEntryPoint _entrypoint,
        address _to,
        bytes memory _data
    ) external {
        vm.startPrank(address(_entrypoint));
        uint256 g = gasleft();
        (bool success, ) = _to.call(_data);
        require(success);
        g = g - gasleft();
        bytes memory r = abi.encode(g);
        vm.stopPrank();
        require(false, string(r));
    }


    function fillUserOp(
        SmartAccount _sender,
        uint256 _key,
        address _to,
        uint256 _value,
        bytes memory _data
    ) public returns (UserOperation memory op, uint256 prefund) {
        op.sender = address(_sender);
        op.nonce = entryPoint.getNonce(address(_sender), 0);
        op.callData = abi.encodeWithSelector(SmartAccount.execute_ncC.selector, _to, _value, _data);
        op.callGasLimit = 50000;
        op.verificationGasLimit = 80000;
        op.preVerificationGas = 50000;
        op.maxFeePerGas = 1000000000;
        op.maxPriorityFeePerGas = 100;
        op.signature = signUserOp(op, _key);
        (op, prefund) = simulateVerificationGas(entryPoint, op);
        op.callGasLimit = simulateCallGas(entryPoint, op);

        //op.signature = signUserOp(op, _name);

        op.signature = abi.encode(
            op.signature,
            address(ecdsaOwnershipRegistryModule)
        );
    }
}
