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
import { fillAndSign } from "../../account-abstraction/test/UserOp";
import { UserOperation } from "../../account-abstraction/test/UserOperation";
import { createAccount, simulationResultCatch } from "../../account-abstraction/test/testutils";
import { EntryPoint, EntryPoint__factory, SimpleAccount, TestToken, TestToken__factory } from "../../account-abstraction/typechain";

export const AddressZero = ethers.constants.AddressZero;
import { arrayify, hexConcat, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";

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
  let entryPointStatic: EntryPoint;
  let depositorSigner: Signer;
  let walletOwner: Signer;
  let proxyPaymaster: Contract;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner;

  let offchainSigner: Signer, deployer: Signer;

  let verifyingSingletonPaymaster: VerifyingSingletonPaymaster;
  let smartWalletImp: BiconomyAccountImplementation;
  let walletFactory: BiconomyAccountFactory;
  const abi = ethers.utils.defaultAbiCoder;

  beforeEach(async function () {
    ethersSigner = await ethers.getSigners();
    entryPoint = await deployEntryPoint();
    entryPointStatic = entryPoint.connect(AddressZero);

    deployer = ethersSigner[0];
    offchainSigner = ethersSigner[1];
    depositorSigner = ethersSigner[2];
    walletOwner = deployer; // ethersSigner[3];

    const offchainSignerAddress = await offchainSigner.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();

    verifyingSingletonPaymaster =
      await new VerifyingSingletonPaymaster__factory(deployer).deploy(
        await deployer.getAddress(),
        entryPoint.address,
        offchainSignerAddress,
        1200000 // 20%
      );

    smartWalletImp = await new BiconomyAccountImplementation__factory(deployer).deploy(
      entryPoint.address
    );

    walletFactory = await new BiconomyAccountFactory__factory(deployer).deploy(
      smartWalletImp.address
    );

    await walletFactory.deployCounterFactualAccount(walletOwnerAddress, 0);
    const expected = await walletFactory.getAddressForCounterFactualAccount(
      walletOwnerAddress,
      0
    );

    walletAddress = expected;
    console.log(" wallet address ", walletAddress);

    paymasterAddress = verifyingSingletonPaymaster.address;
    console.log("Paymaster address is ", paymasterAddress);

    /* await verifyingSingletonPaymaster
      .connect(deployer)
      .addStake(0, { value: parseEther("2") });
    console.log("paymaster staked"); */

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("1") });

    // const resultSet = await entryPoint.getDepositInfo(paymasterAddress);
    // console.log("deposited state ", resultSet);
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
      console.log("paymaster Id ", paymasterId);
      const userOp = await getUserOpWithPaymasterInfo(paymasterId);
      console.log("entrypoint ", entryPoint.address);
      await expect(
        entryPoint.callStatic.simulateValidation(userOp)
        // ).to.be.revertedWith("FailedOp");
      ).to.be.reverted;
    });

    it("succeed with valid signature", async () => {
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
              [
                await offchainSigner.getAddress(),
                MOCK_VALID_UNTIL,
                MOCK_VALID_AFTER,
                sig,
              ]
            ),
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );
      await entryPoint.handleOps([userOp], await offchainSigner.getAddress());
      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      // TODO
      // Owner should be able to withdraw collected fees from entry point
    });
  });
});
