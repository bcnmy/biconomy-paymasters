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
const MOCK_SIG = "0x1234";
const MOCK_ERC20_ADDR = "0x" + "01".repeat(20);
const MOCK_FEE = "0";
const WETH9 = "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889"; // not not deploying on local devnet (yet)
// Assume TOKEN decimals is 18, then 1 ETH = 1000 TOKENS
// const MOCK_FX = ethers.constants.WeiPerEther.mul(1000);

const MOCK_FX: BigNumberish = "977100"; // matic to usdc approx
console.log("MOCK FX ", MOCK_FX); // 1000000000000000000000

export async function deployEntryPoint(
  provider = ethers.provider
): Promise<EntryPoint> {
  return new EntryPoint__factory(provider.getSigner()).deploy();
}

export const encodePaymasterData = (
  feeToken = ethers.constants.AddressZero,
  exchangeRate: BigNumberish = ethers.constants.Zero,
  fee: BigNumberish = ethers.constants.Zero
) => {
  return ethers.utils.defaultAbiCoder.encode(
    ["uint48", "uint48", "address", "uint256", "uint256"],
    [MOCK_VALID_UNTIL, MOCK_VALID_AFTER, feeToken, exchangeRate, fee]
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

describe("Biconomy Token Paymaster: with Chainlink Aggregator", function () {
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
  let oracleAggregator: ChainlinkOracleAggregator;
  let staleOracleAggregator: MockChainlinkOracleAggregator;
  let staleMockPriceFeed: MockStalePriceFeed;

  let smartWalletImp: BiconomyAccountImplementation;
  let walletFactory: BiconomyAccountFactory;
  const abi = ethers.utils.defaultAbiCoder;

  before(async function () {
    ethersSigner = await ethers.getSigners();
    entryPoint = await deployEntryPoint();
    entryPointStatic = entryPoint.connect(AddressZero);

    deployer = ethersSigner[0];
    offchainSigner = ethersSigner[1];
    depositorSigner = ethersSigner[2];
    walletOwner = deployer; // ethersSigner[3];

    // const offchainSignerAddress = await deployer.getAddress();
    const walletOwnerAddress = await walletOwner.getAddress();

    oracleAggregator = await new ChainlinkOracleAggregator__factory(deployer).deploy(walletOwnerAddress);

    staleOracleAggregator = await new MockChainlinkOracleAggregator__factory(deployer).deploy(walletOwnerAddress);

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy();
    await token.deployed();
    console.log("Test token deployed at: ", token.address);

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
    console.log("priceResult");
    console.log(priceResult);

    sampleTokenPaymaster = await new BiconomyTokenPaymaster__factory(
      deployer
    ).deploy(
      walletOwnerAddress,
      entryPoint.address,
      await offchainSigner.getAddress(),
      WETH9
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

    console.log("mint tokens to owner address..");
    await token.mint(walletOwnerAddress, ethers.utils.parseEther("1000000"));

    walletAddress = expected;
    console.log(" wallet address ", walletAddress);

    paymasterAddress = sampleTokenPaymaster.address;
    console.log("Paymaster address is ", paymasterAddress);

    await sampleTokenPaymaster
      .connect(deployer)
      .addStake(1, { value: parseEther("2") });
    console.log("paymaster staked");

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("2") });

    const resultSet = await entryPoint.getDepositInfo(paymasterAddress);
    console.log("deposited state ", resultSet);
  });

  describe("Oracle Aggregator returning unexpected values / using stale feed", () => {
    it("Query price form good and bad aggregator", async ()  => {

        const rate1 = await oracleAggregator.getTokenValueOfOneNativeToken(token.address);
        console.log(rate1);

        const rate2 = await staleOracleAggregator.getTokenValueOfOneNativeToken(token.address);
        console.log(rate2);

    });
  });
});
