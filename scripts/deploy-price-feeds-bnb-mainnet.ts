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
  
const ONEINCHPriceFeed = await ethers.getContractFactory("ONEINCHPriceFeedBNBMainnet");
const oneInchPriceFeedBNBMainnet = await ONEINCHPriceFeed.deploy();
await oneInchPriceFeedBNBMainnet.deployed();
console.log(`1INCH BNB price feed deployed at ${oneInchPriceFeedBNBMainnet.address}`);
receipt = await oneInchPriceFeedBNBMainnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

const AAVEPriceFeed = await ethers.getContractFactory("AAVEPriceFeedBNBMainnet");
const aavePriceFeedBNBMainnet = await AAVEPriceFeed.deploy();
await aavePriceFeedBNBMainnet.deployed();
console.log(`AAVE BNB price feed deployed at ${aavePriceFeedBNBMainnet.address}`);
receipt = await aavePriceFeedBNBMainnet.deployTransaction.wait();
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

// rest are already there as derived feeds with different method name

console.log("Total gas used: ", totalGasUsed)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
