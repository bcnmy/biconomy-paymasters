import { ethers } from "hardhat";

function delay(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

async function main() {
let tx, receipt, totalGasUsed;
totalGasUsed = 0
const provider = ethers.provider;
  
const USDCPriceFeed = await ethers.getContractFactory("USDCPriceFeedBNBTestnet");
const usdcPriceFeedBNBTestnet = await USDCPriceFeed.deploy();
await usdcPriceFeedBNBTestnet.deployed();
console.log(`USDC BNB price feed deployed at ${usdcPriceFeedBNBTestnet.address}`);
receipt = await usdcPriceFeedBNBTestnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

const USDTPriceFeed = await ethers.getContractFactory("USDTPriceFeedBNBTestnet");
const usdtPriceFeedBNBTestnet = await USDTPriceFeed.deploy();
await usdtPriceFeedBNBTestnet.deployed();
console.log(`USDT BNB price feed deployed at ${usdtPriceFeedBNBTestnet.address}`);
receipt = await usdtPriceFeedBNBTestnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

const DAIPriceFeed = await ethers.getContractFactory("DAIPriceFeedBNBTestnet");
const daiPriceFeedBNBTestnet = await DAIPriceFeed.deploy();
await daiPriceFeedBNBTestnet.deployed();
console.log(`DAI BNB price feed deployed at ${daiPriceFeedBNBTestnet.address}`);
receipt = await daiPriceFeedBNBTestnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

const AAVEPriceFeed = await ethers.getContractFactory("AAVEPriceFeedBNBTestnet");
const aavePriceFeedBNBTestnet = await AAVEPriceFeed.deploy();
await aavePriceFeedBNBTestnet.deployed();
console.log(`AAVE BNB price feed deployed at ${aavePriceFeedBNBTestnet.address}`);
receipt = await aavePriceFeedBNBTestnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

const CAKEPriceFeed = await ethers.getContractFactory("CAKEPriceFeedBNBTestnet");
const cakePriceFeedBNBTestnet = await CAKEPriceFeed.deploy();
await cakePriceFeedBNBTestnet.deployed();
console.log(`CAKE BNB price feed deployed at ${cakePriceFeedBNBTestnet.address}`);
receipt = await cakePriceFeedBNBTestnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

const LINKPriceFeed = await ethers.getContractFactory("LINKPriceFeedBNBTestnet");
const linkPriceFeedBNBTestnet = await LINKPriceFeed.deploy();
await linkPriceFeedBNBTestnet.deployed();
console.log(`LINK BNB price feed deployed at ${linkPriceFeedBNBTestnet.address}`);
receipt = await linkPriceFeedBNBTestnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

console.log("Total gas used: ", totalGasUsed)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
