/* eslint-disable node/no-missing-import */
/* eslint-disable camelcase */
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  BiconomyAccountImplementation,
  BiconomyAccountImplementation__factory,
  BiconomyAccountFactory,
  BiconomyAccountFactory__factory,
  SponsorshipPaymaster,
  SponsorshipPaymaster__factory,
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
import { arrayify, hexConcat, parseEther } from "ethers/lib/utils";
import { BigNumber, Signer } from "ethers";

export const AddressZero = ethers.constants.AddressZero;

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const dynamicMarkup = 1100000; // or 0 or 1100000

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

  let offchainSigner: Signer, deployer: Signer, feeCollector: Signer;
  let secondFundingId: Signer, thirdFundingId: Signer;

  let sponsorshipPaymaster: SponsorshipPaymaster;
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
    feeCollector = ethersSigner[3];
    secondFundingId = ethersSigner[4];
    thirdFundingId = ethersSigner[5];
    walletOwner = deployer; // ethersSigner[0];

    const offchainSignerAddress = await offchainSigner.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();
    const feeCollectorAddress = await feeCollector.getAddress();

    ecdsaModule = await new EcdsaOwnershipRegistryModule__factory(
      deployer
    ).deploy();

    sponsorshipPaymaster = await new SponsorshipPaymaster__factory(
      deployer
    ).deploy(
      await deployer.getAddress(),
      entryPoint.address,
      offchainSignerAddress,
      feeCollectorAddress
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
    console.log(" wallet address ", walletAddress);

    paymasterAddress = sponsorshipPaymaster.address;
    console.log("Paymaster address is ", paymasterAddress);

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

    const hash = await sponsorshipPaymaster.getHash(
      userOp1,
      paymasterId,
      MOCK_VALID_UNTIL,
      MOCK_VALID_AFTER,
      dynamicMarkup
    );
    const sig = await offchainSigner.signMessage(arrayify(hash));
    const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
    const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
    const paymasterAndData = hexConcat([
      paymasterAddress,
      ethers.utils.hexZeroPad(paymasterId, 20),
      ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
      ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
      ethers.utils.hexZeroPad(ethers.utils.hexlify(dynamicMarkup), 4), // 4 bytes
      sig,
    ]);
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

  describe("Verifying paymaster basic positive tests", () => {
    it("Should Fail when there is no deposit for paymaster id", async () => {
      // Review
      const paymasterId = await depositorSigner.getAddress();
      console.log("paymaster Id ", paymasterId);
      const userOp = await getUserOpWithPaymasterInfo(paymasterId);

      // Review: for catching custom errors in better ways
      await expect(
        entryPoint.callStatic.simulateValidation(userOp)
      ).to.be.revertedWithCustomError(entryPoint, "FailedOp");
    });

    it("succeed with valid signature", async () => {
      const fundingId = await offchainSigner.getAddress();

      await sponsorshipPaymaster
        .connect(deployer)
        .setUnaccountedEPGasOverhead(35500);

      await sponsorshipPaymaster.depositFor(fundingId, {
        value: ethers.utils.parseEther("1"),
      });

      const paymasterFundsBefore = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceBefore = await sponsorshipPaymaster.getBalance(
        fundingId
      );
      const feeCollectorBalanceBefore = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      console.log("feeCollectorBalanceBefore ", feeCollectorBalanceBefore);
      expect(feeCollectorBalanceBefore).to.be.equal(BigNumber.from(0));
      const signer = await sponsorshipPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sponsorshipPaymaster.getHash(
        userOp1,
        fundingId,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        dynamicMarkup
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
      const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.hexZeroPad(fundingId, 20),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(dynamicMarkup), 4), // 4 bytes
            sig,
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
      const receipt = await tx.wait();
      console.log("effective gas price ", receipt.effectiveGasPrice.toString());
      console.log("gas used VPM V2 ", receipt.gasUsed.toString());
      console.log("gas price ", receipt.effectiveGasPrice.toString());

      const chargedFromDappIncludingPremium = BigNumber.from(
        receipt.logs[1].topics[2]
      );
      console.log(
        "chargedFromDappIncludingPremium ",
        chargedFromDappIncludingPremium.toString()
      );

      const premiumCollected = BigNumber.from(
        receipt.logs[2].topics[2]
      ).toString();
      console.log("premiumCollected ", premiumCollected);

      const bundlerPaid = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      console.log("bundler paid ", bundlerPaid.toString());

      const paymasterFundsAfter = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceAfter = await sponsorshipPaymaster.getBalance(
        fundingId
      );

      const paymasterIdBalanceDiff = paymasterIdBalanceBefore.sub(
        paymasterIdBalanceAfter
      );
      console.log("paymasterIdBalanceDiff ", paymasterIdBalanceDiff.toString());

      const paymasterFundsDiff = paymasterFundsBefore.sub(paymasterFundsAfter);
      console.log("paymasterFundsDiff ", paymasterFundsDiff.toString());

      // paymasterIdBalanceDiffWithoutPremium should be greater than paymaster funds diff (that means unaccounted overhead is right)
      expect(
        chargedFromDappIncludingPremium
          .sub(premiumCollected)
          .sub(paymasterFundsDiff)
      ).to.be.greaterThan(BigNumber.from(0));

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      const feeCollectorBalanceAfter = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      expect(feeCollectorBalanceAfter).to.be.greaterThan(BigNumber.from(0));

      // 0.1 / 1.1 = actual gas used * 0.1
      expect(feeCollectorBalanceAfter).to.be.equal(
        paymasterIdBalanceDiff.mul(BigNumber.from(1)).div(BigNumber.from(11))
      );
    });

    it("succeed with valid signature - second transaction ", async () => {
      const fundingId = await offchainSigner.getAddress();

      await sponsorshipPaymaster
        .connect(deployer)
        .setUnaccountedEPGasOverhead(18500);

      await sponsorshipPaymaster.depositFor(fundingId, {
        value: ethers.utils.parseEther("1"),
      });

      const paymasterFundsBefore = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceBefore = await sponsorshipPaymaster.getBalance(
        fundingId
      );
      const feeCollectorBalanceBefore = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      console.log("feeCollectorBalanceBefore ", feeCollectorBalanceBefore);
      const signer = await sponsorshipPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sponsorshipPaymaster.getHash(
        userOp1,
        fundingId,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        dynamicMarkup
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
      const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.hexZeroPad(fundingId, 20),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(dynamicMarkup), 4), // 4 bytes
            sig,
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
      const receipt = await tx.wait();
      console.log("effective gas price ", receipt.effectiveGasPrice.toString());
      console.log("gas used VPM V2 ", receipt.gasUsed.toString());
      console.log("gas price ", receipt.effectiveGasPrice.toString());

      const chargedFromDappIncludingPremium = BigNumber.from(
        receipt.logs[1].topics[2]
      );
      console.log(
        "chargedFromDappIncludingPremium ",
        chargedFromDappIncludingPremium.toString()
      );

      const premiumCollected = BigNumber.from(
        receipt.logs[2].topics[2]
      ).toString();
      console.log("premiumCollected ", premiumCollected);

      const bundlerPaid = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      console.log("bundler paid ", bundlerPaid.toString());

      const paymasterFundsAfter = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceAfter = await sponsorshipPaymaster.getBalance(
        fundingId
      );

      const paymasterIdBalanceDiff = paymasterIdBalanceBefore.sub(
        paymasterIdBalanceAfter
      );
      console.log("paymasterIdBalanceDiff ", paymasterIdBalanceDiff.toString());

      const paymasterFundsDiff = paymasterFundsBefore.sub(paymasterFundsAfter);
      console.log("paymasterFundsDiff ", paymasterFundsDiff.toString());

      // paymasterIdBalanceDiffWithoutPremium should be greater than paymaster funds diff (that means unaccounted overhead is right)
      expect(
        chargedFromDappIncludingPremium
          .sub(premiumCollected)
          .sub(paymasterFundsDiff)
      ).to.be.greaterThan(BigNumber.from(0));

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      const feeCollectorBalanceAfter = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      expect(feeCollectorBalanceAfter).to.be.greaterThan(BigNumber.from(0));

      // 0.1 / 1.1 = actual gas used * 0.1
      expect(
        feeCollectorBalanceAfter.sub(feeCollectorBalanceBefore)
      ).to.be.equal(
        paymasterIdBalanceDiff.mul(BigNumber.from(1)).div(BigNumber.from(11))
      );
    });

    it("succeed with valid signature - same account - different funding id ", async () => {
      const fundingId = await secondFundingId.getAddress();

      await sponsorshipPaymaster
        .connect(deployer)
        .setUnaccountedEPGasOverhead(18500);

      await sponsorshipPaymaster.depositFor(fundingId, {
        value: ethers.utils.parseEther("1"),
      });

      const paymasterFundsBefore = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceBefore = await sponsorshipPaymaster.getBalance(
        fundingId
      );
      const feeCollectorBalanceBefore = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      console.log("feeCollectorBalanceBefore ", feeCollectorBalanceBefore);
      const signer = await sponsorshipPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sponsorshipPaymaster.getHash(
        userOp1,
        fundingId,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        dynamicMarkup
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
      const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.hexZeroPad(fundingId, 20),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(dynamicMarkup), 4), // 4 bytes
            sig,
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
      const receipt = await tx.wait();
      console.log("effective gas price ", receipt.effectiveGasPrice.toString());
      console.log("gas used VPM V2 ", receipt.gasUsed.toString());
      console.log("gas price ", receipt.effectiveGasPrice.toString());

      const chargedFromDappIncludingPremium = BigNumber.from(
        receipt.logs[1].topics[2]
      );
      console.log(
        "chargedFromDappIncludingPremium ",
        chargedFromDappIncludingPremium.toString()
      );

      const premiumCollected = BigNumber.from(
        receipt.logs[2].topics[2]
      ).toString();
      console.log("premiumCollected ", premiumCollected);

      const bundlerPaid = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      console.log("bundler paid ", bundlerPaid.toString());

      const paymasterFundsAfter = await entryPoint.balanceOf(paymasterAddress);
      const paymasterIdBalanceAfter = await sponsorshipPaymaster.getBalance(
        fundingId
      );

      const paymasterIdBalanceDiff = paymasterIdBalanceBefore.sub(
        paymasterIdBalanceAfter
      );
      console.log("paymasterIdBalanceDiff ", paymasterIdBalanceDiff.toString());

      const paymasterFundsDiff = paymasterFundsBefore.sub(paymasterFundsAfter);
      console.log("paymasterFundsDiff ", paymasterFundsDiff.toString());

      // paymasterIdBalanceDiffWithoutPremium should be greater than paymaster funds diff (that means unaccounted overhead is right)
      expect(
        chargedFromDappIncludingPremium
          .sub(premiumCollected)
          .sub(paymasterFundsDiff)
      ).to.be.greaterThan(BigNumber.from(0));

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      const feeCollectorBalanceAfter = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      expect(feeCollectorBalanceAfter).to.be.greaterThan(BigNumber.from(0));

      // 0.1 / 1.1 = actual gas used * 0.1
      expect(
        feeCollectorBalanceAfter.sub(feeCollectorBalanceBefore)
      ).to.be.equal(
        paymasterIdBalanceDiff.mul(BigNumber.from(1)).div(BigNumber.from(11))
      );
    });

    it("fails for fundingId which does not have enough deposit", async () => {
      const fundingId = await thirdFundingId.getAddress();

      await sponsorshipPaymaster
        .connect(deployer)
        .setUnaccountedEPGasOverhead(18500);

      // do not deposit

      const signer = await sponsorshipPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sponsorshipPaymaster.getHash(
        userOp1,
        fundingId,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        dynamicMarkup
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
      const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.hexZeroPad(fundingId, 20),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(dynamicMarkup), 4), // 4 bytes
            sig,
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

      await expect(entryPoint.callStatic.simulateValidation(userOp))
        .to.be.revertedWithCustomError(entryPoint, "FailedOp")
        .withArgs(
          0,
          "AA33 reverted: Sponsorship Paymaster: paymasterId does not have enough deposit"
        );
    });
  });

  describe("Sponsorship Paymaster - read methods and state checks", () => {
    it("Should parse data properly", async () => {
      const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
      const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
      const paymasterAndData = hexConcat([
        paymasterAddress,
        ethers.utils.hexZeroPad(await offchainSigner.getAddress(), 20),
        ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
        ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
        ethers.utils.hexZeroPad(ethers.utils.hexlify(dynamicMarkup), 4), // 4 bytes
        "0x" + "00".repeat(65),
      ]);

      const res = await sponsorshipPaymaster.parsePaymasterAndData(
        paymasterAndData
      );

      expect(res.paymasterId).to.equal(await offchainSigner.getAddress());
      expect(res.validUntil).to.equal(ethers.BigNumber.from(MOCK_VALID_UNTIL));
      expect(res.validAfter).to.equal(ethers.BigNumber.from(MOCK_VALID_AFTER));
      expect(res.priceMarkup).to.equal(dynamicMarkup);
      expect(res.signature).to.equal("0x" + "00".repeat(65));
    });

    it("Invalid paymasterAndData causes revert", async () => {
      const paymasterAndData =
        "0x9c145aed0000000000000000000000000000000000000000000000";

      await expect(sponsorshipPaymaster.parsePaymasterAndData(paymasterAndData))
        .to.be.reverted;
    });

    it("should check the correct states set on the paymaster", async () => {
      const owner = await sponsorshipPaymaster.owner();

      const verifyingSigner = await sponsorshipPaymaster.verifyingSigner();

      const feeReceiver = await sponsorshipPaymaster.feeCollector();

      expect(owner).to.be.equal(deployer.address);
      expect(verifyingSigner).to.be.equal(offchainSigner.address);
      expect(feeReceiver).to.be.equal(feeCollector.address);
    });
  });

  describe("Sponsorship Paymaster - deposit and withdraw tests", () => {
    it("Deposits into the specified address", async () => {
      const paymasterId = await depositorSigner.getAddress();

      await sponsorshipPaymaster.depositFor(paymasterId, {
        value: parseEther("1"),
      });

      const balance = await sponsorshipPaymaster.getBalance(paymasterId);
      expect(balance).to.be.equal(parseEther("1"));
    });

    it("Does not allow 0 value deposits", async () => {
      const paymasterId = await depositorSigner.getAddress();

      await expect(
        sponsorshipPaymaster.depositFor(paymasterId, {
          value: parseEther("0"),
        })
      ).to.be.revertedWithCustomError(
        sponsorshipPaymaster,
        "DepositCanNotBeZero"
      );
    });

    it("Does not allow deposits for 0 address paymasterId", async () => {
      const paymasterId = ethers.constants.AddressZero;

      await expect(
        sponsorshipPaymaster.depositFor(paymasterId, {
          value: parseEther("0.5"),
        })
      ).to.be.revertedWithCustomError(
        sponsorshipPaymaster,
        "PaymasterIdCannotBeZero"
      );
    });

    it("Reverts withdraw when paymasterIdBalance is not enough", async () => {
      const paymasterId = await depositorSigner.getAddress();

      await expect(
        sponsorshipPaymaster
          .connect(depositorSigner)
          .withdrawTo(paymasterId, parseEther("1.1"))
      ).to.be.revertedWith(
        "Sponsorship Paymaster: Insufficient funds to withdraw from gas tank"
      );
    });
  });
});
