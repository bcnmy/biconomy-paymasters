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

let accounts = await ethers.getSigners();
  
const earlyOwner = await accounts[0].getAddress();
const owner = "0x7306aC7A32eb690232De81a9FFB44Bb346026faB";

// polygon Mumbai USDC / WMATIC pool
const poolAddress = "0xa374094527e1673a86de625aa59517c5de346d32"
const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
const weth9 = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"
const quoterAddress = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"

const TWAPOracle = await ethers.getContractFactory("UniswapTWAPAggregator");
const twapAggregator = await TWAPOracle.deploy(earlyOwner, quoterAddress, weth9, gasPrices);

console.log(
    `Uniswap TWAPOracle deployed at ${twapAggregator.address}`
  );

await twapAggregator.deployed();
await delay(10000)

tx = await twapAggregator.setTokenOracle(usdcAddress, poolAddress, gasPrices);
receipt = await tx.wait()
await delay(10000)


tx = await twapAggregator.transferOwnership(owner, gasPrices);
receipt = await tx.wait()
await delay(10000)
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
