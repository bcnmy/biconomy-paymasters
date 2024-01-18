import { ethers, run } from "hardhat";
import {
  deployContract,
  DEPLOYMENT_SALTS,
  encodeParam,
  isContract,
} from "./utils";
import { Deployer, Deployer__factory } from "../typechain-types";

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

// This will deploy Verifying Paymaster V1.1.0
// To deploy Verifying paymaster V1.0.0 checkout to this tag: https://github.com/bcnmy/biconomy-paymasters/blob/prod-v1.0.0/contracts/verifying/VerifyingSingletonPaymaster.sol

async function deployVerifyingPaymasterContract(
  deployerInstance: Deployer,
  earlyOwnerAddress: string
): Promise<string | undefined> {
  try {
    const salt = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(DEPLOYMENT_SALTS.SINGELTON_PAYMASTER)
    );

    const BiconomyVerifyingPaymaster = await ethers.getContractFactory(
      "VerifyingSingletonPaymaster"
    );
    const verifyingPaymasterBytecode = `${
      BiconomyVerifyingPaymaster.bytecode
    }${encodeParam("address", earlyOwnerAddress).slice(2)}${encodeParam(
      "address",
      entryPointAddress
    ).slice(2)}${encodeParam("address", verifyingSigner).slice(2)}`;

    const verifyingPaymasterComputedAddr = await deployerInstance.addressOf(
      salt
    );
    console.log(
      "Verifying paymaster Computed Address: ",
      verifyingPaymasterComputedAddr
    );
    const isContractDeployed = await isContract(
      verifyingPaymasterComputedAddr,
      provider
    );
    if (!isContractDeployed) {
      await deployContract(
        DEPLOYMENT_SALTS.SINGELTON_PAYMASTER,
        verifyingPaymasterComputedAddr,
        salt,
        verifyingPaymasterBytecode,
        deployerInstance
      );
      await delay(5000);
      await run(`verify:verify`, {
        address: verifyingPaymasterComputedAddr,
        constructorArguments: [
          earlyOwnerAddress,
          entryPointAddress,
          verifyingSigner,
        ],
      });
    } else {
      console.log(
        "Verifying Paymaster is Already deployed with address ",
        verifyingPaymasterComputedAddr
      );
    }
    return verifyingPaymasterComputedAddr;
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

async function main() {
  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();

  const deployerInstance = await getPredeployedDeployerContractInstance();
  console.log("=========================================");

  // Deploy Verifying paymaster
  const verifyingPaymasterAddress = await deployVerifyingPaymasterContract(
    deployerInstance,
    earlyOwner
  );
  console.log(
    "==================verifyingPaymasterAddress=======================",
    verifyingPaymasterAddress
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
