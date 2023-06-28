import { ethers, run, network } from "hardhat";
import { bnbMainnetConfigInfoDev } from "./configs";
import { Token, TokenConfig } from "./utils/Types";
import {
  deployContract,
  DEPLOYMENT_SALTS,
  encodeParam,
  getDeployerInstance,
  isContract,
} from "./utils";
import { BiconomyTokenPaymaster, BiconomyTokenPaymaster__factory, ChainlinkOracleAggregator, ChainlinkOracleAggregator__factory, Deployer, Deployer__factory } from "../typechain-types";

const tokenConfig: TokenConfig = bnbMainnetConfigInfoDev

const provider = ethers.provider;
let entryPointAddress =
  process.env.ENTRY_POINT_ADDRESS ||
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const owner = process.env.PAYMASTER_OWNER_ADDRESS_PROD || "";
const verifyingSigner = process.env.PAYMASTER_SIGNER_ADDRESS_PROD || "";
const DEPLOYER_CONTRACT_ADDRESS =
  process.env.DEPLOYER_CONTRACT_ADDRESS_PROD || "";

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

  const usdcAddress = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  const usdtAddress = "0x55d398326f99059fF775485246999027B3197955";
  const aaveAddress = "0xfb6115445Bff7b52FeB98650C87f44907E58f802";
  const cakeAddress = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
  const daiAddress = "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3";
  const oneInchAddress = "0x111111111117dC0aa78b770fA6A738034120C302";
  const linkAddress = "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD";
  const twtAddress = "0x4b0f1812e5df2a09796481ff14017e6005508003";


  // 3a. Deploy the derived price feeds for all chainlink supported ERC20 tokens

  // BNB MAINNET
  const nativeOracleAddress = "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE";
  const aaveOracleAddress = "0xA8357BF572460fC40f4B0aCacbB2a6A61c89f475";
  const oneInchOracleAddress = "0x9a177Bb9f5b6083E962f9e62bD21d4b5660Aeb03";

  // below oracles are not needed because derived price feeds are already available on mainnet
  // const usdcOracleAddress = "0x51597f405303C4377E36123cBc172b13269EA163";
  // const usdtOracleAddress = "0xB97Ad0E74fa7d920791E90258A6E2085088b4320";
  // const daiOracleAddress = "0x132d3C0B1D2cEa0BC552588063bdBb210FDeecfA";
  // const linkOracleAddress = "0xca236E327F629f9Fc2c30A4E95775EbF0B89fac8";
  // const cakeOracleAddress = "0xB6064eD41d4f67e353768aA239cA86f4F73665a1";

  const aaveInfo = "AAVE / BNB";
  const onceInchInfo = "1INCH / BNB";

  const aavePriceFeedAddress = await deployDerivedPriceFeed(deployerInstance, nativeOracleAddress, aaveOracleAddress, aaveInfo, DEPLOYMENT_SALTS.PRICE_FEED_AAVE);
  console.log("==================aavePriceFeedAddress=======================", aavePriceFeedAddress);
  await delay(5000)

  const onceInchPriceFeedAddress = await deployDerivedPriceFeed(deployerInstance, nativeOracleAddress, oneInchOracleAddress, onceInchInfo, DEPLOYMENT_SALTS.PRICE_FEED_1INCH);
  console.log("==================onceInchPriceFeedAddress=======================", onceInchPriceFeedAddress);
  await delay(5000)

  let oracleAggregatorInstance;
  if (oracleAggregatorAddress) {
    oracleAggregatorInstance = await getChainlinkOracleAggregatorContractInstance(oracleAggregatorAddress);
    console.log("==================oracleAggregatorInstance=======================");
  }

  // 3a. Deploy the derived price feeds for all chainlink supported ERC20 tokens  
  for (const token of tokenConfig.tokens) {
    const { symbol, address, nativeOracleAddress, tokenOracleAddress, priceFeedAddress, description, priceFeedFunction, feedSalt, derivedFeed } = token;

    const derivedPriceFeedAddress = await deployDerivedPriceFeed(deployerInstance, nativeOracleAddress, tokenOracleAddress, description, feedSalt);
    console.log(`==================${symbol} PriceFeedAddress=======================`, derivedPriceFeedAddress);
    await delay(5000);

    // Continue with other steps like setting token oracle, transferring ownership, etc.
    // Use the derivedPriceFeedAddress and other token-specific information as needed
    // ...

    // 4. Set token oracle on oracle aggregator
    if (oracleAggregatorInstance) {
      let feedAddress = derivedPriceFeedAddress
      if(priceFeedFunction == "latestAnswer()" || derivedFeed == false) {
        feedAddress = priceFeedAddress
      }
      await setTokenOracle(oracleAggregatorInstance, address, feedAddress, 18, priceFeedFunction);
    }
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
