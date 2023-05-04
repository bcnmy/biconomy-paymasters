import { ethers } from "hardhat";

async function main() {
let tx, receipt;
const provider = ethers.provider;
  
const USDCPriceFeed = await ethers.getContractFactory("USDCPriceFeedMumbai");
const priceFeedMumbai = await USDCPriceFeed.deploy();

await priceFeedMumbai.deployed();

  console.log(
    `USDC MATIC price feed deployed at ${priceFeedMumbai.address}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
