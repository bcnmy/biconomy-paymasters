import { ethers } from "hardhat";

async function main() {
  let tx, receipt;
  const provider = ethers.provider;

  const accounts = await ethers.getSigners();

  const earlyOwner = await accounts[0].getAddress();
  const verifyingSigner = "0x37ca4D86A0e33502F7CD93e0C88AFa2F172d39a1";
  const entryPoint =
    process.env.ENTRY_POINT_ADDRESS ||
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  const StackupPaymaster = await ethers.getContractFactory(
    "StackupVerifyingPaymaster"
  );
  const stackupPaymaster = await StackupPaymaster.deploy(
    entryPoint,
    verifyingSigner
  );

  await stackupPaymaster.deployed();

  console.log(`StackupPaymaster deployed at ${stackupPaymaster.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
