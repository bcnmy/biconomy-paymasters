/* eslint-disable node/no-missing-import */
/* eslint-disable camelcase */
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  BiconomyAccountImplementation,
  BiconomyAccountImplementation__factory,
  BiconomyAccountFactory,
  BiconomyAccountFactory__factory,
  VerifyingSingletonPaymaster,
  VerifyingSingletonPaymaster__factory,
} from "../../typechain-types";
// Review: Could import from scw-contracts submodules to be consistent
import { fillAndSign } from "../utils/userOp";
import { UserOperation } from "../../lib/account-abstraction/test/UserOperation";
import {
  createAccount,
  simulationResultCatch,
} from "../../lib/account-abstraction/test/testutils";
import {
  EntryPoint,
  EntryPoint__factory,
  SimpleAccount,
  TestToken,
  TestToken__factory,
} from "../../lib/account-abstraction/typechain";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";
import { arrayify, hexConcat, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";

export const AddressZero = ethers.constants.AddressZero;

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";

export async function deployEntryPoint(
  provider = ethers.provider
): Promise<EntryPoint> {
  const epf = await (await ethers.getContractFactory("EntryPoint")).deploy();
  return EntryPoint__factory.connect(epf.address, provider.getSigner());
}

describe("EntryPoint with VerifyingPaymaster Singleton", function () {
  let entryPoint: EntryPoint;
  let depositorSigner: Signer;
  let walletOwner: Signer;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner;

  let offchainSigner: Signer, deployer: Signer;
  let secondFundingId: Signer;

  let verifyingSingletonPaymaster: VerifyingSingletonPaymaster;
  // Could also use published package or added submodule (for Account Implementation and Factory)
  let smartWalletImp: BiconomyAccountImplementation;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
  let walletFactory: BiconomyAccountFactory;
  const abi = ethers.utils.defaultAbiCoder;

  before(async function () {
    ethersSigner = await ethers.getSigners();
    entryPoint = await deployEntryPoint();

    deployer = ethersSigner[0];
    offchainSigner = ethersSigner[1];
    depositorSigner = ethersSigner[2];
    secondFundingId = ethersSigner[3];
    walletOwner = deployer; // ethersSigner[0];

    const offchainSignerAddress = await offchainSigner.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();

    ecdsaModule = await new EcdsaOwnershipRegistryModule__factory(
      deployer
    ).deploy();

    verifyingSingletonPaymaster =
      await new VerifyingSingletonPaymaster__factory(deployer).deploy(
        await deployer.getAddress(),
        entryPoint.address,
        offchainSignerAddress
      );

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

    paymasterAddress = verifyingSingletonPaymaster.address;

    await verifyingSingletonPaymaster
      .connect(deployer)
      .addStake(86400, { value: parseEther("2") });

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("1") });
  });

  async function getUserOpWithPaymasterInfo(paymasterId: string) {
    const userOp1 = await fillAndSign(
      {
        sender: walletAddress,
      },
      walletOwner,
      entryPoint,
      "nonce"
    );

    const hash = await verifyingSingletonPaymaster.getHash(
      userOp1,
      paymasterId,
      MOCK_VALID_UNTIL,
      MOCK_VALID_AFTER
    );
    const sig = await offchainSigner.signMessage(arrayify(hash));
    const paymasterData = abi.encode(
      ["address", "uint48", "uint48", "bytes"],
      [paymasterId, MOCK_VALID_UNTIL, MOCK_VALID_AFTER, sig]
    );
    const paymasterAndData = hexConcat([paymasterAddress, paymasterData]);
    return await fillAndSign(
      {
        ...userOp1,
        paymasterAndData,
      },
      walletOwner,
      entryPoint,
      "nonce"
    );
  }

  describe("#validatePaymasterUserOp", () => {
    it("Should Fail when there is no deposit for paymaster id", async () => {
      const paymasterId = await depositorSigner.getAddress();
      const userOp = await getUserOpWithPaymasterInfo(paymasterId);

      const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
        ["bytes", "address"],
        [userOp.signature, ecdsaModule.address]
      );

      userOp.signature = signatureWithModuleAddress;

      await expect(
        entryPoint.callStatic.simulateValidation(userOp)
        // ).to.be.revertedWith("FailedOp");
      ).to.be.reverted;
    });

    it("succeed with valid signature", async () => {
      const fundingId = await offchainSigner.getAddress();
      const signer = await verifyingSingletonPaymaster.verifyingSigner();

      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await verifyingSingletonPaymaster
        .connect(deployer)
        .setUnaccountedEPGasOverhead(9700);

      await verifyingSingletonPaymaster.depositFor(fundingId, {
        value: ethers.utils.parseEther("1"),
      });

      const paymasterFundsBefore = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceBefore =
        await verifyingSingletonPaymaster.getBalance(fundingId);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await verifyingSingletonPaymaster.getHash(
        userOp1,
        fundingId,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint48", "uint48", "bytes"],
              [fundingId, MOCK_VALID_UNTIL, MOCK_VALID_AFTER, sig]
            ),
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
        ["bytes", "address"],
        [userOp.signature, ecdsaModule.address]
      );

      userOp.signature = signatureWithModuleAddress;

      const tx = await entryPoint.handleOps(
        [userOp],
        await offchainSigner.getAddress(),
        {
          type: 2,
          maxFeePerGas: userOp.maxFeePerGas,
          maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
        }
      );
      console.log("userop nonce ", userOp.nonce.toString());
      const receipt = await tx.wait();
      console.log("effective gas price ", receipt.effectiveGasPrice.toString());
      console.log("gas used VPM V1.1.0", receipt.gasUsed.toString());
      console.log("gas price", receipt.effectiveGasPrice.toString());

      const totalBalDeducted = BigNumber.from(receipt.logs[1].topics[2]);

      const bundlerPaid = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      console.log("bundler paid ", bundlerPaid.toString());

      const paymasterFundsAfter = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceAfter =
        await verifyingSingletonPaymaster.getBalance(fundingId);

      const paymasterIdBalanceDiff = paymasterIdBalanceBefore.sub(
        paymasterIdBalanceAfter
      );
      console.log("paymasterIdBalanceDiff ", paymasterIdBalanceDiff.toString());

      expect(paymasterIdBalanceDiff).to.be.equal(totalBalDeducted);

      const paymasterFundsDiff = paymasterFundsBefore.sub(paymasterFundsAfter);
      console.log("paymasterFundsDiff ", paymasterFundsDiff.toString());

      expect(paymasterIdBalanceDiff.sub(paymasterFundsDiff)).to.be.greaterThan(
        BigNumber.from(0)
      );

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });

    it("succeed with valid signature - second transaction", async () => {
      const fundingId = await offchainSigner.getAddress();
      const signer = await verifyingSingletonPaymaster.verifyingSigner();

      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await verifyingSingletonPaymaster
        .connect(deployer)
        .setUnaccountedEPGasOverhead(9700);

      await verifyingSingletonPaymaster.depositFor(fundingId, {
        value: ethers.utils.parseEther("1"),
      });

      const paymasterFundsBefore = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceBefore =
        await verifyingSingletonPaymaster.getBalance(fundingId);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await verifyingSingletonPaymaster.getHash(
        userOp1,
        fundingId,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint48", "uint48", "bytes"],
              [fundingId, MOCK_VALID_UNTIL, MOCK_VALID_AFTER, sig]
            ),
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
        ["bytes", "address"],
        [userOp.signature, ecdsaModule.address]
      );

      userOp.signature = signatureWithModuleAddress;

      const tx = await entryPoint.handleOps(
        [userOp],
        await offchainSigner.getAddress(),
        {
          type: 2,
          maxFeePerGas: userOp.maxFeePerGas,
          maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
        }
      );
      console.log("userop nonce ", userOp.nonce.toString());
      const receipt = await tx.wait();
      console.log("effective gas price ", receipt.effectiveGasPrice.toString());
      console.log("gas used VPM V1.1.0", receipt.gasUsed.toString());
      console.log("gas price", receipt.effectiveGasPrice.toString());

      const totalBalDeducted = BigNumber.from(receipt.logs[1].topics[2]);

      const bundlerPaid = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      console.log("bundler paid ", bundlerPaid.toString());

      const paymasterFundsAfter = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceAfter =
        await verifyingSingletonPaymaster.getBalance(fundingId);

      const paymasterIdBalanceDiff = paymasterIdBalanceBefore.sub(
        paymasterIdBalanceAfter
      );
      console.log("paymasterIdBalanceDiff ", paymasterIdBalanceDiff.toString());

      expect(paymasterIdBalanceDiff).to.be.equal(totalBalDeducted);

      const paymasterFundsDiff = paymasterFundsBefore.sub(paymasterFundsAfter);
      console.log("paymasterFundsDiff ", paymasterFundsDiff.toString());

      expect(paymasterIdBalanceDiff.sub(paymasterFundsDiff)).to.be.greaterThan(
        BigNumber.from(0)
      );

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });

    it("succeed with valid signature - same account - different funding id ", async () => {
      const fundingId = await secondFundingId.getAddress();
      const signer = await verifyingSingletonPaymaster.verifyingSigner();

      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await verifyingSingletonPaymaster
        .connect(deployer)
        .setUnaccountedEPGasOverhead(9700);

      await verifyingSingletonPaymaster.depositFor(fundingId, {
        value: ethers.utils.parseEther("1"),
      });

      const paymasterFundsBefore = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceBefore =
        await verifyingSingletonPaymaster.getBalance(fundingId);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await verifyingSingletonPaymaster.getHash(
        userOp1,
        fundingId,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint48", "uint48", "bytes"],
              [fundingId, MOCK_VALID_UNTIL, MOCK_VALID_AFTER, sig]
            ),
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
        ["bytes", "address"],
        [userOp.signature, ecdsaModule.address]
      );

      userOp.signature = signatureWithModuleAddress;

      const tx = await entryPoint.handleOps(
        [userOp],
        await offchainSigner.getAddress(),
        {
          type: 2,
          maxFeePerGas: userOp.maxFeePerGas,
          maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
        }
      );
      console.log("userop nonce ", userOp.nonce.toString());
      const receipt = await tx.wait();
      console.log("effective gas price ", receipt.effectiveGasPrice.toString());
      console.log("gas used VPM V1.1.0", receipt.gasUsed.toString());
      console.log("gas price", receipt.effectiveGasPrice.toString());

      const totalBalDeducted = BigNumber.from(receipt.logs[1].topics[2]);

      const bundlerPaid = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      console.log("bundler paid ", bundlerPaid.toString());

      const paymasterFundsAfter = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceAfter =
        await verifyingSingletonPaymaster.getBalance(fundingId);

      const paymasterIdBalanceDiff = paymasterIdBalanceBefore.sub(
        paymasterIdBalanceAfter
      );
      console.log("paymasterIdBalanceDiff ", paymasterIdBalanceDiff.toString());

      expect(paymasterIdBalanceDiff).to.be.equal(totalBalDeducted);

      const paymasterFundsDiff = paymasterFundsBefore.sub(paymasterFundsAfter);
      console.log("paymasterFundsDiff ", paymasterFundsDiff.toString());

      expect(paymasterIdBalanceDiff.sub(paymasterFundsDiff)).to.be.greaterThan(
        BigNumber.from(0)
      );

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
  });
});
