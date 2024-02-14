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
  MockStalePriceFeed__factory,
  MockPriceFeed__factory,
  MockToken,
  MockOracle__factory,
} from "../../../typechain-types";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";

// Review: Could import from scw-contracts submodules to be consistent
import { fillAndSign } from "../../utils/userOp";
import {
  EntryPoint,
  EntryPoint__factory,
  TestToken,
} from "../../../lib/account-abstraction/typechain";
import { arrayify, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";
import { BundlerTestEnvironment } from "../environment/bundlerEnvironment";
import { getUserOpEvent, parseEvent } from "../../utils/testUtils";

export const AddressZero = ethers.constants.AddressZero;

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const DEFAULT_FEE_MARKUP = 1100000;

const MOCK_FX: BigNumberish = "977100"; // matic to usdc approx

const UserOperationEventTopic =
  "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

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

describe("Biconomy Token Paymaster (With Bundler)", function () {
  let entryPoint: EntryPoint;
  let walletOwner: Signer;
  let token: MockToken;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner: any;

  let offchainSigner: Signer, deployer: Signer;

  let sampleTokenPaymaster: BiconomyTokenPaymaster;

  // Could also use published package or added submodule (for Account Implementation and Factory)
  let smartWalletImp: BiconomyAccountImplementation;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
  let walletFactory: BiconomyAccountFactory;

  let environment: BundlerTestEnvironment;

  before(async function () {
    ethersSigner = await ethers.getSigners();

    // Setup the Bundler Environment
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== BundlerTestEnvironment.BUNDLER_ENVIRONMENT_CHAIN_ID) {
      this.skip();
    }
    environment = await BundlerTestEnvironment.getDefaultInstance();

    ethersSigner = await ethers.getSigners();
    deployer = ethersSigner[0];

    entryPoint = EntryPoint__factory.connect(process.env.ENTRYPOINT!, deployer);

    offchainSigner = ethersSigner[1];
    walletOwner = deployer; // ethersSigner[0];

    // const offchainSignerAddress = await deployer.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();

    ecdsaModule = await new EcdsaOwnershipRegistryModule__factory(
      deployer
    ).deploy();

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy();
    await token.deployed();

    const usdcMaticPriceFeedMock = await new MockPriceFeed__factory(
      deployer
    ).deploy();

    const nativeOracle = await new MockOracle__factory(deployer).deploy(
      82843594,
      "MATIC/USD"
    );
    const tokenOracle = await new MockOracle__factory(deployer).deploy(
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
      tokenOracle.address,
      nativeOracle.address,
      true,
      172800 // 2 days
    );
    const priceResult =
      await sampleTokenPaymaster.getTokenValueOfOneNativeToken(token.address);

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

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("2") });

    await sampleTokenPaymaster.addStake(100, {
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

  describe("Token Paymaster with good and bad oracle aggregator", () => {
    it("succeed with exchange rate based on prcie feed in case everything goes well", async () => {
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
          preVerificationGas: 50000,
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

      const { result: userOpHash } = await environment.sendUserOperation(
        userOp,
        entryPoint.address
      );

      const {
        result: {
          receipt: { transactionHash },
        },
      } = await environment.getUserOperationReceipt(userOpHash);
      const receipt = await ethers.provider.getTransactionReceipt(
        transactionHash
      );

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

    // TODO
    // it("succeed with fallback exchange rate in case price feed reverts", async () => {
  });
});
