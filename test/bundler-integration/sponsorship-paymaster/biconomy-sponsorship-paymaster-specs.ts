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
} from "../../../typechain-types";
import { fillAndSign } from "../../utils/userOp";
import {
  EntryPoint,
  EntryPoint__factory,
} from "../../../lib/account-abstraction/typechain";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";
import { arrayify, hexConcat, parseEther } from "ethers/lib/utils";
import { BigNumber, Signer } from "ethers";
import {
  BundlerTestEnvironment,
  EthEstimateUserOperationGasResult,
  EthSendUserOperationResult,
  UserOperationSubmissionError,
} from "../environment/bundlerEnvironment";
import { parseEvent } from "../../utils/testUtils";

export const AddressZero = ethers.constants.AddressZero;

const dummyPndSuffix =
  "ae7a11d86a6297844c6d71e916b2e7033de4b34b0000deadbeef00000000123400124f8077be2eb29dac58818ebf3baabfa471d5e1637d786f8bde1dd5d9d06a6f3c5b7e1f5ec86e19e2183b0a29819acec0912653a9eb87fc8fb8b6ffe726b9f72a671d1b";

const UserOperationEventTopic =
  "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const dynamicMarkup = 1200000; // or 0 or 1100000

export async function deployEntryPoint(
  provider = ethers.provider
): Promise<EntryPoint> {
  const epf = await (await ethers.getContractFactory("EntryPoint")).deploy();
  return EntryPoint__factory.connect(epf.address, provider.getSigner());
}

describe("EntryPoint with VerifyingPaymaster Singleton", function () {
  let entryPoint: EntryPoint;
  let walletOwner: Signer;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner;

  let offchainSigner: Signer, deployer: Signer, feeCollector: Signer;

  let sponsorshipPaymaster: SponsorshipPaymaster;
  let smartWalletImp: BiconomyAccountImplementation;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
  let walletFactory: BiconomyAccountFactory;

  let environment: BundlerTestEnvironment;

  beforeEach(async function () {
    // Setup the Bundler Environment
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== BundlerTestEnvironment.BUNDLER_ENVIRONMENT_CHAIN_ID) {
      this.skip();
    }
    environment = await BundlerTestEnvironment.getDefaultInstance();

    ethersSigner = await ethers.getSigners();
    entryPoint = EntryPoint__factory.connect(process.env.ENTRYPOINT!, deployer);

    deployer = ethersSigner[0];
    offchainSigner = ethersSigner[1];
    feeCollector = ethersSigner[3];
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

    // Sending eth to avoid AA21 in gas estimtion. as we can't use stateOverrideSet with this bundler
    await deployer.sendTransaction({
      to: walletAddress,
      value: ethers.utils.parseEther("1"),
    });

    await entryPoint
      .connect(deployer)
      .depositTo(paymasterAddress, { value: parseEther("1") });

    await sponsorshipPaymaster.connect(deployer).addStake(86400, {
      value: parseEther("10"),
    });
  });

  after(async function () {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId === BundlerTestEnvironment.BUNDLER_ENVIRONMENT_CHAIN_ID) {
      await Promise.all([
        environment.revert(environment.defaultSnapshot!),
        environment.resetBundler(),
      ]);
    }
  });

  describe("#validatePaymasterUserOp", () => {
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

    it("succeed with valid signature", async () => {
      const feeCollectorBalanceBefore = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      expect(feeCollectorBalanceBefore).to.be.equal(BigNumber.from(0));
      const signer = await sponsorshipPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await sponsorshipPaymaster.depositFor(await offchainSigner.getAddress(), {
        value: ethers.utils.parseEther("1"),
      });
      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000, // for positive case 200k
          preVerificationGas: 55000, // min expected by bundler is 46k
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const dynamicPart = ecdsaModule.address.substring(2).padEnd(40, "0");
      const dummySig = `0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000${dynamicPart}000000000000000000000000000000000000000000000000000000000000004181d4b4981670cb18f99f0b4a66446df1bf5b204d24cfcb659bf38ba27a4359b5711649ec2423c5e1247245eba2964679b6a1dbb85c992ae40b9b00c6935b02ff1b00000000000000000000000000000000000000000000000000000000000000`;

      userOp1.signature = dummySig;
      userOp1.paymasterAndData = `${paymasterAddress}${dummyPndSuffix}`;

      console.log("userOp1 ", userOp1);

      const estimateResult: EthEstimateUserOperationGasResult =
        await environment.estimateUserOperation(userOp1, entryPoint.address);

      console.log("estimateResult ", estimateResult);
      console.log(
        "verification gas limit with dummyPnd ",
        BigNumber.from(estimateResult.result.verificationGasLimit).toNumber()
      );

      userOp1.verificationGasLimit = BigNumber.from(
        estimateResult.result.verificationGasLimit
      ).toNumber();

      const hash = await sponsorshipPaymaster.getHash(
        userOp1,
        await offchainSigner.getAddress(),
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
            ethers.utils.hexZeroPad(await offchainSigner.getAddress(), 20),
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

      console.log("userop VGL ", userOp.verificationGasLimit.toString());
      console.log("userop PVG ", userOp.preVerificationGas.toString());

      console.log("sponsorship paymaster pnd ", userOp.paymasterAndData);
      console.log("final vgl ", userOp.verificationGasLimit);

      const result: EthSendUserOperationResult =
        await environment.sendUserOperation(userOp, entryPoint.address);

      const receipt = (await environment.getUserOperationReceipt(result.result))
        .result;

      const event = parseEvent(receipt.receipt, UserOperationEventTopic);

      const eventLogs = entryPoint.interface.decodeEventLog(
        "UserOperationEvent",
        event[0].data
      );

      // eslint-disable-next-line no-unused-expressions
      expect(eventLogs.success).to.be.true;

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      const feeCollectorBalanceAfter = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      expect(feeCollectorBalanceAfter).to.be.greaterThan(BigNumber.from(0));
    });

    it("fails if verificationGasLimit is not enough", async () => {
      const feeCollectorBalanceBefore = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      expect(feeCollectorBalanceBefore).to.be.equal(BigNumber.from(0));
      const signer = await sponsorshipPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await sponsorshipPaymaster.depositFor(await offchainSigner.getAddress(), {
        value: ethers.utils.parseEther("1"),
      });
      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 50000, // for positive case 200k
          preVerificationGas: 55000, // min expected by bundler is 46k
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sponsorshipPaymaster.getHash(
        userOp1,
        await offchainSigner.getAddress(),
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
            ethers.utils.hexZeroPad(await offchainSigner.getAddress(), 20),
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

      console.log("userop VGL ", userOp.verificationGasLimit.toString());
      console.log("userop PVG ", userOp.preVerificationGas.toString());

      let thrownError: Error | null = null;

      try {
        await environment.sendUserOperation(userOp, entryPoint.address);
      } catch (e) {
        thrownError = e as Error;
      }

      const expectedError = new UserOperationSubmissionError(
        '{"message":"account validation failed: AA40 over verificationGasLimit'
      );

      expect(thrownError).to.contain(expectedError);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });

    it("fails if preVerificationGas is not enough", async () => {
      const feeCollectorBalanceBefore = await sponsorshipPaymaster.getBalance(
        await feeCollector.getAddress()
      );
      expect(feeCollectorBalanceBefore).to.be.equal(BigNumber.from(0));
      const signer = await sponsorshipPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await sponsorshipPaymaster.depositFor(await offchainSigner.getAddress(), {
        value: ethers.utils.parseEther("1"),
      });
      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000, // for positive case 200k
          // preVerificationGas: 55000, // min expected by bundler is 46k
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sponsorshipPaymaster.getHash(
        userOp1,
        await offchainSigner.getAddress(),
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
            ethers.utils.hexZeroPad(await offchainSigner.getAddress(), 20),
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

      console.log("userop VGL ", userOp.verificationGasLimit.toString());
      console.log("userop PVG ", userOp.preVerificationGas.toString());

      let thrownError: Error | null = null;

      try {
        await environment.sendUserOperation(userOp, entryPoint.address);
      } catch (e) {
        thrownError = e as Error;
      }

      const expectedError = new UserOperationSubmissionError(
        '{"message":"preVerificationGas too low: expected at least 45916'
      );

      expect(thrownError).to.contain(expectedError);

      // await expect(
      //   entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      // ).to.be.reverted;
    });
  });
});
