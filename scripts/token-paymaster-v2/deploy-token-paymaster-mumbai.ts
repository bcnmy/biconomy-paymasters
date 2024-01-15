import { ethers, run } from "hardhat";
import {
  deployContract,
  DEPLOYMENT_SALTS,
  encodeParam,
  isContract,
} from "../utils";
import {
  BiconomyTokenPaymaster,
  BiconomyTokenPaymaster__factory,
  Deployer,
  Deployer__factory,
  ERC20__factory,
} from "../../typechain-types";
import { mumbaiConfigInfoProd } from "../configs";
import { TokenConfig } from "../utils/Types";

const tokenConfig: TokenConfig = mumbaiConfigInfoProd;

const provider = ethers.provider;
const entryPointAddress =
  process.env.ENTRY_POINT_ADDRESS ||
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
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

async function deployTokenPaymasterContract(
  deployerInstance: Deployer,
  earlyOwnerAddress: string
): Promise<string | undefined> {
  try {
    const salt = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(DEPLOYMENT_SALTS.TOKEN_PAYMASTER_V2)
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
    console.log(
      "Token paymaster Computed Address: ",
      tokenPaymasterComputedAddr
    );
    const isContractDeployed = await isContract(
      tokenPaymasterComputedAddr,
      provider
    );
    if (!isContractDeployed) {
      await deployContract(
        DEPLOYMENT_SALTS.TOKEN_PAYMASTER,
        tokenPaymasterComputedAddr,
        salt,
        tokenPaymasterBytecode,
        deployerInstance
      );
      await delay(5000);
      await run(`verify:verify`, {
        address: tokenPaymasterComputedAddr,
        constructorArguments: [
          earlyOwnerAddress,
          entryPointAddress,
          verifyingSigner,
        ],
      });
    } else {
      console.log(
        "Token Paymaster is Already deployed with address ",
        tokenPaymasterComputedAddr
      );
    }
    return tokenPaymasterComputedAddr;
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
  tokenDecimals: number,
  tokenOracle: string,
  nativeOracle: string,
  isDerivedFeed: boolean
) {
  // Connect as the owner of the token paymaster
  const tx = await tokenPaymasterInstance.setTokenOracle(
    tokenAddress,
    tokenDecimals,
    tokenOracle,
    nativeOracle,
    isDerivedFeed
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

async function getERC20TokenInstance(tokenAddress: string) {
  const [signer] = await ethers.getSigners();
  return ERC20__factory.connect(tokenAddress, signer);
}

async function main() {
  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();

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
      symbol,
      address,
      nativeOracleAddress,
      tokenOracleAddress,
      derivedFeed,
    } = token;

    let tokenDecimals = 18;

    if (address) {
      const tokenInstance = await getERC20TokenInstance(address);
      tokenDecimals = await tokenInstance.decimals();
    } else {
      throw new Error("token address can not be undefined");
    }
    if (tokenPaymasterInstance) {
      await setTokenOracle(
        tokenPaymasterInstance,
        address,
        tokenDecimals,
        nativeOracleAddress,
        tokenOracleAddress,
        derivedFeed
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
