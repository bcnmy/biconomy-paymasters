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
  MockPriceFeed__factory,
  MockToken,
} from "../../../typechain-types";

import { fillAndSign } from "../../../account-abstraction/test/UserOp";
import {
  EntryPoint,
  EntryPoint__factory,
  TestToken,
} from "../../../account-abstraction/typechain";

export const AddressZero = ethers.constants.AddressZero;
import { arrayify, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { BundlerTestEnvironment, EthEstimateUserOperationGasResult } from "../environment/bundlerEnvironment";

const dummyPndSuffix = "0100000000000000000000000000000000000000000000000000000000deadbeef00000000000000000000000000000000000000000000000000000000000012340000000000000000000000000595ffc66a8470a73675d908099e3b7e1b18760900000000000000000000000058ea6ed41cc9d921dcac000cc5ab3e75324b5d8700000000000000000000000000000000000000000000000000000000000ee8cc000000000000000000000000000000000000000000000000000000000010c8e012ae4bff68c7b87b3f30917540608fb7fe00097f081552f5e1c3436ee07c19ee529f4a1595dabe0600b8c1a0c53408f5eabc7487fdb7536fc5febac6d1002a491c";

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const DEFAULT_FEE_MARKUP = 1100000;
// Assume TOKEN decimals is 18, then 1 ETH = 1000 TOKENS
// const MOCK_FX = ethers.constants.WeiPerEther.mul(1000);

const MOCK_FX: BigNumberish = "977100"; // matic to usdc approx

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

describe("Biconomy Token Paymaster (with Bundler)", function () {
  let entryPoint: EntryPoint;
  let walletOwner: Signer;
  let token: MockToken;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner: any;

  let offchainSigner: Signer, deployer: Signer;

  let sampleTokenPaymaster: BiconomyTokenPaymaster;
  let oracleAggregator: ChainlinkOracleAggregator;

  let smartWalletImp: BiconomyAccountImplementation;
  let walletFactory: BiconomyAccountFactory;
  const abi = ethers.utils.defaultAbiCoder;

  let environment: BundlerTestEnvironment;

  before(async function () {
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

    // Sending eth to avoid AA21 in gas estimtion. as we can't use stateOverrideSet with this bundler
    await deployer.sendTransaction({
      to: walletAddress,
      value: ethers.utils.parseEther("1"),
    });

    await entryPoint.depositTo(paymasterAddress, { value: parseEther("2") });

    await sampleTokenPaymaster.addStake(100, {
      value: parseEther("10")
    });
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

  describe("Token Payamster functionality: positive test", () => {
    it("succeed with valid signature and valid erc20 pre approval for allowed ERC20 token: Deployed account", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000, // for positive case 200k. initial value
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.MaxUint256
          ),
          preVerificationGas: 55000, // min expected by bundler is 46k
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      const dummySig = "0xba4ba51dec9d5023f0cd56a916b51fa44066de7a986fb0e27885154ff90dfe3c7eb76ad08b012c6515af93881370c04a336e8df9c8ecbf2987cf5c8216a42de61b";

      userOp1.signature = dummySig;
      userOp1.paymasterAndData = `${paymasterAddress}${dummyPndSuffix}`;

      console.log("userOp1 ", userOp1);

      const estimateResult: EthEstimateUserOperationGasResult =
      await environment.estimateUserOperation(userOp1, entryPoint.address);

      console.log("estimateResult ", estimateResult);
      console.log(
      "verification gas limit with dummyPnd ",
      BigNumber.from(estimateResult.result.verificationGasLimit).toNumber()
      );

      userOp1.verificationGasLimit = BigNumber.from(
        estimateResult.result.verificationGasLimit
      ).toNumber();

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
          preVerificationGas: 55000,
        },
        walletOwner,
        entryPoint,
        "nonce"
      );

      console.log("token paymaster pnd ", userOp.paymasterAndData);
      console.log("final vgl ", userOp.verificationGasLimit);

      await environment.sendUserOperation(userOp, entryPoint.address);

      const ev = await getUserOpEvent(entryPoint);
      expect(ev.args.success).to.be.true;

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
  });
});
