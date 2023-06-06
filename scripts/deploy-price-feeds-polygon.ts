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

const gasPrices = {maxFeePerGas: 250e9, maxPriorityFeePerGas: 60e9}
  
const USDCPriceFeed = await ethers.getContractFactory("USDCPriceFeedPolygon");
const usdcPriceFeedPolygonMainnet = await USDCPriceFeed.deploy(gasPrices);
await usdcPriceFeedPolygonMainnet.deployed();
console.log(`USDC MATIC price feed deployed at ${usdcPriceFeedPolygonMainnet.address}`);
await delay(10000)


const USDTPriceFeed = await ethers.getContractFactory("USDTPriceFeedPolygon");
const usdtPriceFeedPolygonMainnet = await USDTPriceFeed.deploy(gasPrices);
await usdtPriceFeedPolygonMainnet.deployed();
console.log(`USDT MATIC price feed deployed at ${usdtPriceFeedPolygonMainnet.address}`);
await delay(10000)

const DAIPriceFeed = await ethers.getContractFactory("DAIPriceFeedPolygon");
const daiPriceFeedPolygonMainnet = await DAIPriceFeed.deploy(gasPrices);
await daiPriceFeedPolygonMainnet.deployed();
console.log(`DAI MATIC price feed deployed at ${daiPriceFeedPolygonMainnet.address}`);
await delay(10000)

const SANDPriceFeed = await ethers.getContractFactory("SANDPriceFeedPolygon");
const sandPriceFeedPolygonMainnet = await SANDPriceFeed.deploy(gasPrices);
await sandPriceFeedPolygonMainnet.deployed();
console.log(`SAND MATIC price feed deployed at ${sandPriceFeedPolygonMainnet.address}`);
await delay(10000)

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
