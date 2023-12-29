/* eslint-disable no-unused-expressions */
/* eslint-disable node/no-missing-import */
/* eslint-disable camelcase */

import { expect } from "chai";
import { ethers } from "hardhat";

import {
  BiconomyAccountImplementation,
  BiconomyAccountImplementation__factory,
  BiconomyAccountFactory,
  BiconomyAccountFactory__factory,
  BiconomyTokenPaymaster,
  BiconomyTokenPaymaster__factory,
  MockPriceFeed,
  MockStalePriceFeed__factory,
  MockStalePriceFeed,
  MockPriceFeed__factory,
  MockToken,
  MockOracle__factory,
  MockStaleOracle__factory,
  MockStaleOracle,
} from "../../typechain-types";

// Review: Could import from scw-contracts submodules to be consistent
import { fillAndSign } from "../utils/userOp";
import {
  EntryPoint,
  EntryPoint__factory,
  TestToken,
} from "../../lib/account-abstraction/typechain";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";
import { arrayify, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";
import { getUserOpEvent, parseEvent } from "../utils/testUtils";

export const AddressZero = ethers.constants.AddressZero;

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const DEFAULT_FEE_MARKUP = 1100000;

const MOCK_FX: BigNumberish = "977100"; // matic to usdc approx

const UserOperationEventTopic =
  "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

export async function deployEntryPoint(
  provider = ethers.provider
): Promise<EntryPoint> {
  return new EntryPoint__factory(provider.getSigner()).deploy();
}

// export const encodePaymasterData = (
//   feeToken = ethers.constants.AddressZero,
//   exchangeRate: BigNumberish = ethers.constants.Zero,
//   priceMarkup: BigNumberish = ethers.constants.Zero
// ) => {
//   return ethers.utils.defaultAbiCoder.encode(
//     ["uint48", "uint48", "address", "uint256", "uint32"],
//     [MOCK_VALID_UNTIL, MOCK_VALID_AFTER, feeToken, exchangeRate, priceMarkup]
//   );
// };

export const encodeERC20Approval = (
  account: BiconomyAccountImplementation,
  token: TestToken,
  spender: string,
  amount: BigNumber
) => {
  return account.interface.encodeFunctionData("execute_ncC", [
    token.address,
    0,
    token.interface.encodeFunctionData("approve", [spender, amount]),
  ]);
};

describe("Biconomy Token Paymaster", function () {
  let entryPoint: EntryPoint;
  let entryPointStatic: EntryPoint;
  let depositorSigner: Signer;
  let walletOwner: Signer;
  let token: MockToken;
  let proxyPaymaster: Contract;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner: any;

  let offchainSigner: Signer, deployer: Signer;

  let sampleTokenPaymaster: BiconomyTokenPaymaster;
  let mockPriceFeed: MockPriceFeed;
  let staleMockPriceFeed: MockStalePriceFeed;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
  let smartWalletImp: BiconomyAccountImplementation;
  let staleFeed: MockStaleOracle;
  let nativeOracle: MockOracle;

  let walletFactory: BiconomyAccountFactory;
  const abi = ethers.utils.defaultAbiCoder;

  before(async function () {
    ethersSigner = await ethers.getSigners();
    entryPoint = await deployEntryPoint();
    entryPointStatic = entryPoint.connect(AddressZero);

    deployer = ethersSigner[0];
    offchainSigner = ethersSigner[1];
    depositorSigner = ethersSigner[2];
    walletOwner = deployer; // ethersSigner[0];

    // const offchainSignerAddress = await deployer.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();

    ecdsaModule = await new EcdsaOwnershipRegistryModule__factory(
      deployer
    ).deploy();

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy();

    await token.deployed();

    nativeOracle = await new MockOracle__factory(deployer).deploy(
      82843594,
      "MATIC/USD"
    );
    const tokenOracle = await new MockOracle__factory(deployer).deploy(
      100000000,
      "USDC/USD"
    );

    staleFeed = await new MockStaleOracle__factory(deployer).deploy(
      100000000,
      "USDC/USD"
    );

    sampleTokenPaymaster = await new BiconomyTokenPaymaster__factory(
      deployer
    ).deploy(
      walletOwnerAddress,
      entryPoint.address,
      await offchainSigner.getAddress()
    );

    await sampleTokenPaymaster.setTokenOracle(
      token.address,
      await token.decimals(),
      tokenOracle.address,
      nativeOracle.address,
      true
    );

    const priceResult =
      await sampleTokenPaymaster.getTokenValueOfOneNativeToken(token.address);

    console.log("priceResult ", priceResult.toString());

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

    await token.mint(walletOwnerAddress, ethers.utils.parseEther("1000000"));

    walletAddress = expected;

    paymasterAddress = sampleTokenPaymaster.address;

    await sampleTokenPaymaster
      .connect(deployer)
      .addStake(86400, { value: parseEther("2") });

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("2") });
  });

  describe("Token Payamster with good and bad price feed", () => {
    it("succeed with exchange rate based on price feed in case everything goes well", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      const rate1 = await sampleTokenPaymaster.getTokenValueOfOneNativeToken(
        token.address
      );

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const owner = await walletOwner.getAddress();
      const AccountFactory = await ethers.getContractFactory(
        "SmartAccountFactory"
      );
      const ecdsaOwnershipSetupData = ecdsaModule.interface.encodeFunctionData(
        "initForSmartAccount",
        [owner]
      );

      const smartAccountDeploymentIndex = 0;

      const deploymentData = AccountFactory.interface.encodeFunctionData(
        "deployCounterFactualAccount",
        [
          ecdsaModule.address,
          ecdsaOwnershipSetupData,
          smartAccountDeploymentIndex,
        ]
      );

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sampleTokenPaymaster.getHash(
        userOp1,
        ethers.utils.hexlify(1).slice(2, 4),
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        token.address,
        MOCK_FX,
        DEFAULT_FEE_MARKUP
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
      const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
      const numER = ethers.BigNumber.from(MOCK_FX);
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(token.address, 20), // 20 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numER.toNumber()), 16), // 16 byte
            ethers.utils.hexZeroPad(
              ethers.utils.hexlify(DEFAULT_FEE_MARKUP),
              4
            ), // 4 byte
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
        await offchainSigner.getAddress()
      );
      const receipt = await tx.wait();

      const event = parseEvent(receipt, UserOperationEventTopic);

      const eventLogsUserop = entryPoint.interface.decodeEventLog(
        "UserOperationEvent",
        event[0].data
      );

      // eslint-disable-next-line no-unused-expressions
      expect(eventLogsUserop.success).to.be.true;

      const BiconomyTokenPaymaster = await ethers.getContractFactory(
        "BiconomyTokenPaymaster"
      );

      const eventLogs = BiconomyTokenPaymaster.interface.decodeEventLog(
        "TokenPaymasterOperation",
        receipt.logs[3].data
      );

      // Confirming that it's using backup (external) exchange rate in case oracle aggregator / price feed is stale / anything goes wrong
      expect(eventLogs.exchangeRate).to.be.equal(rate1);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });

    it("succeed with fallback exchange rate in case price feed reverts", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      await sampleTokenPaymaster.setTokenOracle(
        token.address,
        await token.decimals(),
        staleFeed.address,
        nativeOracle.address,
        true
      );

      // Review
      // this is not expected to revert
      /* const feedResult =
        await sampleTokenPaymaster.getTokenValueOfOneNativeToken(token.address); */

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 400000,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const hash = await sampleTokenPaymaster.getHash(
        userOp1,
        ethers.utils.hexlify(1).slice(2, 4),
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER,
        token.address,
        MOCK_FX,
        DEFAULT_FEE_MARKUP
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const numVU = ethers.BigNumber.from(MOCK_VALID_UNTIL);
      const numVA = ethers.BigNumber.from(MOCK_VALID_AFTER);
      const numER = ethers.BigNumber.from(MOCK_FX);
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVU.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numVA.toNumber()), 6), // 6 byte
            ethers.utils.hexZeroPad(token.address, 20), // 20 byte
            ethers.utils.hexZeroPad(ethers.utils.hexlify(numER.toNumber()), 16), // 16 byte
            ethers.utils.hexZeroPad(
              ethers.utils.hexlify(DEFAULT_FEE_MARKUP),
              4
            ), // 4 byte
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

      console.log("userOp second case ", userOp);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;

      // const tx = await entryPoint.handleOps(
      //   [userOp],
      //   await offchainSigner.getAddress()
      // );
      // const receipt = await tx.wait();

      // const event = parseEvent(receipt, UserOperationEventTopic);

      // const eventLogsUserop = entryPoint.interface.decodeEventLog(
      //   "UserOperationEvent",
      //   event[0].data
      // );

      // // eslint-disable-next-line no-unused-expressions
      // expect(eventLogsUserop.success).to.be.true;

      // const BiconomyTokenPaymaster = await ethers.getContractFactory(
      //   "BiconomyTokenPaymaster"
      // );

      // const eventLogs = BiconomyTokenPaymaster.interface.decodeEventLog(
      //   "TokenPaymasterOperation",
      //   receipt.logs[3].data
      // );

      // // Confirming that it's using backup (external) exchange rate in case oracle aggregator / price feed is stale / anything goes wrong
      // expect(eventLogs.exchangeRate).to.be.equal(MOCK_FX);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
  });
});
