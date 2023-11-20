/* eslint-disable node/no-missing-import */
/* eslint-disable camelcase */
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  BiconomyAccountImplementation,
  BiconomyAccountImplementation__factory,
  BiconomyAccountFactory,
  BiconomyAccountFactory__factory,
  VerifyingSingletonPaymasterV2,
  VerifyingSingletonPaymasterV2__factory,
} from "../../../typechain-types";
import { fillAndSign } from "../../utils/userOp";
import { UserOperation } from "../../../lib/account-abstraction/test/UserOperation";
import {
  createAccount,
  simulationResultCatch,
} from "../../../lib/account-abstraction/test/testutils";
import {
  EntryPoint,
  EntryPoint__factory,
  SimpleAccount,
  TestToken,
  TestToken__factory,
} from "../../../lib/account-abstraction/typechain";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";
import { arrayify, hexConcat, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";
import {
  BundlerTestEnvironment,
  UserOperationSubmissionError,
} from "../environment/bundlerEnvironment";
import { getUserOpEvent } from "../../utils/testUtils";

export const AddressZero = ethers.constants.AddressZero;

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
  let entryPointStatic: EntryPoint;
  let depositorSigner: Signer;
  let walletOwner: Signer;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner;

  let offchainSigner: Signer, deployer: Signer, feeCollector: Signer;

  let verifyingSingletonPaymaster: VerifyingSingletonPaymasterV2;
  let smartWalletImp: BiconomyAccountImplementation;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
  let walletFactory: BiconomyAccountFactory;
  const abi = ethers.utils.defaultAbiCoder;

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
    entryPointStatic = entryPoint.connect(AddressZero);

    deployer = ethersSigner[0];
    offchainSigner = ethersSigner[1];
    depositorSigner = ethersSigner[2];
    feeCollector = ethersSigner[3];
    walletOwner = deployer; // ethersSigner[3];

    const offchainSignerAddress = await offchainSigner.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();
    const feeCollectorAddress = await feeCollector.getAddress();

    ecdsaModule = await new EcdsaOwnershipRegistryModule__factory(
      deployer
    ).deploy();

    verifyingSingletonPaymaster =
      await new VerifyingSingletonPaymasterV2__factory(deployer).deploy(
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

    paymasterAddress = verifyingSingletonPaymaster.address;
    console.log("Paymaster address is ", paymasterAddress);

    await entryPoint
      .connect(deployer)
      .depositTo(paymasterAddress, { value: parseEther("1") });

    await verifyingSingletonPaymaster.connect(deployer).addStake(86400, {
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
      const paymasterAndData = hexConcat([
        paymasterAddress,
        ethers.utils.defaultAbiCoder.encode(
          ["address", "uint48", "uint48", "uint32"],
          [
            await offchainSigner.getAddress(),
            MOCK_VALID_UNTIL,
            MOCK_VALID_AFTER,
            dynamicMarkup,
          ]
        ),
        "0x" + "00".repeat(65),
      ]);

      const res = await verifyingSingletonPaymaster.parsePaymasterAndData(
        paymasterAndData
      );

      expect(res.paymasterId).to.equal(await offchainSigner.getAddress());
      expect(res.validUntil).to.equal(ethers.BigNumber.from(MOCK_VALID_UNTIL));
      expect(res.validAfter).to.equal(ethers.BigNumber.from(MOCK_VALID_AFTER));
      expect(res.priceMarkup).to.equal(dynamicMarkup);
      expect(res.signature).to.equal("0x" + "00".repeat(65));
    });

    it("succeed with valid signature", async () => {
      const feeCollectorBalanceBefore =
        await verifyingSingletonPaymaster.getBalance(
          await feeCollector.getAddress()
        );
      expect(feeCollectorBalanceBefore).to.be.equal(BigNumber.from(0));
      const signer = await verifyingSingletonPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await verifyingSingletonPaymaster.depositFor(
        await offchainSigner.getAddress(),
        { value: ethers.utils.parseEther("1") }
      );
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

      const hash = await verifyingSingletonPaymaster.getHash(
        userOp1,
        await offchainSigner.getAddress(),
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        dynamicMarkup
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint48", "uint48", "uint32"],
              [
                await offchainSigner.getAddress(),
                MOCK_VALID_UNTIL,
                MOCK_VALID_AFTER,
                dynamicMarkup,
              ]
            ),
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

      await environment.sendUserOperation(userOp, entryPoint.address);

      const ev = await getUserOpEvent(entryPoint);

      // eslint-disable-next-line no-unused-expressions
      expect(ev.args.success).to.be.true;

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      const feeCollectorBalanceAfter =
        await verifyingSingletonPaymaster.getBalance(
          await feeCollector.getAddress()
        );
      expect(feeCollectorBalanceAfter).to.be.greaterThan(BigNumber.from(0));
    });

    it("fails if verificationGasLimit is not enough", async () => {
      const feeCollectorBalanceBefore =
        await verifyingSingletonPaymaster.getBalance(
          await feeCollector.getAddress()
        );
      expect(feeCollectorBalanceBefore).to.be.equal(BigNumber.from(0));
      const signer = await verifyingSingletonPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await verifyingSingletonPaymaster.depositFor(
        await offchainSigner.getAddress(),
        { value: ethers.utils.parseEther("1") }
      );
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

      const hash = await verifyingSingletonPaymaster.getHash(
        userOp1,
        await offchainSigner.getAddress(),
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        dynamicMarkup
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint48", "uint48", "uint32"],
              [
                await offchainSigner.getAddress(),
                MOCK_VALID_UNTIL,
                MOCK_VALID_AFTER,
                dynamicMarkup,
              ]
            ),
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
      const feeCollectorBalanceBefore =
        await verifyingSingletonPaymaster.getBalance(
          await feeCollector.getAddress()
        );
      expect(feeCollectorBalanceBefore).to.be.equal(BigNumber.from(0));
      const signer = await verifyingSingletonPaymaster.verifyingSigner();
      const offchainSignerAddress = await offchainSigner.getAddress();
      expect(signer).to.be.equal(offchainSignerAddress);

      await verifyingSingletonPaymaster.depositFor(
        await offchainSigner.getAddress(),
        { value: ethers.utils.parseEther("1") }
      );
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

      const hash = await verifyingSingletonPaymaster.getHash(
        userOp1,
        await offchainSigner.getAddress(),
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        dynamicMarkup
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymasterAddress,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint48", "uint48", "uint32"],
              [
                await offchainSigner.getAddress(),
                MOCK_VALID_UNTIL,
                MOCK_VALID_AFTER,
                dynamicMarkup,
              ]
            ),
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
