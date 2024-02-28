/* eslint-disable node/no-missing-import */
/* eslint-disable camelcase */
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  BiconomyAccountImplementation,
  BiconomyAccountImplementation__factory,
  BiconomyAccountFactory,
  BiconomyAccountFactory__factory,
  CouponBasedPaymaster,
  CouponBasedPaymaster__factory,
} from "../../typechain-types";
import { fillAndSign } from "../utils/userOp";
import {
  EntryPoint,
  EntryPoint__factory,
} from "../../lib/account-abstraction/typechain";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";
import { arrayify, hexConcat, hexZeroPad, parseEther } from "ethers/lib/utils";
import { BigNumber, Signer } from "ethers";
import { keccak256 } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";

export const AddressZero = ethers.constants.AddressZero;

export async function deployEntryPoint(
  provider = ethers.provider
): Promise<EntryPoint> {
  const epf = await (await ethers.getContractFactory("EntryPoint")).deploy();
  return EntryPoint__factory.connect(epf.address, provider.getSigner());
}

describe("EntryPoint with Coupon Paymaster", function () {
  let entryPoint: EntryPoint;
  let walletOwner: Signer;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner;

  let deployer: Signer;

  let couponBasedPaymaster: CouponBasedPaymaster;
  let smartWalletImp: BiconomyAccountImplementation;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
  let walletFactory: BiconomyAccountFactory;
  let merkleTree: MerkleTree;
  let replayPnd: string = "0x";

  before(async function () {
    ethersSigner = await ethers.getSigners();
    entryPoint = await deployEntryPoint();

    deployer = ethersSigner[0];
    walletOwner = deployer; // ethersSigner[0];

    const walletOwnerAddress = await walletOwner.getAddress();

    ecdsaModule = await new EcdsaOwnershipRegistryModule__factory(
      deployer
    ).deploy();

    couponBasedPaymaster = await new CouponBasedPaymaster__factory(
      deployer
    ).deploy(await deployer.getAddress(), entryPoint.address);

    smartWalletImp = await new BiconomyAccountImplementation__factory(
      deployer
    ).deploy(entryPoint.address);

    walletFactory = await new BiconomyAccountFactory__factory(deployer).deploy(
      smartWalletImp.address,
      walletOwnerAddress
    );

    await walletFactory
      .connect(deployer)
      .addStake(entryPoint.address, 86400, { value: parseEther("2") });

    const ecdsaOwnershipSetupData = ecdsaModule.interface.encodeFunctionData(
      "initForSmartAccount",
      [walletOwnerAddress]
    );

    const smartAccountDeploymentIndex = 0;

    await walletFactory.deployCounterFactualAccount(
      ecdsaModule.address,
      ecdsaOwnershipSetupData,
      smartAccountDeploymentIndex
    );
    const expected = await walletFactory.getAddressForCounterFactualAccount(
      ecdsaModule.address,
      ecdsaOwnershipSetupData,
      smartAccountDeploymentIndex
    );

    walletAddress = expected;
    console.log(" wallet address ", walletAddress);

    paymasterAddress = couponBasedPaymaster.address;
    console.log("Paymaster address is ", paymasterAddress);

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("1") });

    // coupon1
    const leafData1 = ethers.utils.defaultAbiCoder.encode(
      ["bytes32"],
      [ethers.utils.formatBytes32String("abc123")]
    );

    // coupon2
    const leafData2 = ethers.utils.defaultAbiCoder.encode(
      ["bytes32"],
      [ethers.utils.formatBytes32String("abc12345")]
    );

    // hexConcat([hexZeroPad("0xabc123", 32)]);

    merkleTree = new MerkleTree(
      [ethers.utils.keccak256(leafData1), ethers.utils.keccak256(leafData2)],
      keccak256,
      {
        sortPairs: true,
        hashLeaves: false,
      }
    );

    console.log("merkle root is ", merkleTree.getHexRoot());

    await couponBasedPaymaster
      .connect(deployer)
      .setMerkleRoot(merkleTree.getHexRoot());
  });

  describe("Coupon based paymaster basic positive tests", () => {
    it("succeed with valid coupon", async () => {
      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 700000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const leafData = ethers.utils.defaultAbiCoder.encode(
        ["bytes32"],
        [ethers.utils.formatBytes32String("abc123")]
      );

      const proof = merkleTree.getHexProof(ethers.utils.keccak256(leafData));

      console.log("proof is ", proof);

      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.defaultAbiCoder.encode(
              ["bytes32", "bytes32[]"],
              [ethers.utils.formatBytes32String("abc123"), proof]
            ),
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      replayPnd = userOp.paymasterAndData;

      console.log("pnd ", userOp.paymasterAndData);

      const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
        ["bytes", "address"],
        [userOp.signature, ecdsaModule.address]
      );
      userOp.signature = signatureWithModuleAddress;

      const tx = await entryPoint.handleOps(
        [userOp],
        await deployer.getAddress()
      );
      const receipt = await tx.wait();
    });

    it("should parse paymaster and data properly", async () => {
      const leafData = ethers.utils.defaultAbiCoder.encode(
        ["bytes32"],
        [ethers.utils.formatBytes32String("abc12345")]
      );

      const proof = merkleTree.getHexProof(ethers.utils.keccak256(leafData));

      const pnd = hexConcat([
        paymasterAddress,
        ethers.utils.defaultAbiCoder.encode(
          ["bytes32", "bytes32[]"],
          [ethers.utils.formatBytes32String("abc12345"), proof]
        ),
      ]);

      const parsedData = await couponBasedPaymaster.parsePaymasterAndData(pnd);
      console.log("parsed data is ", parsedData);

      expect(parsedData.coupon).to.be.equal(
        ethers.utils.formatBytes32String("abc12345")
      );
      expect(parsedData.proof.length).to.be.greaterThanOrEqual(1);
    });

    it("should not replay paymaster and data and use same coupon twice", async () => {
      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 700000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: replayPnd,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      console.log("replay pnd ", userOp.paymasterAndData);
      console.log("replay pnd ", replayPnd);

      const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
        ["bytes", "address"],
        [userOp.signature, ecdsaModule.address]
      );
      userOp.signature = signatureWithModuleAddress;

      await expect(entryPoint.handleOps([userOp], await deployer.getAddress()))
        .to.be.revertedWithCustomError(entryPoint, "FailedOp")
        .withArgs(0, "AA33 reverted: CouponAlreadyUsed");
    });
  });
});
