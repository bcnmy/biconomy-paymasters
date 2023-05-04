import { ethers } from "hardhat";

async function main() {
let tx, receipt;
const provider = ethers.provider;
  
const USDCPriceFeed = await ethers.getContractFactory("USDCPriceFeedPolygon");
const priceFeedPolygonMainnet = await USDCPriceFeed.deploy();

await priceFeedPolygonMainnet.deployed();

  console.log(
    `USDC MATIC price feed deployed at ${priceFeedPolygonMainnet.address}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
