import { ethers } from "hardhat";

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function main() {
let tx, receipt;
const provider = ethers.provider;
  
const USDCPriceFeed = await ethers.getContractFactory("USDCPriceFeedMumbai");
const usdcPriceFeedMumbai = await USDCPriceFeed.deploy();
await usdcPriceFeedMumbai.deployed();
console.log(`USDC MATIC price feed deployed at ${usdcPriceFeedMumbai.address}`);
await delay(5000)


const USDTPriceFeed = await ethers.getContractFactory("USDTPriceFeedMumbai");
const usdtPriceFeedMumbai = await USDTPriceFeed.deploy();
await usdtPriceFeedMumbai.deployed();
console.log(`USDT MATIC price feed deployed at ${usdtPriceFeedMumbai.address}`);
await delay(5000)
  
const DAIPriceFeed = await ethers.getContractFactory("DAIPriceFeedMumbai");
const daiPriceFeedMumbai = await DAIPriceFeed.deploy();
await daiPriceFeedMumbai.deployed();
console.log(`DAI MATIC price feed deployed at ${daiPriceFeedMumbai.address}`);
await delay(5000)
  
  
const SANDPriceFeed = await ethers.getContractFactory("SANDPriceFeedMumbai");
const sandPriceFeedMumbai = await SANDPriceFeed.deploy();
await sandPriceFeedMumbai.deployed();
console.log(`SAND MATIC price feed deployed at ${sandPriceFeedMumbai.address}`);
await delay(5000)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
