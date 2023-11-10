import { ethers, run, network } from "hardhat";
import { optimismMainnetConfigInfoProd } from "./configs";
import { Token, TokenConfig } from "./utils/Types";
import {
  deployContract,
  DEPLOYMENT_SALTS,
  encodeParam,
  getDeployerInstance,
  isContract,
} from "./utils";
import {
  BiconomyTokenPaymaster,
  BiconomyTokenPaymaster__factory,
  ChainlinkOracleAggregator,
  ChainlinkOracleAggregator__factory,
  Deployer,
  Deployer__factory,
} from "../typechain-types";

const tokenConfig: TokenConfig = optimismMainnetConfigInfoProd;

const provider = ethers.provider;
const entryPointAddress =
  process.env.ENTRY_POINT_ADDRESS ||
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const owner = process.env.PAYMASTER_OWNER_ADDRESS_DEV || "";
const verifyingSigner = process.env.PAYMASTER_SIGNER_ADDRESS_DEV || "";
const DEPLOYER_CONTRACT_ADDRESS_DEV =
  process.env.DEPLOYER_CONTRACT_ADDRESS_DEV || "";
const DEPLOYER_CONTRACT_ADDRESS_PROD =
  process.env.DEPLOYER_CONTRACT_ADDRESS_PROD || "";

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function deployChainlinkOracleAggregatorContract(
  deployerInstance: Deployer,
  earlyOwnerAddress: string
): Promise<string> {
  const ORACLE_AGGREGATOR_SALT = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(DEPLOYMENT_SALTS.ORACLE_AGGREGATOR)
  );

  const OracleAggregator = await ethers.getContractFactory(
    "ChainlinkOracleAggregator"
  );
  const oracleAggregatorBytecode = `${OracleAggregator.bytecode}${encodeParam(
    "address",
    earlyOwnerAddress
  ).slice(2)}`;
  const oracleAggregatorComputedAddr = await deployerInstance.addressOf(
    ORACLE_AGGREGATOR_SALT
  );
  console.log(
    "Chainlink Oracle Aggregator Computed Address: ",
    oracleAggregatorComputedAddr
  );

  const isOracleAggregatorDeployed = await isContract(
    oracleAggregatorComputedAddr,
    provider
  ); // true (deployed on-chain)
  if (!isOracleAggregatorDeployed) {
    try {
      await deployContract(
        DEPLOYMENT_SALTS.ORACLE_AGGREGATOR,
        oracleAggregatorComputedAddr,
        ORACLE_AGGREGATOR_SALT,
        oracleAggregatorBytecode,
        deployerInstance
      );
      await delay(10000);
    } catch (err) {
      console.log("issue with the deployment");
      console.log(err);
      return ethers.constants.AddressZero;
    }

    try {
      await run(`verify:verify`, {
        address: oracleAggregatorComputedAddr,
        constructorArguments: [earlyOwnerAddress],
      });
    } catch (err) {
      console.log("issue with the verification ", oracleAggregatorComputedAddr);
      // console.log(err);
      return oracleAggregatorComputedAddr;
    }
  } else {
    console.log(
      "Chainlink Oracle Aggregator is already deployed with address ",
      oracleAggregatorComputedAddr
    );
  }
  return oracleAggregatorComputedAddr;
}

async function deployTokenPaymasterContract(
  deployerInstance: Deployer,
  earlyOwnerAddress: string
): Promise<string> {
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
  ).slice(2)}${encodeParam("address", verifyingSigner).slice(2)}`;

  const tokenPaymasterComputedAddr = await deployerInstance.addressOf(salt);
  console.log("Token paymaster Computed Address: ", tokenPaymasterComputedAddr);
  const isContractDeployed = await isContract(
    tokenPaymasterComputedAddr,
    provider
  );
  if (!isContractDeployed) {
    try {
      await deployContract(
        DEPLOYMENT_SALTS.TOKEN_PAYMASTER,
        tokenPaymasterComputedAddr,
        salt,
        tokenPaymasterBytecode,
        deployerInstance
      );
      await delay(10000);
    } catch (err) {
      console.log(err);
      console.log("issue with the deployment");
      return ethers.constants.AddressZero;
    }
    try {
      await run(`verify:verify`, {
        address: tokenPaymasterComputedAddr,
        constructorArguments: [
          earlyOwnerAddress,
          entryPointAddress,
          verifyingSigner,
        ],
      });
    } catch (err) {
      console.log("issue with the verification ", tokenPaymasterComputedAddr);
      // console.log(err);
      return tokenPaymasterComputedAddr;
    }
  } else {
    console.log(
      "Token Paymaster is Already deployed with address ",
      tokenPaymasterComputedAddr
    );
  }
  return tokenPaymasterComputedAddr;
}

async function deployDerivedPriceFeed(
  deployerInstance: Deployer,
  nativeOracleAddress: string,
  tokenOracleAddress: string,
  description: string,
  feedSalt: string
): Promise<string> {
  const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(feedSalt));

  const DerivedPriceFeed = await ethers.getContractFactory("DerivedPriceFeed");

  const derivedPriceFeedBytecode = `${
    DerivedPriceFeed.bytecode
  }${ethers.utils.defaultAbiCoder
    .encode(
      ["address", "address", "string"],
      [nativeOracleAddress, tokenOracleAddress, description]
    )
    .slice(2)}`;

  const derivedPriceFeedBComputedAddr = await deployerInstance.addressOf(salt);
  console.log(
    "Derived Price Feed Computed Address: ",
    derivedPriceFeedBComputedAddr
  );
  const isContractDeployed = await isContract(
    derivedPriceFeedBComputedAddr,
    provider
  );
  if (!isContractDeployed) {
    try {
      await deployContract(
        feedSalt,
        derivedPriceFeedBComputedAddr,
        salt,
        derivedPriceFeedBytecode,
        deployerInstance
      );
      await delay(10000);
    } catch (err) {
      console.log(err);
      console.log("issue with the deployment");
      return ethers.constants.AddressZero;
    }
    try {
      await run(`verify:verify`, {
        address: derivedPriceFeedBComputedAddr,
        constructorArguments: [
          nativeOracleAddress,
          tokenOracleAddress,
          description,
        ],
      });
    } catch (err) {
      console.log(
        "issue with the verification ",
        derivedPriceFeedBComputedAddr
      );
      // console.log(err);
      return derivedPriceFeedBComputedAddr;
    }
  } else {
    console.log(
      "Derived Price Feed is Already deployed with address ",
      derivedPriceFeedBComputedAddr
    );
  }
  return derivedPriceFeedBComputedAddr;
}

async function setTokenOracle(
  oracleAggregatorInstance: ChainlinkOracleAggregator,
  tokenAddress: string,
  priceFeedAddress: string,
  priceFeedDecimals: number,
  priceFeedFunctionName: string
) {
  const PriceFeedContract = await ethers.getContractAt(
    "FeedInterface",
    priceFeedAddress
  );

  // Find the function ABI based on the provided function name
  // @ts-ignore
  const functionAbi =
    PriceFeedContract.interface.functions[
      priceFeedFunctionName as keyof typeof PriceFeedContract.functions
    ];

  // Generate the function data based on the function ABI
  const functionData =
    PriceFeedContract.interface.encodeFunctionData(functionAbi);

  const tx = await oracleAggregatorInstance.setTokenOracle(
    tokenAddress,
    priceFeedAddress,
    priceFeedDecimals,
    functionData,
    true
  );
  const receipt = await tx.wait();
  console.log(
    `Oracle set for ${tokenAddress} with tx hash ${receipt.transactionHash}`
  );
}

/*
 *  This function is added to support the flow with pre-deploying the deployer contract
 *  using the `deployer-contract.deploy.ts` script.
 */
async function getPredeployedDeployerContractInstanceDEV(): Promise<Deployer> {
  const code = await provider.getCode(DEPLOYER_CONTRACT_ADDRESS_DEV);
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
      DEPLOYER_CONTRACT_ADDRESS_DEV
    );
    return Deployer__factory.connect(DEPLOYER_CONTRACT_ADDRESS_DEV, signer);
  }
}

async function getPredeployedDeployerContractInstancePROD(): Promise<Deployer> {
  const code = await provider.getCode(DEPLOYER_CONTRACT_ADDRESS_PROD);
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
      DEPLOYER_CONTRACT_ADDRESS_PROD
    );
    return Deployer__factory.connect(DEPLOYER_CONTRACT_ADDRESS_PROD, signer);
  }
}

async function getChainlinkOracleAggregatorContractInstance(
  oracleAggregatorAddress: string
): Promise<ChainlinkOracleAggregator> {
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
    return ChainlinkOracleAggregator__factory.connect(
      oracleAggregatorAddress,
      signer
    );
  }
}

async function getTokenPaymasterContractInstance(
  tokenPaymasterAddress: string
): Promise<BiconomyTokenPaymaster> {
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
    return BiconomyTokenPaymaster__factory.connect(
      tokenPaymasterAddress,
      signer
    );
  }
}

async function main() {
  let tx, receipt;
  const provider = ethers.provider;

  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();

  const deployerInstanceDEV = await getPredeployedDeployerContractInstanceDEV();
  console.log("=========================================");

  const deployerInstancePROD =
    await getPredeployedDeployerContractInstancePROD();
  console.log("=========================================");

  // 1. Deploy Chainlink Oracle Aggregator
  // @note: owner is kept the deployer because we need to perform more actions on this contract using owner as part of other scripts
  // @note: ownership should be transferred at the end
  const oracleAggregatorAddress = await deployChainlinkOracleAggregatorContract(
    deployerInstancePROD,
    earlyOwner
  );
  console.log(
    "==================oracleAggregatorAddress=======================",
    oracleAggregatorAddress
  );
  await delay(10000);

  // 2. Deploy Token paymaster
  const tokenPaymasterAddress = await deployTokenPaymasterContract(
    deployerInstancePROD,
    earlyOwner
  );
  console.log(
    "==================tokenPaymasterAddress=======================",
    tokenPaymasterAddress
  );
  await delay(10000);

  let oracleAggregatorInstance;
  if (oracleAggregatorAddress) {
    oracleAggregatorInstance =
      await getChainlinkOracleAggregatorContractInstance(
        oracleAggregatorAddress
      );
    console.log(
      "==================oracleAggregatorInstance======================="
    );
  }

  // 3a. Deploy the derived price feeds for all chainlink supported ERC20 tokens
  for (const token of tokenConfig.tokens) {
    const {
      symbol,
      address,
      nativeOracleAddress,
      tokenOracleAddress,
      priceFeedAddress,
      description,
      priceFeedFunction,
      feedSalt,
      derivedFeed,
    } = token;
    let derivedPriceFeedAddress = priceFeedAddress;

    if (derivedPriceFeedAddress == "") {
      derivedPriceFeedAddress = await deployDerivedPriceFeed(
        deployerInstanceDEV,
        nativeOracleAddress,
        tokenOracleAddress,
        description,
        feedSalt
      );
      console.log(
        `==================${symbol} PriceFeedAddress=======================`,
        derivedPriceFeedAddress
      );
      await delay(10000);
    }

    // Continue with other steps like setting token oracle, transferring ownership, etc.
    // Use the derivedPriceFeedAddress and other token-specific information as needed
    // ...

    // 4. Set token oracle on oracle aggregator
    if (oracleAggregatorInstance) {
      let feedAddress = derivedPriceFeedAddress;
      if (priceFeedFunction == "latestAnswer()" || derivedFeed == false) {
        feedAddress = priceFeedAddress;
      }
      // TODO
      // This should not hardcode tokenOracleDeciamls to 18
      // It works in case of derived price feeds and chainlink feeds which are in the erc20 / native base and quote format.
      await setTokenOracle(
        oracleAggregatorInstance,
        address,
        feedAddress,
        18,
        priceFeedFunction
      );
    }
  }

  if (tokenPaymasterAddress) {
    // 5b. transfer ownership of token paymaster to the owner
    const tokenPaymasterInstance = await getTokenPaymasterContractInstance(
      tokenPaymasterAddress
    );
    console.log(
      "==================tokenPaymasterInstance======================="
    );

    // tx = await tokenPaymasterInstance.transferOwnership(owner)
    // receipt = await tx.wait()
    // console.log("tokenPaymasterInstance ownership transferred to %s", owner);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
