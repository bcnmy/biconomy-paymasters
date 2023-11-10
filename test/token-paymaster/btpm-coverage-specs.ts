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
  MockPriceFeed,
  MockPriceFeed__factory,
  MockToken,
} from "../../typechain-types";

import { fillAndSign } from "../../lib/account-abstraction/test/UserOp";
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
import { arrayify, hexConcat, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";

export const AddressZero = ethers.constants.AddressZero;

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
// Assume TOKEN decimals is 18, then 1 ETH = 1000 TOKENS
// const MOCK_FX = ethers.constants.WeiPerEther.mul(1000);

const MOCK_FX: BigNumberish = "977100"; // matic to usdc approx
console.log("MOCK FX ", MOCK_FX); // 1000000000000000000000

export async function deployEntryPoint(
  provider = ethers.provider
): Promise<EntryPoint> {
  return new EntryPoint__factory(provider.getSigner()).deploy();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

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
  let oracleAggregator: ChainlinkOracleAggregator;

  // Could also use published package or added submodule (for Account Implementation and Factory)
  let smartWalletImp: BiconomyAccountImplementation;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
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

    oracleAggregator = await new ChainlinkOracleAggregator__factory(
      deployer
    ).deploy(walletOwnerAddress);

    ecdsaModule = await new EcdsaOwnershipRegistryModule__factory(
      deployer
    ).deploy();

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
      await offchainSigner.getAddress()
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

  describe("Token Payamster Staking + Gas deposits / withdraw", () => {
    it("Owner should be able to add and withdraw stake", async () => {
      await sampleTokenPaymaster
        .connect(deployer)
        .addStake(1, { value: parseEther("2") });

      console.log("paymaster staked");
    });
  });

  describe("Pull: ether / tokens recovery", () => {
    it("only owner should be able to pull tokens, withdraw gas", async () => {
      // paymaster can receive eth
      await deployer.sendTransaction({
        to: paymasterAddress,
        value: parseEther("1"),
      });

      await token.mint(paymasterAddress, ethers.utils.parseEther("1000000"));

      const withdrawAddress = await ethersSigner[7].getAddress();

      const etherBalanceBefore = await ethers.provider.getBalance(
        withdrawAddress
      );
      console.log("balance before ", etherBalanceBefore.toString());

      const tokenBalanceBefore = await token.balanceOf(withdrawAddress);
      console.log("token balance before ", tokenBalanceBefore.toString());

      const currentGasDeposited = await sampleTokenPaymaster.deposit();
      console.log(
        "current gas in Entry Point ",
        currentGasDeposited.toString()
      );

      await sampleTokenPaymaster.transferOwnership(
        await ethersSigner[6].getAddress()
      );

      await sampleTokenPaymaster
        .connect(ethersSigner[6])
        .withdrawTo(withdrawAddress, ethers.utils.parseEther("0.2"));

      const gasasDepositedAfter = await sampleTokenPaymaster.deposit();
      console.log(
        "current gas in Entry Point ",
        gasasDepositedAfter.toString()
      );

      await expect(
        sampleTokenPaymaster
          .connect(ethersSigner[9])
          .withdrawTo(withdrawAddress, ethers.utils.parseEther("0.2"))
      ).to.be.revertedWith("Ownable: caller is not the owner");

      const etherBalanceAfter = await ethers.provider.getBalance(
        withdrawAddress
      );
      console.log("balance after ", etherBalanceBefore.toString());

      expect(
        etherBalanceBefore.add(ethers.utils.parseEther("0.2"))
      ).to.be.equal(etherBalanceAfter);

      const collectedTokens = await token.balanceOf(paymasterAddress);
      console.log("collected tokens ", collectedTokens);

      await expect(
        sampleTokenPaymaster
          .connect(ethersSigner[9])
          .withdrawERC20(token.address, withdrawAddress, collectedTokens)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        sampleTokenPaymaster
          .connect(ethersSigner[6])
          .withdrawERC20(
            token.address,
            ethers.constants.AddressZero,
            collectedTokens
          )
      ).to.be.revertedWithCustomError(
        sampleTokenPaymaster,
        "CanNotWithdrawToZeroAddress"
      );

      await sampleTokenPaymaster
        .connect(ethersSigner[6])
        .withdrawERC20(token.address, withdrawAddress, collectedTokens);

      const tokenBalanceAfter = await token.balanceOf(withdrawAddress);
      console.log("token balance after ", tokenBalanceAfter.toString());

      expect(tokenBalanceBefore.add(collectedTokens)).to.be.equal(
        tokenBalanceAfter
      );

      await sampleTokenPaymaster.connect(ethersSigner[6]).unlockStake();

      await delay(1000);

      await sampleTokenPaymaster
        .connect(ethersSigner[6])
        .withdrawStake(withdrawAddress);

      await token.mint(paymasterAddress, ethers.utils.parseEther("100"));

      const withdrawAddressNew = await ethersSigner[8].getAddress();

      await sampleTokenPaymaster
        .connect(ethersSigner[6])
        .withdrawERC20Full(token.address, withdrawAddressNew);

      expect(await token.balanceOf(withdrawAddressNew)).to.be.equal(
        ethers.utils.parseEther("100")
      );

      await token.mint(paymasterAddress, ethers.utils.parseEther("200"));

      await sampleTokenPaymaster
        .connect(ethersSigner[6])
        .withdrawMultipleERC20(
          [token.address, token.address],
          withdrawAddressNew,
          [ethers.utils.parseEther("100"), ethers.utils.parseEther("100")]
        );

      expect(await token.balanceOf(withdrawAddressNew)).to.be.equal(
        ethers.utils.parseEther("300")
      );

      await token.mint(paymasterAddress, ethers.utils.parseEther("200"));

      await sampleTokenPaymaster
        .connect(ethersSigner[6])
        .withdrawMultipleERC20Full(
          [token.address, token.address],
          withdrawAddressNew
        );

      expect(await token.balanceOf(withdrawAddressNew)).to.be.equal(
        ethers.utils.parseEther("500")
      );

      const ethBalanceOfDestBefore = await ethers.provider.getBalance(
        withdrawAddressNew
      );

      await sampleTokenPaymaster
        .connect(ethersSigner[6])
        .withdrawAllNative(withdrawAddressNew);

      const ethBalanceOfDestAfter = await ethers.provider.getBalance(
        withdrawAddressNew
      );

      expect(ethBalanceOfDestAfter.sub(ethBalanceOfDestBefore)).to.be.equal(
        parseEther("1")
      );

      expect(await ethers.provider.getBalance(paymasterAddress)).to.be.equal(
        parseEther("0")
      );
    });
  });
});
