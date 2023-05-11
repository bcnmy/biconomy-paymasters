// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0;

import {DSTest} from "ds-test/test.sol";
import {OracleAggregator} from "../../contracts/token/oracles/OracleAggregator.sol";
import {IOracleAggregator} from "../../contracts/token/oracles/IOracleAggregator.sol";
import {BiconomyTokenPaymaster} from "../../contracts/token/BiconomyTokenPaymaster.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";
import {Utilities} from "./utils/Utilities.sol";
import {console} from "./utils/Console.sol";
import {Vm} from "forge-std/Vm.sol";

contract ContractTest is DSTest {
    Vm internal immutable vm = Vm(HEVM_ADDRESS);

    Utilities internal utils;
    address payable[] internal users;

    OracleAggregator _oa;
    BiconomyTokenPaymaster _btpm;
    EntryPoint _ep;

    function setUp() public {
        utils = new Utilities();
        users = utils.createUsers(5);
    }

    function testCreateOA() public {

        address payable alice = users[0];
        // labels alice's address in call traces as "Alice [<address>]"
        vm.label(alice, "Alice");

        address payable bob = users[1];
        vm.label(bob, "Bob");

        _oa = new OracleAggregator(alice);

        assertEq(_oa.owner(),alice);

        vm.prank(alice);
    }

    function testCreateTokenPaymaster() public {

        address payable alice = users[0];
        // labels alice's address in call traces as "Alice [<address>]"
        vm.label(alice, "Alice");

        address payable bob = users[1];
        vm.label(bob, "Bob");

        _oa = new OracleAggregator(alice);
        _ep = new EntryPoint();
        _btpm = new BiconomyTokenPaymaster(alice, _ep, bob, _oa);

        assertEq(_oa.owner(),alice);
        assertEq(_btpm.owner(),alice);
        assertEq(_btpm.verifyingSigner(),bob);
        
        vm.prank(alice);
    }
}
