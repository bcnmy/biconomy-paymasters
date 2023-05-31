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



import { fillAndSign } from "../../account-abstraction/test/UserOp";
import { UserOperation } from "../../account-abstraction/test/UserOperation";
import { createAccount, simulationResultCatch } from "../../account-abstraction/test/testutils";
import { EntryPoint, EntryPoint__factory, SimpleAccount, TestToken, TestToken__factory } from "../../account-abstraction/typechain";

export const AddressZero = ethers.constants.AddressZero;
import { arrayify, hexConcat, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract, Signer } from "ethers";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const MOCK_SIG = "0x1234";
const MOCK_ERC20_ADDR = "0x" + "01".repeat(20);
const DEFAULT_FEE_MARKUP = 1100000;
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
  oracleAggregator = ethers.constants.AddressZero,
  exchangeRate: BigNumberish = ethers.constants.Zero,
  priceMarkup: BigNumberish = ethers.constants.Zero
) => {
  return ethers.utils.defaultAbiCoder.encode(
    ["uint48", "uint48", "address", "address", "uint256", "uint32"],
    [MOCK_VALID_UNTIL, MOCK_VALID_AFTER, feeToken, oracleAggregator, exchangeRate, priceMarkup]
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

    // const resultSet = await entryPoint.getDepositInfo(paymasterAddress);
    // console.log("deposited state ", resultSet);
  });

  describe("Token Payamster read methods and state checks", () => {
    it("Should parse data properly", async () => {
      const paymasterAndData = ethers.utils.hexConcat([
        paymasterAddress,
        ethers.utils.hexlify(1).slice(0, 4),
        encodePaymasterData(token.address, oracleAggregator.address, MOCK_FX, DEFAULT_FEE_MARKUP),
        "0x" + "00".repeat(65),
      ]);

      const res = await sampleTokenPaymaster.parsePaymasterAndData(
        paymasterAndData
      );

      expect(res.priceSource).to.equal(1);
      expect(res.priceMarkup).to.equal(DEFAULT_FEE_MARKUP);
      expect(res.validUntil).to.equal(ethers.BigNumber.from(MOCK_VALID_UNTIL));
      expect(res.validAfter).to.equal(ethers.BigNumber.from(MOCK_VALID_AFTER));
      expect(res.feeToken).to.equal(token.address);
      expect(res.oracleAggregator).to.equal(oracleAggregator.address);
      expect(res.exchangeRate).to.equal(MOCK_FX);
      expect(res.signature).to.equal("0x" + "00".repeat(65));
    });

    it("should check the correct states set on the paymaster", async () => {
      const owner = await sampleTokenPaymaster.owner();

      const verifyingSigner = await sampleTokenPaymaster.verifyingSigner();

      const feeReceiver = await sampleTokenPaymaster.feeReceiver();

      console.log(
        "current values from contracts",
        owner,
        verifyingSigner,
        feeReceiver
      );

      expect(owner).to.be.equal(await walletOwner.getAddress());
      expect(verifyingSigner).to.be.equal(await offchainSigner.getAddress());
      expect(feeReceiver).to.be.equal(paymasterAddress);
    });
  });

  describe("Token Payamster functionality: positive test", () => {
    it("succeed with valid signature and valid erc20 pre approval for allowed ERC20 token: Deployed account", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)

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
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
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
            encodePaymasterData(token.address, oracleAggregator.address, MOCK_FX, DEFAULT_FEE_MARKUP),
            sig,
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const requiredPrefund = ethers.BigNumber.from(userOp.callGasLimit)
        .add(ethers.BigNumber.from(userOp.verificationGasLimit).mul(3))
        .add(userOp.preVerificationGas)
        .mul(userOp.maxFeePerGas);

      console.log("required prefund ", requiredPrefund.toString());

      const initBalance = await token.balanceOf(paymasterAddress);
      console.log("fee receiver token balance before ", initBalance.toString());

      const preTokenBalanceForAccount = await token.balanceOf(walletAddress);
      console.log(
        "smart account erc20 balance before",
        preTokenBalanceForAccount.toString()
      );

      const tx = await entryPoint.handleOps(
        [userOp],
        await offchainSigner.getAddress()
      );
      const receipt = await tx.wait();
      console.log(
        "fees paid in native ",
        receipt.effectiveGasPrice.mul(receipt.gasUsed).toString()
      );

      console.log("gas used ");
      console.log(receipt.gasUsed.toNumber());

      const postBalance = await token.balanceOf(paymasterAddress);
      console.log("fee receiver token balance after ", postBalance.toString());

      const postTokenBalanceForAccount = await token.balanceOf(walletAddress);
      console.log(
        "smart account erc20 balance after",
        postTokenBalanceForAccount.toString()
      );

      console.log(
        "required prefund in token terms ",
        requiredPrefund
          .mul(MOCK_FX)
          .div(ethers.constants.WeiPerEther)
          .toString()
      );

      const ev = await getUserOpEvent(entryPoint);
      expect(ev.args.success).to.be.true;

      /* expect(postBalance.sub(initBalance)).to.be.greaterThan(
        ethers.constants.Zero
      );
      expect(postBalance.sub(initBalance)).to.be.lessThanOrEqual(
        requiredPrefund.mul(MOCK_FX).div(ethers.constants.WeiPerEther)
      ); */

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Negative scenarios: invalid and wrong signatures", () => {
    it("should revert on invalid signature length", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)
    
      const userOp = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            encodePaymasterData(token.address, oracleAggregator.address, MOCK_FX),
            '0x1234',
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      await expect(entryPoint.callStatic.simulateValidation(userOp))
      .to.be.revertedWithCustomError(entryPoint, "FailedOp")
      .withArgs(0, "AA33 reverted: BTPM: invalid signature length in paymasterAndData");
    });

    it("should revert (from EntryPoint) on invalid paymaster and data length", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)
    
      const userOp = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
          paymasterAndData: '0x1234',
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      await expect(entryPoint.callStatic.simulateValidation(userOp))
      .to.be.revertedWith("AA93 invalid paymasterAndData")
    });

    it("should revert (from Paymaster) on invalid paymaster and data length", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)
    
      const userOp = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            '0x1234',
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      await expect(entryPoint.callStatic.simulateValidation(userOp))
      .to.be.revertedWithCustomError(entryPoint, "FailedOp")
      .withArgs(0, "AA33 reverted: BTPM: Invalid length for paymasterAndData");
    });

    it("should revert on invalid signature", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)
    
      const userOp = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            encodePaymasterData(token.address, oracleAggregator.address, MOCK_FX),
            "0x" + "00".repeat(65),
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      await expect(entryPoint.callStatic.simulateValidation(userOp))
      .to.be.revertedWithCustomError(entryPoint, "FailedOp")
      .withArgs(0, "AA33 reverted: ECDSA: invalid signature"); 
    });

    it("should revert with wrong signature", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)

      const sig = await offchainSigner.signMessage(ethers.utils.arrayify("0xdead"));
    
      const wrongUserOp = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            encodePaymasterData(token.address, oracleAggregator.address, MOCK_FX),
            sig,
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const ret = await entryPoint.callStatic.simulateValidation(wrongUserOp).catch(simulationResultCatch);
      expect(ret.returnInfo.sigFailed).to.be.true;

      await expect(entryPoint.estimateGas.handleOps([wrongUserOp], await offchainSigner.getAddress()))
        .to.to.be.revertedWithCustomError(entryPoint, "FailedOp")
        .withArgs(0, "AA34 signature error");
    });
  });

  describe("Negative scenarios: approvals and transfers gone wrong", () => {
    it("should revert if ERC20 token withdrawal fails", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      // We make transferFrom impossible by setting allowance to zero
      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.Zero 
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
            encodePaymasterData(token.address, oracleAggregator.address, MOCK_FX, DEFAULT_FEE_MARKUP),
            sig,
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

    const initBalance = await token.balanceOf(paymasterAddress);

      await expect(entryPoint.handleOps(
        [userOp],
        await offchainSigner.getAddress()
      )).to.emit(sampleTokenPaymaster, "TokenPaymentDue")


    const postBalance = await token.balanceOf(paymasterAddress);

    const ev = await getUserOpEvent(entryPoint);
    // Review this because despite explicit revert bundler still pays gas
    expect(ev.args.success).to.be.false;
    expect(postBalance.sub(initBalance)).to.equal(ethers.constants.Zero);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });

    it("should revert if price markup charged is too darn high", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      // We make transferFrom impossible by setting allowance to zero
      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          // initCode: hexConcat([walletFactory.address, deploymentData]),
          // nonce: 0,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.Zero 
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
        2200000 // > 2x!
      );
      const sig = await offchainSigner.signMessage(arrayify(hash));
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: ethers.utils.hexConcat([
            paymasterAddress,
            ethers.utils.hexlify(1).slice(0, 4),
            encodePaymasterData(token.address, oracleAggregator.address, MOCK_FX, 2200000),
            sig,
          ]),
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

    const initBalance = await token.balanceOf(paymasterAddress);

    await expect(entryPoint.estimateGas.handleOps([userOp], await offchainSigner.getAddress()))
    .to.to.be.revertedWithCustomError(entryPoint, "FailedOp")
    .withArgs(0, "AA33 reverted: BTPM: price markup percentage too high");
    });

    
    });

  describe("Token paymaster Access control", () => {
    it("Owner can modify the states", async () => {
      const newSigner = await ethersSigner[5].getAddress();
      const newOwner = await ethersSigner[6].getAddress();
      const newFeeReceiver = await ethersSigner[7].getAddress();
      const newOverhead = 30000;

      let verifyingSigner = await sampleTokenPaymaster.verifyingSigner();

      let feeReceiver = await sampleTokenPaymaster.feeReceiver();

      let unaccountedCost = await sampleTokenPaymaster.UNACCOUNTED_COST();

      let owner = await sampleTokenPaymaster.owner();

      console.log(
        "current values from contracts",
        verifyingSigner,
        feeReceiver,
        unaccountedCost,
        owner,
      );

      await sampleTokenPaymaster.connect(ethersSigner[0]).setFeeReceiver(newFeeReceiver);
      await sampleTokenPaymaster.connect(ethersSigner[0]).setVerifyingSigner(newSigner);
      await sampleTokenPaymaster.connect(ethersSigner[0]).setUnaccountedEPGasOverhead(newOverhead);
      await sampleTokenPaymaster.connect(ethersSigner[0]).transferOwnership(newOwner);

      verifyingSigner = await sampleTokenPaymaster.verifyingSigner();

      feeReceiver = await sampleTokenPaymaster.feeReceiver();

      unaccountedCost = await sampleTokenPaymaster.UNACCOUNTED_COST();

      owner = await sampleTokenPaymaster.owner(); 

      expect(unaccountedCost).to.be.equal(newOverhead);
      expect(feeReceiver).to.be.equal(newFeeReceiver);
      expect(verifyingSigner).to.be.equal(newSigner);
      expect(owner).to.be.equal(newOwner);

      await expect(sampleTokenPaymaster.connect(ethersSigner[0]).setFeeReceiver(newFeeReceiver))
      .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("only owner should be able to pull tokens, withdraw gas", async () => {

      const withdrawAddress = await ethersSigner[7].getAddress();

      const etherBalanceBefore = await ethers.provider.getBalance(withdrawAddress);
      console.log("balance before ", etherBalanceBefore.toString());

      const tokenBalanceBefore = await token.balanceOf(withdrawAddress);
      console.log("token balance before ", tokenBalanceBefore.toString());

      const currentGasDeposited = await sampleTokenPaymaster.deposit()
      console.log("current gas in Entry Point ", currentGasDeposited.toString());
      
      await sampleTokenPaymaster.connect(ethersSigner[6]).withdrawTo(withdrawAddress, ethers.utils.parseEther("0.2"));

      const gasasDepositedAfter = await sampleTokenPaymaster.deposit()
      console.log("current gas in Entry Point ", gasasDepositedAfter.toString());

      await expect(sampleTokenPaymaster.connect(ethersSigner[9]).withdrawTo(withdrawAddress, ethers.utils.parseEther("0.2")))
      .to.be.revertedWith("Ownable: caller is not the owner");

      const etherBalanceAfter = await ethers.provider.getBalance(withdrawAddress);
      console.log("balance after ", etherBalanceBefore.toString());

      expect(etherBalanceBefore.add(ethers.utils.parseEther("0.2"))).to.be.equal(etherBalanceAfter);

      const collectedTokens = await token.balanceOf(paymasterAddress);
      console.log("collected tokens ", collectedTokens)

      await expect(sampleTokenPaymaster.connect(ethersSigner[9]).withdrawERC20(token.address, withdrawAddress, collectedTokens))
      .to.be.revertedWith("Ownable: caller is not the owner");

      await sampleTokenPaymaster.connect(ethersSigner[6]).withdrawERC20(token.address, withdrawAddress, collectedTokens);

      const tokenBalanceAfter = await token.balanceOf(withdrawAddress);
      console.log("token balance after ", tokenBalanceAfter.toString());

      expect(tokenBalanceBefore.add(collectedTokens)).to.be.equal(tokenBalanceAfter); 

      await sampleTokenPaymaster.connect(ethersSigner[6]).unlockStake();
      await sampleTokenPaymaster.connect(ethersSigner[6]).withdrawStake(withdrawAddress);

      // todo
      // Add test cases for pulling ether out of paymaster contract
      // Add test cases for batch withdraw tokens
    });
  });
});
