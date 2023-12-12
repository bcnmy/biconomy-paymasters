// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/* solhint-disable reason-string */
/* solhint-disable no-inline-assembly */
// import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {UserOperation, UserOperationLib} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../BasePaymaster.sol";

contract CouponBasedPaymaster is
    BasePaymaster,
    ReentrancyGuard
{
    // using ECDSA for bytes32;
    using UserOperationLib for UserOperation;

    bytes32 public merkleRoot;
    uint256 internal constant VALIDATION_SUCCESS = 0;
    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    mapping (bytes32 => bool) private usedCoupons;

    // mapping (bytes32 => mapping (address => uint256)) private timesCouponAvailedByUser;

    event MerkleRootUpdated(address actor, bytes32 newRoot);

    constructor(
        address _owner,
        IEntryPoint _entryPoint
        // could set merkle root as part of contructor also
    ) payable BasePaymaster(_owner, _entryPoint) {
        require(address(_entryPoint) != address(0),"EntryPointCannotBeZero");
        require(address(_owner) != address(0),"OwnerCannotBeZero");
    }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(msg.sender, _merkleRoot);
    }

    /**
     * add a deposit for this paymaster, used for paying for transaction fees
     */
    function deposit() public payable override {
        entryPoint.depositTo{value : msg.value}(address(this));
    }

    /**
     * withdraw value from the deposit
     * @param withdrawAddress target to send to
     * @param amount to withdraw
     */
    function withdrawTo(address payable withdrawAddress, uint256 amount) public override onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, amount);
    }

    function parsePaymasterAndData(
        bytes calldata paymasterAndData
    )
        public
        pure
        returns (
            bytes32 coupon,
            bytes32[] memory proof
        )
    {

       (coupon, proof) = abi.decode(paymasterAndData[20:], (bytes32, bytes32[]));
    }

    // Review: front running concerns on paymasterAndData

    /**
     * @param userOp The UserOperation struct that represents the current user operation.
     * userOpHash The hash of the UserOperation struct.
     * @param requiredPreFund The required amount of pre-funding for the paymaster.
     * @return context A context string returned by the entry point after successful validation.
     * @return validationData An integer returned by the entry point after successful validation.
     */
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    ) internal override returns (bytes memory context, uint256 validationData) {
        (requiredPreFund, userOpHash);
        (bytes32 coupon, bytes32[] memory proof) = parsePaymasterAndData(userOp.paymasterAndData);

        require(usedCoupons[coupon] == false, "CouponAlreadyUsed");

        // userOp.callData could be anything
        // Note: if wish to we could perform some checks on it

        // Note: could perform some checks on it
        // userOp.sender

        // Note: another alteration could be leaf contains which user address and coupon code

        bytes32 leaf = keccak256(
            abi.encodePacked(
                coupon
            )
        );

         if (
            !MerkleProof.verify(proof, merkleRoot, leaf)
        ) {
            revert("CouponNotValid");
        }

        usedCoupons[coupon] = true; // this could be done in postOp as well. or some other actions in postOp

        return ("", VALIDATION_SUCCESS);

    }
}
