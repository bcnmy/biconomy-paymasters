import { ethers, run, network } from "hardhat";
import { mumbaiConfigInfo } from "./configs";
import {
  deployContract,
  DEPLOYMENT_SALTS,
  encodeParam,
  getDeployerInstance,
  isContract,
} from "./utils";
import { BiconomyTokenPaymaster, BiconomyTokenPaymaster__factory, ChainlinkOracleAggregator, ChainlinkOracleAggregator__factory, Deployer, Deployer__factory } from "../typechain-types";

// Read token configuration from token-config.json file
interface TokenConfig {
    tokens: Token[];
  }
  
interface Token {
    address: string;
    priceFeedAddress: string;
    description: string;
    // Add any other required properties for each token
  }

const tokenConfig: TokenConfig = mumbaiConfigInfo

const provider = ethers.provider;
let entryPointAddress =
  process.env.ENTRY_POINT_ADDRESS ||
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const owner = process.env.PAYMASTER_OWNER_ADDRESS_DEV || "";
const verifyingSigner = process.env.PAYMASTER_SIGNER_ADDRESS_DEV || "";
const DEPLOYER_CONTRACT_ADDRESS =
  process.env.DEPLOYER_CONTRACT_ADDRESS_DEV || "";

function delay(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
}

async function deployChainlinkOracleAggregatorContract(deployerInstance: Deployer, earlyOwnerAddress: string): Promise<string> {
    const ORACLE_AGGREGATOR_SALT = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(DEPLOYMENT_SALTS.ORACLE_AGGREGATOR)
    );

    const OracleAggregator = await ethers.getContractFactory("ChainlinkOracleAggregator");
    const oracleAggregatorBytecode = `${OracleAggregator.bytecode}${encodeParam(
      "address",
      earlyOwnerAddress
    ).slice(2)}`;
    const oracleAggregatorComputedAddr = await deployerInstance.addressOf(ORACLE_AGGREGATOR_SALT);
    console.log("Chainlink Oracle Aggregator Computed Address: ", oracleAggregatorComputedAddr);

    const isOracleAggregatorDeployed = await isContract(oracleAggregatorComputedAddr, provider); // true (deployed on-chain)
    if (!isOracleAggregatorDeployed) {
      try {
      await deployContract(
        DEPLOYMENT_SALTS.ORACLE_AGGREGATOR,
        oracleAggregatorComputedAddr,
        ORACLE_AGGREGATOR_SALT,
        oracleAggregatorBytecode,
        deployerInstance
      );
      await delay(10000)
    } catch (err) {
        console.log('issue with the deployment')
        console.log(err);
        return ethers.constants.AddressZero
      }
      
      try {
      await run(`verify:verify`, {
        address: oracleAggregatorComputedAddr,
        constructorArguments: [earlyOwnerAddress],
      });
    } catch (err) {
        console.log('issue with the verification ', oracleAggregatorComputedAddr)
        // console.log(err);
        return oracleAggregatorComputedAddr
      }
    } else {
      console.log("Chainlink Oracle Aggregator is already deployed with address ", oracleAggregatorComputedAddr);
    }
    return oracleAggregatorComputedAddr
}

async function deployTokenPaymasterContract(deployerInstance: Deployer, earlyOwnerAddress: string): Promise<string> {

    const salt = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(DEPLOYMENT_SALTS.TOKEN_PAYMASTER)
    );

    const BiconomyTokenPaymaster = await ethers.getContractFactory(
        "BiconomyTokenPaymaster"
      );
    const tokenPaymasterBytecode = `${
        BiconomyTokenPaymaster.bytecode
    }${encodeParam("address", earlyOwnerAddress).slice(2)}${encodeParam(
        "address",
        entryPointAddress
      ).slice(2)}${encodeParam(
        "address", verifyingSigner).slice(2)}`;

    const tokenPaymasterComputedAddr =
      await deployerInstance.addressOf(salt);
    console.log(
      "Token paymaster Computed Address: ",
      tokenPaymasterComputedAddr
    );
    const isContractDeployed = await isContract(
        tokenPaymasterComputedAddr,
      provider
    );
    if (!isContractDeployed) {
    try{
      await deployContract(
        DEPLOYMENT_SALTS.TOKEN_PAYMASTER,
        tokenPaymasterComputedAddr,
        salt,
        tokenPaymasterBytecode,
        deployerInstance
      );
      await delay(5000)
    }  catch (err) {
        console.log(err);
        console.log('issue with the deployment')
        return ethers.constants.AddressZero
      }
      try{
      await run(`verify:verify`, {
        address: tokenPaymasterComputedAddr,
        constructorArguments: [earlyOwnerAddress, entryPointAddress, verifyingSigner],
      });
    } catch (err) {
        console.log('issue with the verification ', tokenPaymasterComputedAddr)
        // console.log(err);
        return tokenPaymasterComputedAddr
      }
    } else {
      console.log(
        "Token Paymaster is Already deployed with address ",
        tokenPaymasterComputedAddr
      );
    }
    return tokenPaymasterComputedAddr
}

async function deployDerivedPriceFeed(deployerInstance: Deployer, nativeOracleAddress: string, tokenOracleAddress: string, description: string, feedSalt: string): Promise<string> {
        const salt = ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(feedSalt)
        );
    
        const DerivedPriceFeed = await ethers.getContractFactory(
            "DerivedPriceFeed"
          );

        const derivedPriceFeedBytecode = `${DerivedPriceFeed.bytecode}${ethers.utils.defaultAbiCoder.encode(["address", "address", "string"], [nativeOracleAddress, tokenOracleAddress, description]).slice(2)}`;

        const derivedPriceFeedBComputedAddr =
          await deployerInstance.addressOf(salt);
        console.log(
          "Derived Price Feed Computed Address: ",
          derivedPriceFeedBComputedAddr
        );
        const isContractDeployed = await isContract(
            derivedPriceFeedBComputedAddr,
          provider
        );
        if (!isContractDeployed) {
        try{
          await deployContract(
            feedSalt,
            derivedPriceFeedBComputedAddr,
            salt,
            derivedPriceFeedBytecode,
            deployerInstance
          );
          await delay(5000)
        } catch (err) {
            console.log(err);
            console.log('issue with the deployment')
            return ethers.constants.AddressZero
          }
          try {
          await run(`verify:verify`, {
            address: derivedPriceFeedBComputedAddr,
            constructorArguments: [nativeOracleAddress, tokenOracleAddress, description],
          });
        } catch (err) {
            console.log('issue with the verification ', derivedPriceFeedBComputedAddr)
            // console.log(err);
            return derivedPriceFeedBComputedAddr
          }
        } else {
          console.log(
            "Derived Price Feed is Already deployed with address ",
            derivedPriceFeedBComputedAddr
          );
        }
        return derivedPriceFeedBComputedAddr
}

async function setTokenOracle(oracleAggregatorInstance: ChainlinkOracleAggregator, tokenAddress: string, priceFeedAddress: string, priceFeedDecimals: number, priceFeedFunctionName: string) {
    const PriceFeedContract = await ethers.getContractAt(
        "FeedInterface",
        priceFeedAddress
      );

    // Find the function ABI based on the provided function name
    // @ts-ignore
    const functionAbi = PriceFeedContract.interface.functions[priceFeedFunctionName as keyof typeof PriceFeedContract.functions];

    // Generate the function data based on the function ABI
    const functionData = PriceFeedContract.interface.encodeFunctionData(functionAbi);
    
    const tx = await oracleAggregatorInstance.setTokenOracle(tokenAddress, priceFeedAddress, priceFeedDecimals, functionData, true);
    const receipt = await tx.wait();
    console.log(`Oracle set for ${tokenAddress} with tx hash ${receipt.transactionHash}`);
}

/*
 *  This function is added to support the flow with pre-deploying the deployer contract
 *  using the `deployer-contract.deploy.ts` script.
 */
async function getPredeployedDeployerContractInstance(): Promise<Deployer> {
  const code = await provider.getCode(DEPLOYER_CONTRACT_ADDRESS);
  const chainId = (await provider.getNetwork()).chainId;
  const [signer] = await ethers.getSigners();

  if (code === "0x") {
    console.log(
      `Deployer not deployed on chain ${chainId}, deploy it with deployer-contract.deploy.ts script before using this script.`
    );
    throw new Error("Deployer not deployed");
  } else {
    console.log(
      "Deploying with EOA %s through Deployer Contract %s",
      signer.address,
      DEPLOYER_CONTRACT_ADDRESS
    );
    return Deployer__factory.connect(DEPLOYER_CONTRACT_ADDRESS, signer);
  }
}

async function getChainlinkOracleAggregatorContractInstance(oracleAggregatorAddress: string): Promise<ChainlinkOracleAggregator> {
    const code = await provider.getCode(oracleAggregatorAddress);
    const chainId = (await provider.getNetwork()).chainId;
    const [signer] = await ethers.getSigners();
  
    if (code === "0x") {
      console.log(
        `ChainlinkOracleAggregator not deployed on chain ${chainId}, It should have been deployed as part of this script.`
      );
      throw new Error("ChainlinkOracleAggregator not deployed");
    } else {
      console.log(
        "Returning instance connected with EOA %s and address %s",
        signer.address,
        oracleAggregatorAddress
      );
      return ChainlinkOracleAggregator__factory.connect(oracleAggregatorAddress, signer);
    }
}

async function getTokenPaymasterContractInstance(tokenPaymasterAddress: string): Promise<BiconomyTokenPaymaster> {
    const code = await provider.getCode(tokenPaymasterAddress);
    const chainId = (await provider.getNetwork()).chainId;
    const [signer] = await ethers.getSigners();
  
    if (code === "0x") {
      console.log(
        `Biconomy Token Paymaster not deployed on chain ${chainId}, It should have been deployed as part of this script.`
      );
      throw new Error("Biconomy Token Paymaster not deployed");
    } else {
      console.log(
        "Returning instance connected with EOA %s and address %s",
        signer.address,
        tokenPaymasterAddress
      );
      return BiconomyTokenPaymaster__factory.connect(tokenPaymasterAddress, signer);
    }
}

async function main() {
  let tx, receipt;
  const provider = ethers.provider;

  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();

  const deployerInstance = await getPredeployedDeployerContractInstance();
  console.log("=========================================");

  // 1. Deploy Chainlink Oracle Aggregator
  // @note: owner is kept the deployer because we need to perform more actions on this contract using owner as part of other scripts
  // @note: ownership should be transferred at the end
  const oracleAggregatorAddress = await deployChainlinkOracleAggregatorContract(deployerInstance, earlyOwner);
  console.log("==================oracleAggregatorAddress=======================", oracleAggregatorAddress);
  await delay(5000)

  // 2. Deploy Token paymaster
  const tokenPaymasterAddress = await deployTokenPaymasterContract(deployerInstance, earlyOwner);
  console.log("==================tokenPaymasterAddress=======================", tokenPaymasterAddress);
  await delay(5000)

  const usdcAddress = "0xdA5289fCAAF71d52a80A254da614a192b693e977";
  const usdtAddress = "0xeaBc4b91d9375796AA4F69cC764A4aB509080A58";
  const daiAddress = "0x27a44456bEDb94DbD59D0f0A14fE977c777fC5C3";
  const sandAddress = "0xE03489D4E90b22c59c5e23d45DFd59Fc0dB8a025";


  // 3a. Deploy the derived price feeds for all chainlink supported ERC20 tokens

  // MUMBAI
  const nativeOracleAddress = "0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada";
  const usdcOracleAddress = "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0";
  const usdtOracleAddress = "0x92C09849638959196E976289418e5973CC96d645";
  const daiOracleAddress = "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046";
  const sandOracleAddress = "0x9dd18534b8f456557d11B9DDB14dA89b2e52e308";

  const usdtInfo = "USDT / MATIC";
  const usdcInfo = "USDC / MATIC";
  const daiInfo = "DAI / MATIC";
  const sandInfo = "SAND / MATIC";

  const usdcPriceFeedAddress = await deployDerivedPriceFeed(deployerInstance, nativeOracleAddress, usdcOracleAddress, usdcInfo, DEPLOYMENT_SALTS.PRICE_FEED_USDC);
  console.log("==================usdcPriceFeedAddress=======================", usdcPriceFeedAddress);
  await delay(5000)

  const usdtPriceFeedAddress = await deployDerivedPriceFeed(deployerInstance, nativeOracleAddress, usdtOracleAddress, usdtInfo, DEPLOYMENT_SALTS.PRICE_FEED_USDT);
  console.log("==================usdtPriceFeedAddress=======================", usdtPriceFeedAddress);
  await delay(5000)

  const daiPriceFeedAddress = await deployDerivedPriceFeed(deployerInstance, nativeOracleAddress, daiOracleAddress, daiInfo, DEPLOYMENT_SALTS.PRICE_FEED_DAI);
  console.log("==================daiPriceFeedAddress=======================", daiPriceFeedAddress);
  await delay(5000)

  const sandPriceFeedAddress = await deployDerivedPriceFeed(deployerInstance, nativeOracleAddress, sandOracleAddress, sandInfo, DEPLOYMENT_SALTS.PRICE_FEED_SAND);
  console.log("==================sandPriceFeedAddress=======================", sandPriceFeedAddress);
  await delay(5000)

  // 3b. If derived price feed is already available, then use that address but callData would change when setting token oracle.
  
  
  // Below addresses would be result of above 3a deployments or already deployed price feeds from 3b
  // const usdcPriceFeedAddress = "0xE9304e0e2e9A8982B3C819947568AC3dfC7bd9ca";
  // const usdtPriceFeedAddress = "0x7de3a86c4959Da92966bF1B1E3af5f6155A56032";


  // 4. set token oracle using the price feed addresses and depending on the method to call on them
  if(oracleAggregatorAddress) {
  const oracleAggregatorInstance = await getChainlinkOracleAggregatorContractInstance(oracleAggregatorAddress);
  console.log("==================oracleAggregatorInstance=======================");

  await setTokenOracle(oracleAggregatorInstance, usdcAddress, usdcPriceFeedAddress, 18, "getThePrice()");
  await setTokenOracle(oracleAggregatorInstance, usdtAddress, usdtPriceFeedAddress, 18, "getThePrice()");
  await setTokenOracle(oracleAggregatorInstance, daiAddress, daiPriceFeedAddress, 18, "getThePrice()");
  await setTokenOracle(oracleAggregatorInstance, sandAddress, sandPriceFeedAddress, 18, "getThePrice()");

  // 5a. transfer ownership of oracle aggregator to the owner
  // tx = await oracleAggregatorInstance.transferOwnership(owner)
  // receipt = await tx.wait()
  // console.log("oracleAggregatorInstance ownership transferred to %s", owner);
}

if(tokenPaymasterAddress) {
  // 5b. transfer ownership of token paymaster to the owner
  const tokenPaymasterInstance = await getTokenPaymasterContractInstance(tokenPaymasterAddress);
  console.log("==================tokenPaymasterInstance=======================");

  // tx = await tokenPaymasterInstance.transferOwnership(owner)
  // receipt = await tx.wait()
  // console.log("tokenPaymasterInstance ownership transferred to %s", owner);
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
