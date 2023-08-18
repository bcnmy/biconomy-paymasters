import { ethers } from "hardhat";
import { DEPLOYMENT_SALTS, isContract } from "./utils";
import { Deployer, Deployer__factory } from "../typechain-types";
import { TokenPaymaster__factory } from "@account-abstraction/contracts";
import { BigNumber } from "ethers";
import { EntryPoint__factory } from "../account-abstraction/typechain";
import { formatEther } from "ethers/lib/utils";

const provider = ethers.provider;
const DEPLOYER_CONTRACT_ADDRESS =
  process.env.DEPLOYER_CONTRACT_ADDRESS_PROD || "";
const entrypointAddress =
  process.env.ENTRY_POINT_ADDRESS ||
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const entrypointContract = EntryPoint__factory.connect(
  entrypointAddress,
  provider
);

type PaymasterStakeConfig = {
  unstakeDelayInSec: number;
  paymasterStakeInWei: BigNumber;
};

const paymasterStakeConfig: Record<number, PaymasterStakeConfig> = {
  80001: {
    unstakeDelayInSec: 60 * 60 * 24, // 1 Day
    paymasterStakeInWei: ethers.utils.parseEther("0.001"),
  },
};

async function stakePaymaster(deployerInstance: Deployer) {
  try {
    const salt = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(DEPLOYMENT_SALTS.TOKEN_PAYMASTER)
    );

    const tokenPaymasterComputedAddr = await deployerInstance.addressOf(salt);
    console.log(
      "Token paymaster Computed Address: ",
      tokenPaymasterComputedAddr
    );

    // Ensure that the token paymaster is deployed
    const isContractDeployed = await isContract(
      tokenPaymasterComputedAddr,
      provider
    );
    if (!isContractDeployed) {
      throw new Error(
        `Token Paymaster is not deployed on address ${tokenPaymasterComputedAddr}, deploy it with 1-deployer-token-paymaster.ts script before using this script.`
      );
    }

    // Ensure that the token paymaster is not already staked
    const depositInfo = await entrypointContract.getDepositInfo(
      tokenPaymasterComputedAddr
    );
    if (depositInfo.staked) {
      throw new Error(
        `Token Paymaster is already staked with ${formatEther(
          depositInfo.stake
        )} native tokens, unstake it before using this script`
      );
    }

    const paymaster = TokenPaymaster__factory.connect(
      tokenPaymasterComputedAddr,
      deployerInstance.signer
    );

    const chainId = (await provider.getNetwork()).chainId;
    if (!paymasterStakeConfig[chainId]) {
      throw new Error(
        `Paymaster stake config not found for chainId ${chainId}`
      );
    }

    const { unstakeDelayInSec, paymasterStakeInWei } =
      paymasterStakeConfig[chainId];

    const { hash, wait } = await paymaster.addStake(unstakeDelayInSec, {
      value: paymasterStakeInWei,
    });
    console.log("Paymaster Stake Transaction Hash: ", hash);
    const { status } = await wait();
    console.log(
      "Paymaster Stake Transaction Status: ",
      status === 1 ? "Success" : "Failed"
    );
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
  const deployerInstance = await getPredeployedDeployerContractInstance();
  console.log("=========================================");

  // Stake Token Paymaster
  await stakePaymaster(deployerInstance);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
