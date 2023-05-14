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
  const ZERO_ADDRESS_ROUTER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

  const accounts = await ethers.getSigners();
  const earlyOwner = await accounts[0].getAddress();

  const owner = "0x7306aC7A32eb690232De81a9FFB44Bb346026faB";
  const verifyingSigner = "0x37ca4D86A0e33502F7CD93e0C88AFa2F172d39a1";
  const entryPoint =
    process.env.ENTRY_POINT_ADDRESS ||
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  const usdcPriceFeedAddress = "0xbe4cd782679AD4876456b82934De7Fc1dADd251C";

  const OracleAggregator = await ethers.getContractFactory("ChainlinkOracleAggregator");
  const oracleAggregator = await OracleAggregator.deploy(earlyOwner);

  await delay(5000)

  await oracleAggregator.deployed();

  console.log(`oracleAggregator deployed at ${oracleAggregator.address}`);

  const BiconomyTokenPaymaster = await ethers.getContractFactory(
    "BiconomyTokenPaymaster"
  );
  const tokenPaymaster = await BiconomyTokenPaymaster.deploy(
    earlyOwner,
    entryPoint,
    verifyingSigner
  );

  await delay(5000)

  console.log(`TokenPaymaster deployed at ${tokenPaymaster.address}`);

  const priceFeedUsdc = await ethers.getContractAt(
    "FeedInterface",
    usdcPriceFeedAddress
  );

  const priceFeedTxUsdc: any =
    await priceFeedUsdc.populateTransaction.getThePrice();

  tx = await oracleAggregator.setTokenOracle(
    usdcAddress,
    usdcPriceFeedAddress,
    18,
    priceFeedTxUsdc.data,
    true
  );

  await delay(5000)

  receipt = await tx.wait();
  console.log("Oracle set for USDC");

  await delay(5000)

  tx = await tokenPaymaster.transferOwnership(owner);
  receipt = await tx.wait();
  console.log("ownership transferred: Token paymaster");

  await delay(5000)

  tx = await oracleAggregator.transferOwnership(owner);
  receipt = await tx.wait();
  console.log("ownership transferred: OA");

  await delay(5000)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
