import { ethers, run } from "hardhat";
import {
  deployContract,
  DEV_DEPLOYMENT_SALTS,
  PROD_DEPLOYMENT_SALTS,
  encodeParam,
  isContract,
  paymasterStakeConfigDevx,
  paymasterStakeConfigProd,
  DEPLOYMENT_CHAIN_GAS_PRICES,
} from "./utils";
import {
  Deployer,
  Deployer__factory,
  VerifyingSingletonPaymaster__factory,
} from "../typechain-types";
import { EntryPoint__factory } from "@account-abstraction/contracts";
import { isAddress } from "ethers/lib/utils";

const provider = ethers.provider;

// Custom Entrypoint
// const entryPointAddress = "0x00000061FEfce24A79343c27127435286BB7A4E1";

// Standard Entrypoint
const entryPointAddress =
  process.env.ENTRY_POINT_ADDRESS ||
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

const DEPLOYMENT_MODE = (process.env.DEPLOYMENT_MODE || "dev") as
  | "dev"
  | "prod";
const owner =
  DEPLOYMENT_MODE === "dev"
    ? process.env.PAYMASTER_OWNER_ADDRESS_DEV
    : process.env.PAYMASTER_OWNER_ADDRESS_PROD;
const verifyingSigner =
  DEPLOYMENT_MODE === "dev"
    ? process.env.PAYMASTER_SIGNER_ADDRESS_DEV
    : process.env.PAYMASTER_SIGNER_ADDRESS_PROD;
const DEPLOYER_CONTRACT_ADDRESS =
  DEPLOYMENT_MODE === "dev"
    ? process.env.DEPLOYER_CONTRACT_ADDRESS_DEV
    : process.env.DEPLOYER_CONTRACT_ADDRESS_PROD;
const paymasterStakeConfig =
  DEPLOYMENT_MODE === "dev"
    ? paymasterStakeConfigDevx
    : paymasterStakeConfigProd;
const DEPLOYMENT_SALTS =
  DEPLOYMENT_MODE === "dev" ? DEV_DEPLOYMENT_SALTS : PROD_DEPLOYMENT_SALTS;

const contractsDeployed: Record<string, string> = {};

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

    const isDeployed = await isContract(computedAddress, provider);
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

async function deployVerifyingPaymasterContract(
  deployerInstance: Deployer,
  finalOwnerAddress: string
): Promise<string | undefined> {
  try {
    const [signer] = await ethers.getSigners();
    const chainId = (await provider.getNetwork()).chainId;

    if (!paymasterStakeConfig[chainId]) {
      throw new Error(
        `Paymaster stake config not found for chainId ${chainId}`
      );
    }

    const verifyingPaymasterBytecode = `${
      VerifyingSingletonPaymaster__factory.bytecode
    }${encodeParam("address", signer.address).slice(2)}${encodeParam(
      "address",
      entryPointAddress
    ).slice(2)}${encodeParam("address", verifyingSigner).slice(2)}`;

    const computedAddress = await deployGeneric(
      deployerInstance,
      DEPLOYMENT_SALTS.SINGELTON_PAYMASTER,
      verifyingPaymasterBytecode,
      "VerifyingSingletonPaymaster",
      [signer.address, entryPointAddress, verifyingSigner]
    );

    const verifyingPaymasterInstance =
      VerifyingSingletonPaymaster__factory.connect(
        computedAddress,
        deployerInstance.signer
      );

    // Stake the Paymaster
    console.log("Checking if Paymaster is staked...");
    const { unstakeDelayInSec, stakeInWei } = paymasterStakeConfig[chainId];
    const entrypoint = EntryPoint__factory.connect(entryPointAddress, signer);
    const stake = await entrypoint.getDepositInfo(
      verifyingPaymasterInstance.address
    );
    console.log("Current Paymaster Stake: ", JSON.stringify(stake, null, 2));
    if (stake.staked) {
      console.log("Paymaster already staked");
      return;
    }

    console.log("Staking Paymaster...");
    const contractOwner = await verifyingPaymasterInstance.owner();

    if (contractOwner === signer.address) {
      const { hash, wait } = await verifyingPaymasterInstance.addStake(
        unstakeDelayInSec,
        {
          value: stakeInWei,
          ...DEPLOYMENT_CHAIN_GAS_PRICES[chainId],
        }
      );
      console.log("Paymaster Stake Transaction Hash: ", hash);
      await wait();
    } else {
      console.log("Paymaster is not owned by signer, skipping staking...");
    }

    if (contractOwner !== finalOwnerAddress) {
      console.log("Transferring Ownership of Paymaster...");
      const { hash, wait } = await verifyingPaymasterInstance.transferOwnership(
        finalOwnerAddress,
        {
          ...DEPLOYMENT_CHAIN_GAS_PRICES[chainId],
        }
      );
      console.log("Paymaster Transfer Ownership Transaction Hash: ", hash);
      await wait();
    }
  } catch (err) {
    console.log(err);
  }
}

/*
 *  This function is added to support the flow with pre-deploying the deployer contract
 *  using the `deployer-contract.deploy.ts` script.
 */
async function getPredeployedDeployerContractInstance(): Promise<Deployer> {
  const code = await provider.getCode(DEPLOYER_CONTRACT_ADDRESS!);
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
    return Deployer__factory.connect(DEPLOYER_CONTRACT_ADDRESS!, signer);
  }
}

async function verifyDeploymentParams() {
  const chainId = (await provider.getNetwork()).chainId;

  if (!isAddress(entryPointAddress)) {
    throw new Error("Invalid entry point address");
  }
  console.log("Entry Point Address: ", entryPointAddress);

  if (!isAddress(owner ?? "")) {
    throw new Error("Invalid owner address");
  }

  console.log("Paymaster Owner Address: ", owner);

  if (!isAddress(verifyingSigner ?? "")) {
    throw new Error("Invalid verifying signer address");
  }

  console.log("Verifying Signer Address: ", verifyingSigner);

  if (!isAddress(DEPLOYER_CONTRACT_ADDRESS ?? "")) {
    throw new Error("Invalid deployer contract address");
  }

  console.log("Deployer Contract Address: ", DEPLOYER_CONTRACT_ADDRESS);

  if (!DEPLOYMENT_CHAIN_GAS_PRICES[chainId]) {
    throw new Error("Deployment gas price not found for chainId " + chainId);
  }
}

async function main() {
  const deployerInstance = await getPredeployedDeployerContractInstance();
  console.log("=========================================");

  await verifyDeploymentParams();

  // Deploy Verifying paymaster
  const verifyingPaymasterAddress = await deployVerifyingPaymasterContract(
    deployerInstance,
    owner!
  );
  console.log(
    "==================VerifyingPaymasterAddress=======================",
    verifyingPaymasterAddress
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
