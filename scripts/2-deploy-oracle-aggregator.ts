import { ethers, run, network } from "hardhat";
import {
  deployContract,
  DEPLOYMENT_SALTS,
  encodeParam,
  getDeployerInstance,
  isContract,
} from "./utils";
import { Deployer, Deployer__factory } from "../typechain-types";

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

async function deployChainlinkOracleAggregatorContract(deployerInstance: Deployer, earlyOwnerAddress: string): Promise<string | undefined> {
  try {
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
      await deployContract(
        DEPLOYMENT_SALTS.ORACLE_AGGREGATOR,
        oracleAggregatorComputedAddr,
        ORACLE_AGGREGATOR_SALT,
        oracleAggregatorBytecode,
        deployerInstance
      );
      await delay(10000)
      await run(`verify:verify`, {
        address: oracleAggregatorComputedAddr,
        constructorArguments: [earlyOwnerAddress],
      });
    } else {
      console.log("Chainlink Oracle Aggregator is already deployed with address ", oracleAggregatorComputedAddr);
    }
    return oracleAggregatorComputedAddr
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
  let tx, receipt;
  const provider = ethers.provider;

  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();

  const deployerInstance = await getPredeployedDeployerContractInstance();
  console.log("=========================================");

  // Deploy Chainlink Oracle Aggregator
  // @note: owner is kept the deployer because we need to perform more actions on this contract using owner as part of other scripts
  // @note: ownership should be transferred at the end
  const oracleAggregatorAddress = await deployChainlinkOracleAggregatorContract(deployerInstance, earlyOwner);
  console.log("==================oracleAggregatorAddress=======================", oracleAggregatorAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
