import { ethers } from "hardhat";

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

// WIP on existing oracle aggregator given price feeds are already deployed go ahead and set oracle aggregator

async function main() {
let tx, receipt;
const provider = ethers.provider;

// Polygon Mainnet example

const chainlinkAggregatorAddress = "0xDc1c19fB74aC9dD6C7b1fafb7bF604F8277e4927";

// example
const sandAddress = "0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683";
const sandPriceFeedAddress = "0x985eBa99eB4612B97E94060bBc582B209c7Be28d";


const gasPrices = {maxFeePerGas: 250e9, maxPriorityFeePerGas: 80e9}
let oracleAggregator = await ethers.getContractAt("contracts/token/oracles/ChainlinkOracleAggregator.sol:ChainlinkOracleAggregator", chainlinkAggregatorAddress);

const priceFeedSand = await ethers.getContractAt(
    "FeedInterface",
    sandPriceFeedAddress
  );

const priceFeedTxSand: any =
  await priceFeedSand.populateTransaction.getThePrice();

console.log('priceFeedTxSand ', priceFeedTxSand)

tx = await oracleAggregator.setTokenOracle(
    sandAddress,
    sandPriceFeedAddress,
    18,
    priceFeedTxSand.data,
    true
  );
receipt = await tx.wait();
console.log("Oracle set for SAND");
await delay(10000)  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
