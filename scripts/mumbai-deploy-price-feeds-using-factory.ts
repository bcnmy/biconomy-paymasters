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
totalGasUsed = 0;
const provider = ethers.provider;

// const gasPrices = {maxFeePerGas: 250e9, maxPriorityFeePerGas: 60e9}

// Should only be deployed once
const DerivedPriceFeedFactory = await ethers.getContractFactory("DerivedPriceFeedFactory");
const deployerFactory = await DerivedPriceFeedFactory.deploy();
await deployerFactory.deployed();
console.log(`Derived price feed factory deployed at ${deployerFactory.address}`);
await delay(10000)

const derivedFeedFactoryAddress = "";

// MUMBAI
const nativeOracleAddress = "0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada";
const usdcOracleAddress = "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0";
const usdtOracleAddress = "0x92C09849638959196E976289418e5973CC96d645";
const daiOracleAddress = "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046";
const sandOracleAddress = "0x9dd18534b8f456557d11B9DDB14dA89b2e52e308";

const usdtInfo = "USDT / MATIC";
const usdcInfo = "USDC / MATIC";
const daiInfo = "DAI / MATIC";
const sandInfo = "SAND / MATIC";

tx = await deployerFactory.deployDerivedPriceFeed(nativeOracleAddress, usdcOracleAddress, usdcInfo);
receipt = await tx.wait();
console.log(`USDC MATIC price feed deployed`);
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

tx = await deployerFactory.deployDerivedPriceFeed(nativeOracleAddress, usdtOracleAddress, usdtInfo);
receipt = await tx.wait();
console.log(`USDT MATIC price feed deployed`);
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

tx = await deployerFactory.deployDerivedPriceFeed(nativeOracleAddress, daiOracleAddress, daiInfo);
receipt = await tx.wait();
console.log(`DAI MATIC price feed deployed`);
console.log(`gas used ${receipt.gasUsed.toNumber()}`);
totalGasUsed += receipt.gasUsed.toNumber();
await delay(5000)

tx = await deployerFactory.deployDerivedPriceFeed(nativeOracleAddress, sandOracleAddress, sandInfo);
receipt = await tx.wait();
console.log(`SAND MATIC price feed deployed`);
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
