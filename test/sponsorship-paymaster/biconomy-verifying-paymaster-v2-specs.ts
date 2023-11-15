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
} from "../../typechain-types";
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

  beforeEach(async function () {
    ethersSigner = await ethers.getSigners();
    entryPoint = await deployEntryPoint();
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
      MOCK_VALID_AFTER,
      dynamicMarkup
    );
    const sig = await offchainSigner.signMessage(arrayify(hash));
    const paymasterData = abi.encode(
      ["address", "uint48", "uint48", "uint32"],
      [paymasterId, MOCK_VALID_UNTIL, MOCK_VALID_AFTER, dynamicMarkup]
    );
    const paymasterAndData = hexConcat([paymasterAddress, paymasterData, sig]);
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

    it("Should Fail when there is no deposit for paymaster id", async () => {
      const paymasterId = await depositorSigner.getAddress();
      console.log("paymaster Id ", paymasterId);
      const userOp = await getUserOpWithPaymasterInfo(paymasterId);
      console.log("entrypoint ", entryPoint.address);
      await expect(
        entryPoint.callStatic.simulateValidation(userOp)
        // ).to.be.revertedWith("FailedOp");
      ).to.be.reverted;
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
          verificationGasLimit: 200000,
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

      await entryPoint.handleOps([userOp], await offchainSigner.getAddress());
      // gas used VPM V2  162081
      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      const feeCollectorBalanceAfter =
        await verifyingSingletonPaymaster.getBalance(
          await feeCollector.getAddress()
        );
      expect(feeCollectorBalanceAfter).to.be.greaterThan(BigNumber.from(0));
    });
  });
});
