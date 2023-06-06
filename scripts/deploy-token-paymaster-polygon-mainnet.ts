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

  const gasPrices = {maxFeePerGas: 250e9, maxPriorityFeePerGas: 80e9}

  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();

  const owner = "0x7306aC7A32eb690232De81a9FFB44Bb346026faB";
  const verifyingSigner = "0x37ca4D86A0e33502F7CD93e0C88AFa2F172d39a1";
  const entryPoint =
    process.env.ENTRY_POINT_ADDRESS ||
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  const usdtAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
  const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
  const sandAddress = "0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683";

  const usdcPriceFeedAddress = "0x6E0508F2ebB8f383269A02f03FC51dF66757be53";
  const usdtPriceFeedAddress = "0x58b7C477cDA49203e8694fD3Efb09B77EDd44887";
  const daiPriceFeedAddress = "0x14e4829E655F0b3a1793838dDd47273D5341d416";
  const sandPriceFeedAddress = "0x985eBa99eB4612B97E94060bBc582B209c7Be28d";

  const OracleAggregator = await ethers.getContractFactory("ChainlinkOracleAggregator");
  const oracleAggregator = await OracleAggregator.deploy(earlyOwner, gasPrices);

  await delay(10000)

  await oracleAggregator.deployed();

  console.log(`oracleAggregator deployed at ${oracleAggregator.address}`);

  const BiconomyTokenPaymaster = await ethers.getContractFactory(
    "BiconomyTokenPaymaster"
  );
  const tokenPaymaster = await BiconomyTokenPaymaster.deploy(
    earlyOwner,
    entryPoint,
    verifyingSigner,
    gasPrices
  );

  await delay(10000)

  console.log(`TokenPaymaster deployed at ${tokenPaymaster.address}`);

  const priceFeedUsdc = await ethers.getContractAt(
    "FeedInterface",
    usdcPriceFeedAddress
  );

  const priceFeedUsdt = await ethers.getContractAt(
    "FeedInterface",
    usdtPriceFeedAddress
  );

  const priceFeedDai = await ethers.getContractAt(
    "FeedInterface",
    daiPriceFeedAddress
  );

  const priceFeedSand = await ethers.getContractAt(
    "FeedInterface",
    sandPriceFeedAddress
  );

  const priceFeedTxUsdc: any =
    await priceFeedUsdc.populateTransaction.getThePrice();

  tx = await oracleAggregator.setTokenOracle(
    usdcAddress,
    usdcPriceFeedAddress,
    18,
    priceFeedTxUsdc.data,
    true,
    gasPrices
  );

  receipt = await tx.wait();
  console.log("Oracle set for USDC");
  await delay(10000)

  const priceFeedTxUsdt: any =
  await priceFeedUsdt.populateTransaction.getThePrice();

  tx = await oracleAggregator.setTokenOracle(
    usdtAddress,
    usdtPriceFeedAddress,
    18,
    priceFeedTxUsdt.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for USDT");
  await delay(10000)

  const priceFeedTxDai: any =
  await priceFeedDai.populateTransaction.getThePrice();

  tx = await oracleAggregator.setTokenOracle(
    daiAddress,
    daiPriceFeedAddress,
    18,
    priceFeedTxDai.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for DAI");
  await delay(10000)

  const priceFeedTxSand: any =
  await priceFeedSand.populateTransaction.getThePrice();
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

  tx = await tokenPaymaster.transferOwnership(owner, gasPrices);
  receipt = await tx.wait();
  console.log("ownership transferred: Token paymaster");
  await delay(10000)

  tx = await oracleAggregator.transferOwnership(owner, gasPrices);
  receipt = await tx.wait();
  console.log("ownership transferred: OA");
  await delay(10000)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
