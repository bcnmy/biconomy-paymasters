import { ethers, run } from "hardhat";
import {
  deployContract,
  DEPLOYMENT_SALTS,
  encodeParam,
  isContract,
  delay,
} from "../utils";
import {
  BiconomyTokenPaymaster,
  BiconomyTokenPaymaster__factory,
  Deployer,
  Deployer__factory,
} from "../../typechain-types";
import { mumbaiConfigInfoProd } from "../configs";
import { TokenConfig } from "../utils/Types";

// TODO : add chainId key in config.json and make it unified
// filter based on chain and make single script based on chainId
const tokenConfig: TokenConfig = mumbaiConfigInfoProd;

const provider = ethers.provider;
const contractsDeployed: Record<string, string> = {};
const entryPointAddress =
  process.env.ENTRY_POINT_ADDRESS ||
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const verifyingSigner = process.env.PAYMASTER_SIGNER_ADDRESS_PROD || "";
const DEPLOYER_CONTRACT_ADDRESS =
  process.env.DEPLOYER_CONTRACT_ADDRESS_PROD || "";

export async function deployGeneric(
  deployerInstance: Deployer,
  salt: string,
  bytecode: string,
  contractName: string,
  constructorArguments: any[]
): Promise<string> {
  try {
    const derivedSalt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(salt));
    const computedAddress = await deployerInstance.addressOf(derivedSalt);

    console.log(`${contractName} Computed Address: ${computedAddress}`);

    const isDeployed = await isContract(computedAddress, provider); // true (deployed on-chain)
    if (!isDeployed) {
      await deployContract(
        salt,
        computedAddress,
        derivedSalt,
        bytecode,
        deployerInstance
      );
    } else {
      console.log(
        `${contractName} is Already deployed with address ${computedAddress}`
      );
    }

    await delay(10000);

    try {
      await run("verify:verify", {
        address: computedAddress,
        constructorArguments,
      });
    } catch (err) {
      console.log(err);
    }

    contractsDeployed[contractName] = computedAddress;

    return computedAddress;
  } catch (err) {
    console.log(err);
    return "";
  }
}

async function deployTokenPaymasterContract(
  deployerInstance: Deployer,
  earlyOwnerAddress: string
): Promise<string | undefined> {
  try {
    const tokenPaymasterAddress = await deployGeneric(
      deployerInstance,
      DEPLOYMENT_SALTS.TOKEN_PAYMASTER_V2,
      `${BiconomyTokenPaymaster__factory.bytecode}${encodeParam(
        "address",
        earlyOwnerAddress
      ).slice(2)}${encodeParam("address", entryPointAddress).slice(
        2
      )}${encodeParam("address", verifyingSigner).slice(2)}`,
      "BiconomyTokenPaymasterV2",
      [earlyOwnerAddress, entryPointAddress, verifyingSigner]
    );
    return tokenPaymasterAddress;
  } catch (err) {
    console.log(err);
  }
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

async function setTokenOracle(
  tokenPaymasterInstance: BiconomyTokenPaymaster,
  tokenAddress: string,
  tokenOracle: string,
  nativeOracle: string,
  isDerivedFeed: boolean,
  priceUpdateThreshold: number = 172800 // 2 days
) {
  // Connect as the owner of the token paymaster
  const tx = await tokenPaymasterInstance.setTokenOracle(
    tokenAddress,
    tokenOracle,
    nativeOracle,
    isDerivedFeed,
    priceUpdateThreshold
  );
  const receipt = await tx.wait();
  console.log(
    `Oracle set for ${tokenAddress} with tx hash ${receipt.transactionHash}`
  );
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
  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();
  if (earlyOwner === undefined) {
    throw new Error("earlyOwner is undefined");
  }

  const deployerInstance = await getPredeployedDeployerContractInstance();
  console.log("=========================================");

  // Deploy Token paymaster
  const tokenPaymasterAddress = await deployTokenPaymasterContract(
    deployerInstance,
    earlyOwner
  );
  console.log(
    "==================tokenPaymasterAddress=======================",
    tokenPaymasterAddress
  );

  let tokenPaymasterInstance;
  if (tokenPaymasterAddress) {
    tokenPaymasterInstance = await getTokenPaymasterContractInstance(
      tokenPaymasterAddress
    );
    console.log(
      "==================tokenPaymasterInstance======================="
    );
  }

  for (const token of tokenConfig.tokens) {
    // Note: In the config priceFeedAddress becomes the tokenOracleAddress
    const {
      // symbol,
      address,
      nativeOracleAddress,
      tokenOracleAddress,
      derivedFeed,
    } = token;

    let priceUpdateThreshold = token.priceUpdateThreshold;

    if (priceUpdateThreshold === null || priceUpdateThreshold === undefined) {
      priceUpdateThreshold = 172800; // 2 days default
    }

    if (!address) {
      throw new Error("token address can not be undefined");
    }
    if (tokenPaymasterInstance) {
      await setTokenOracle(
        tokenPaymasterInstance,
        address,
        nativeOracleAddress,
        tokenOracleAddress,
        derivedFeed,
        priceUpdateThreshold
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
