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

  const accounts = await ethers.getSigners();

  const earlyOwner = await accounts[0].getAddress();
  const owner = "0x7306aC7A32eb690232De81a9FFB44Bb346026faB";
  const verifyingSigner = "0x37ca4D86A0e33502F7CD93e0C88AFa2F172d39a1";
  const entryPoint =
    process.env.ENTRY_POINT_ADDRESS ||
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  const usdcAddress = "0xdA5289fCAAF71d52a80A254da614a192b693e977";
  const usdtAddress = "0xeaBc4b91d9375796AA4F69cC764A4aB509080A58";
  const daiAddress = "0x27a44456bEDb94DbD59D0f0A14fE977c777fC5C3";
  const sandAddress = "0xE03489D4E90b22c59c5e23d45DFd59Fc0dB8a025";

  const usdcPriceFeedAddress = "0xE9304e0e2e9A8982B3C819947568AC3dfC7bd9ca";
  const usdtPriceFeedAddress = "0x7de3a86c4959Da92966bF1B1E3af5f6155A56032";
  const daiPriceFeedAddress = "0x479BFEeACDE86cf09eAe61AEa088A8E1358E015E";
  const sandPriceFeedAddress = "0x2c010b4B06b27a14d6FC32308203303529D827e0";

  const OracleAggregator = await ethers.getContractFactory("ChainlinkOracleAggregator");
  const oracleAggregator = await OracleAggregator.deploy(earlyOwner);

  await oracleAggregator.deployed();
  console.log(`OracleAggregator deployed at ${oracleAggregator.address}`);

  console.log("owner before ", earlyOwner);

  const BiconomyTokenPaymaster = await ethers.getContractFactory(
    "BiconomyTokenPaymaster"
  );
  const tokenPaymaster = await BiconomyTokenPaymaster.deploy(
    earlyOwner,
    entryPoint,
    verifyingSigner
  );

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
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for USDC");
  await delay(5000)


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
  await delay(5000)

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
  await delay(5000)

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
  await delay(5000)

  tx = await tokenPaymaster.transferOwnership(owner);
  receipt = await tx.wait();
  console.log("ownership transferred: Token Paymaster");
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
