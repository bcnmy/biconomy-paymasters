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

export const encodeERC20Transfer = (
    account: BiconomyAccountImplementation,
    token: TestToken,
    target: string,
    amount: BigNumber
  ) => {
    return account.interface.encodeFunctionData("executeCall", [
      token.address,
      0,
      token.interface.encodeFunctionData("transfer", [target, amount]),
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
  let charlie: string;

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
    charlie = await ethersSigner[6].getAddress();

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

  describe("Token Payamster functionality: positive test", () => {
    it("succeed with valid signature and valid erc20 pre approval for allowed ERC20 token: Deployed account", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const accountTokenBal = await token.balanceOf(walletAddress)
      const paymasterTokenBal = await token.balanceOf(paymasterAddress)
      console.log("account token balance in beginning of first test ", accountTokenBal.toString())
      console.log("paymaster token balance in beginning of first test ", paymasterTokenBal.toString())

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

      const accountTokenBalAfter = await token.balanceOf(walletAddress)
      const paymasterTokenBalAfter = await token.balanceOf(paymasterAddress)
      console.log("account token balance in end of first test ", accountTokenBalAfter.toString())
      console.log("paymaster token balance in end of first test ", paymasterTokenBalAfter.toString())

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Negative scenarios: approvals and transfers gone wrong", () => {
    it("should emit event and revert executeop if ERC20 token withdrawal fails (setting allowance to zero)", async ()  => {

      const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)

      const accountTokenBal = await token.balanceOf(walletAddress)
      const paymasterTokenBal = await token.balanceOf(paymasterAddress)
      console.log("account token balance in beginning of second test ", accountTokenBal.toString())
      console.log("paymaster token balance in beginning of second test ", paymasterTokenBal.toString())

      const currentAllowanceToPaymaster = await token.allowance(walletAddress, paymasterAddress);
      console.log("allowance to paymaster in begining of second test ", currentAllowanceToPaymaster.toString());

      const paymasterDepositBefore = await entryPoint.balanceOf(paymasterAddress);
      console.log("paymaster deposit on the entry point in beginning of second test ", paymasterDepositBefore.toString());
      

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

    const accountTokenBalAfter = await token.balanceOf(walletAddress)
    const paymasterTokenBalAfter = await token.balanceOf(paymasterAddress)
    console.log("account token balance in end of second test ", accountTokenBalAfter.toString())
    console.log("paymaster token balance in end of second test ", paymasterTokenBalAfter.toString())

    const allowanceToPaymasterAfter = await token.allowance(walletAddress, paymasterAddress);
    console.log("allowance to paymaster in end of second test ", allowanceToPaymasterAfter.toString());

    const paymasterDepositAfter = await entryPoint.balanceOf(paymasterAddress);
    console.log("paymaster deposit on the entry point in end of second test ", paymasterDepositAfter.toString());
    

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
    
    it("should emit event and revert executeop if ERC20 token withdrawal fails (by other means - transferring all tokens in userop calldata)", async ()  => {

        const userSCW: any = BiconomyAccountImplementation__factory.connect(walletAddress, deployer)
  
        const accountTokenBal = await token.balanceOf(walletAddress)
        const paymasterTokenBal = await token.balanceOf(paymasterAddress)
        const charlieTokenBal = await token.balanceOf(charlie)
        console.log("account token balance in beginning of third test ", accountTokenBal.toString())
        console.log("paymaster token balance in beginning of third test ", paymasterTokenBal.toString())
        console.log("charlie token balance in beginning of third test ", charlieTokenBal.toString())
  
        const currentAllowanceToPaymaster = await token.allowance(walletAddress, paymasterAddress);
        console.log("allowance to paymaster in begining of third test ", currentAllowanceToPaymaster.toString());

        const paymasterDepositBefore = await entryPoint.balanceOf(paymasterAddress);
        console.log("paymaster deposit on the entry point in beginning of third test ", paymasterDepositBefore.toString());
        
  
        // We make transferFrom impossible by setting allowance to zero
        const userOp1 = await fillAndSign(
          {
            sender: walletAddress,
            verificationGasLimit: 200000,
            // initCode: hexConcat([walletFactory.address, deploymentData]),
            // nonce: 0,
            callData: encodeERC20Transfer(
              userSCW,
              token,
              charlie,
              accountTokenBal // transfer all tokens to charlie
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
  
      const accountTokenBalAfter = await token.balanceOf(walletAddress)
      const paymasterTokenBalAfter = await token.balanceOf(paymasterAddress)
      const charlieTokenBalAfter = await token.balanceOf(charlie)
      console.log("account token balance in end of third test ", accountTokenBalAfter.toString())
      console.log("paymaster token balance in end of third test ", paymasterTokenBalAfter.toString())
      console.log("charlie token balance in end of third test ", charlieTokenBalAfter.toString())
  
      const allowanceToPaymasterAfter = await token.allowance(walletAddress, paymasterAddress);
      console.log("allowance to paymaster in end of second test ", allowanceToPaymasterAfter.toString());

      const paymasterDepositAfter = await entryPoint.balanceOf(paymasterAddress);
      console.log("paymaster deposit on the entry point in end of third test ", paymasterDepositAfter.toString());
  
        await expect(
          entryPoint.handleOps([userOp], await offchainSigner.getAddress())
        ).to.be.reverted;
      });
    
  });
});
