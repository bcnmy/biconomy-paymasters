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
  MockPriceFeed__factory,
  MockToken,
  MockOracle__factory,
} from "../../../typechain-types";

// Review: Could import from scw-contracts submodules to be consistent
import { fillAndSign } from "../../utils/userOp";
import {
  EntryPoint,
  EntryPoint__factory,
  TestToken,
} from "../../../lib/account-abstraction/typechain";
import {
  EcdsaOwnershipRegistryModule,
  EcdsaOwnershipRegistryModule__factory,
} from "@biconomy-devx/account-contracts-v2/dist/types";
import { arrayify, parseEther } from "ethers/lib/utils";
import { BigNumber, BigNumberish, Signer } from "ethers";
import {
  BundlerTestEnvironment,
  EthSendUserOperationResult,
} from "../environment/bundlerEnvironment";
import { parseEvent } from "../../utils/testUtils";

export const AddressZero = ethers.constants.AddressZero;

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";
const DEFAULT_FEE_MARKUP = 1100000;
// Assume TOKEN decimals is 18, then 1 ETH = 1000 TOKENS
// const MOCK_FX = ethers.constants.WeiPerEther.mul(1000);

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

describe("Biconomy Token Paymaster (with Bundler)", function () {
  let entryPoint: EntryPoint;
  let walletOwner: Signer;
  let token: MockToken;
  let walletAddress: string, paymasterAddress: string;
  let ethersSigner: Signer;

  let offchainSigner: Signer, deployer: Signer;

  let sampleTokenPaymaster: BiconomyTokenPaymaster;

  let smartWalletImp: BiconomyAccountImplementation;
  let ecdsaModule: EcdsaOwnershipRegistryModule;
  let walletFactory: BiconomyAccountFactory;

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

    const priceFeedUsdc = await ethers.getContractAt(
      "FeedInterface",
      usdcMaticPriceFeedMock.address
    );

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

    await sampleTokenPaymaster.addStake(86400, {
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

  describe("Token Payamster functionality: positive test", () => {
    it("succeed with valid signature and valid erc20 pre approval for allowed ERC20 token: Deployed account", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const accountBalBefore = await token.balanceOf(walletAddress);
      const feeReceiverBalBefore = await token.balanceOf(paymasterAddress);

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
          preVerificationGas: 55000,
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
          preVerificationGas: 55000,
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

      const result: EthSendUserOperationResult =
        await environment.sendUserOperation(userOp, entryPoint.address);

      const receipt = (await environment.getUserOperationReceipt(result.result))
        .result;

      const event = parseEvent(receipt.receipt, UserOperationEventTopic);

      const eventLogs = entryPoint.interface.decodeEventLog(
        "UserOperationEvent",
        event[0].data
      );

      expect(eventLogs.success).to.be.true;

      const accountBalAfter = await token.balanceOf(walletAddress);
      const feeReceiverBalAfter = await token.balanceOf(paymasterAddress);

      expect(accountBalAfter).to.be.lt(accountBalBefore);
      expect(feeReceiverBalAfter).to.be.gt(feeReceiverBalBefore);

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });

    it("catch postOp is going revert and (don't process transaction by bundler)", async () => {
      const userSCW: any = BiconomyAccountImplementation__factory.connect(
        walletAddress,
        deployer
      );

      await token
        .connect(deployer)
        .transfer(walletAddress, ethers.utils.parseEther("100"));

      const accountBalBefore = await token.balanceOf(walletAddress);
      const feeReceiverBalBefore = await token.balanceOf(paymasterAddress);

      const userOp1 = await fillAndSign(
        {
          sender: walletAddress,
          verificationGasLimit: 200000,
          callData: encodeERC20Approval(
            userSCW,
            token,
            paymasterAddress,
            ethers.constants.Zero // making allowance 0 in execution
          ),
          preVerificationGas: 55000,
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
          preVerificationGas: 55000,
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

      const result: EthSendUserOperationResult =
        await environment.sendUserOperation(userOp, entryPoint.address);

      const receipt = (await environment.getUserOperationReceipt(result.result))
        .result;

      await expect(
        entryPoint.handleOps([userOp], await offchainSigner.getAddress())
      ).to.be.reverted;
    });
  });
});
