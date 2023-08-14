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
  ChainlinkOracleAggregator,
  ChainlinkOracleAggregator__factory,
  MockChainlinkOracleAggregator__factory,
  MockPriceFeed,
  MockStalePriceFeed__factory,
  MockStalePriceFeed,
  MockPriceFeed__factory,
  MockToken,
  MockChainlinkOracleAggregator,
} from "../../../typechain-types";

import { fillAndSign } from "../../../account-abstraction/test/UserOp";
import {
  EntryPoint,
  EntryPoint__factory,
  TestToken,
} from "../../../account-abstraction/typechain";

export const AddressZero = ethers.constants.AddressZero;
import { arrayify, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";
import { BundlerTestEnvironment } from "../environment/bundlerEnvironment";

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const DEFAULT_FEE_MARKUP = 1100000;

const MOCK_FX: BigNumberish = "977100"; // matic to usdc approx

export const encodePaymasterData = (
  feeToken = ethers.constants.AddressZero,
  oracleAggregator = ethers.constants.AddressZero,
  exchangeRate: BigNumberish = ethers.constants.Zero,
  priceMarkup: BigNumberish = ethers.constants.Zero
) => {
  return ethers.utils.defaultAbiCoder.encode(
    ["uint48", "uint48", "address", "address", "uint256", "uint32"],
    [
      MOCK_VALID_UNTIL,
      MOCK_VALID_AFTER,
      feeToken,
      oracleAggregator,
      exchangeRate,
      priceMarkup,
    ]
  );
};

export async function getUserOpEvent(ep: EntryPoint) {
  const [log] = await ep.queryFilter(
    ep.filters.UserOperationEvent(),
    await ethers.provider.getBlockNumber()
  );
  return log;
}

export const encodeERC20Approval = (
  account: BiconomyAccountImplementation,
  token: TestToken,
  spender: string,
  amount: BigNumber
) => {
  return account.interface.encodeFunctionData("executeCall", [
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
  let oracleAggregator: ChainlinkOracleAggregator;
  let staleOracleAggregator: MockChainlinkOracleAggregator;

  let smartWalletImp: BiconomyAccountImplementation;
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
    walletOwner = deployer; // ethersSigner[3];

    // const offchainSignerAddress = await deployer.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();

    oracleAggregator = await new ChainlinkOracleAggregator__factory(
      deployer
    ).deploy(walletOwnerAddress);
    staleOracleAggregator = await new MockChainlinkOracleAggregator__factory(
      deployer
    ).deploy(walletOwnerAddress);

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy();
    await token.deployed();

    const usdcMaticPriceFeedMock = await new MockPriceFeed__factory(
      deployer
    ).deploy();

    const priceFeedUsdc = await ethers.getContractAt(
      "FeedInterface",
      usdcMaticPriceFeedMock.address
    );

    const priceFeedTxUsdc: any =
      await priceFeedUsdc.populateTransaction.getThePrice();

    await oracleAggregator.setTokenOracle(
      token.address,
      usdcMaticPriceFeedMock.address,
      18,
      priceFeedTxUsdc.data,
      true
    );

    const stalePriceFeedMock = await new MockStalePriceFeed__factory(
      deployer
    ).deploy();

    const priceFeedStale = await ethers.getContractAt(
      "FeedInterface",
      stalePriceFeedMock.address
    );

    const priceFeedTxStale: any =
      await priceFeedStale.populateTransaction.getThePrice();

    await staleOracleAggregator.setTokenOracle(
      token.address,
      stalePriceFeedMock.address,
      18,
      priceFeedTxStale.data,
      true
    );

    const priceResult = await oracleAggregator.getTokenValueOfOneNativeToken(
      token.address
    );

    sampleTokenPaymaster = await new BiconomyTokenPaymaster__factory(
      deployer
    ).deploy(
      walletOwnerAddress,
      entryPoint.address,
      await offchainSigner.getAddress()
    );

    smartWalletImp = await new BiconomyAccountImplementation__factory(
      deployer
    ).deploy(entryPoint.address);

    walletFactory = await new BiconomyAccountFactory__factory(deployer).deploy(
      smartWalletImp.address
    );

    await walletFactory.deployCounterFactualAccount(walletOwnerAddress, 0);

    const expected = await walletFactory.getAddressForCounterFactualAccount(
      walletOwnerAddress,
      0
    );

    await token.mint(walletOwnerAddress, ethers.utils.parseEther("1000000"));

    walletAddress = expected;

    paymasterAddress = sampleTokenPaymaster.address;

    await sampleTokenPaymaster
      .connect(deployer)
      .addStake(1, { value: parseEther("2") });

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("2") });
  });

  after(async function () {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== BundlerTestEnvironment.BUNDLER_ENVIRONMENT_CHAIN_ID) {
      this.skip();
    }

    await Promise.all([
      environment.revert(environment.defaultSnapshot!),
      environment.resetBundler(),
    ]);
  });

  describe("Token Paymaster with good and bad oracle aggregator", () => {
    it("succeed with fallback exchange rate in case price feed reverts", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const owner = await walletOwner.getAddress();
      const AccountFactory = await ethers.getContractFactory(
        "SmartAccountFactory"
      );
      const deploymentData = AccountFactory.interface.encodeFunctionData(
        "deployCounterFactualAccount",
        [owner, 0]
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
        staleOracleAggregator.address,
        MOCK_FX,
        DEFAULT_FEE_MARKUP
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            encodePaymasterData(
              token.address,
              staleOracleAggregator.address,
              MOCK_FX,
              DEFAULT_FEE_MARKUP
            ),
            sig,
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

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

      const ev = await getUserOpEvent(entryPoint);
      expect(ev.args.success).to.be.true;

      const BiconomyTokenPaymaster = await ethers.getContractFactory(
        "BiconomyTokenPaymaster"
      );

      const eventLogs = BiconomyTokenPaymaster.interface.decodeEventLog(
        "TokenPaymasterOperation",
        receipt.logs[3].data
      );

      // Confirming that it's using backup (external) exchange rate in case oracle aggregator / price feed is stale / anything goes wrong
      expect(eventLogs.exchangeRate.toString()).to.be.equal(MOCK_FX);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });

    it("succeed with exchange rate based on prcie feed in case everything goes well", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      const rate1 = await oracleAggregator.getTokenValueOfOneNativeToken(
        token.address
      );

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const owner = await walletOwner.getAddress();
      const AccountFactory = await ethers.getContractFactory(
        "SmartAccountFactory"
      );
      const deploymentData = AccountFactory.interface.encodeFunctionData(
        "deployCounterFactualAccount",
        [owner, 0]
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
        oracleAggregator.address,
        MOCK_FX,
        DEFAULT_FEE_MARKUP
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            encodePaymasterData(
              token.address,
              oracleAggregator.address,
              MOCK_FX,
              DEFAULT_FEE_MARKUP
            ),
            sig,
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

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

      const ev = await getUserOpEvent(entryPoint);
      expect(ev.args.success).to.be.true;

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

    it("succeed with fallback exchange rate in case oracle aggregator is 0 address", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const owner = await walletOwner.getAddress();
      const AccountFactory = await ethers.getContractFactory(
        "SmartAccountFactory"
      );
      const deploymentData = AccountFactory.interface.encodeFunctionData(
        "deployCounterFactualAccount",
        [owner, 0]
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
        ethers.constants.AddressZero,
        MOCK_FX,
        DEFAULT_FEE_MARKUP
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            encodePaymasterData(
              token.address,
              ethers.constants.AddressZero,
              MOCK_FX,
              DEFAULT_FEE_MARKUP
            ),
            sig,
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

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

      const ev = await getUserOpEvent(entryPoint);
      expect(ev.args.success).to.be.true;

      const BiconomyTokenPaymaster = await ethers.getContractFactory(
        "BiconomyTokenPaymaster"
      );

      const eventLogs = BiconomyTokenPaymaster.interface.decodeEventLog(
        "TokenPaymasterOperation",
        receipt.logs[3].data
      );

      // Confirming that it's using backup (external) exchange rate in case oracle aggregator / price feed is stale / anything goes wrong
      expect(eventLogs.exchangeRate).to.be.equal(MOCK_FX);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
  });
});
