import { ethers } from "hardhat";

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

// TODO // To be executed

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


  const usdcAddress = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  const usdtAddress = "0x55d398326f99059fF775485246999027B3197955";
  const aaveAddress = "0xfb6115445Bff7b52FeB98650C87f44907E58f802";
  const cakeAddress = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
  const daiAddress = "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3";
  const oneInchAddress = "0x111111111117dC0aa78b770fA6A738034120C302";
  const linkAddress = "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD";


  const usdcPriceFeedAddress = "0x45f86CA2A8BC9EBD757225B19a1A0D7051bE46Db";
  const usdtPriceFeedAddress = "0xD5c40f5144848Bd4EF08a9605d860e727b991513";
  const cakePriceFeedAddress = "0xcB23da9EA243f53194CBc2380A6d4d9bC046161f";
  const daiPriceFeedAddress = "0x8EC213E7191488C7873cEC6daC8e97cdbAdb7B35";
  const linkPriceFeedAddress = "0xB38722F6A608646a538E882Ee9972D15c86Fc597";

  const aavePriceFeedAddress = "0x3a7bC2363178fE294b7a1a175308d344B9E0BCE4";
  const oneInchPriceFeedAddress = "0xe5337b51f2DcF03291682b546AcB46205b97ADB2";
  
  
  const OracleAggregator = await ethers.getContractFactory("ChainlinkOracleAggregator");
  const oracleAggregator = await OracleAggregator.deploy(earlyOwner);
  await oracleAggregator.deployed();
  await delay(10000)

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
  await delay(10000)

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

  const priceFeedLink = await ethers.getContractAt(
    "FeedInterface",
    linkPriceFeedAddress
  );

  const priceFeedOneInch = await ethers.getContractAt(
    "FeedInterface",
    oneInchPriceFeedAddress
  );

  const priceFeedCake = await ethers.getContractAt(
    "FeedInterface",
    cakePriceFeedAddress
  );

  const priceFeedAave = await ethers.getContractAt(
    "FeedInterface",
    aavePriceFeedAddress
  );


  const priceFeedTxUsdc: any =
  await priceFeedUsdc.populateTransaction.latestAnswer(); // notice latest answer for feeds already avaialble for desired base/quote

  tx = await oracleAggregator.setTokenOracle(
    usdcAddress,
    usdcPriceFeedAddress,
    18,
    priceFeedTxUsdc.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for USDC");
  await delay(10000)

  const priceFeedTxUsdt: any =
  await priceFeedUsdt.populateTransaction.latestAnswer(); // notice latest answer for feeds already avaialble for desired base/quote

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
  await priceFeedDai.populateTransaction.latestAnswer(); // notice latest answer for feeds already avaialble for desired base/quote

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

  const priceFeedTxCake: any =
  await priceFeedCake.populateTransaction.latestAnswer(); // notice latest answer for feeds already avaialble for desired base/quote

  tx = await oracleAggregator.setTokenOracle(
    cakeAddress,
    cakePriceFeedAddress,
    18,
    priceFeedTxCake.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for CAKE");
  await delay(10000)

  const priceFeedTxLink: any =
  await priceFeedLink.populateTransaction.latestAnswer(); // notice latest answer for feeds already avaialble for desired base/quote

  tx = await oracleAggregator.setTokenOracle(
    linkAddress,
    linkPriceFeedAddress,
    18,
    priceFeedTxLink.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for LINK");
  await delay(10000)

  const priceFeedTxOneInch: any =
  await priceFeedOneInch.populateTransaction.getThePrice(); // notice for our derived price feeds we use this calldata

  tx = await oracleAggregator.setTokenOracle(
    oneInchAddress,
    oneInchPriceFeedAddress,
    18,
    priceFeedTxOneInch.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for 1INCH");
  await delay(10000)

  const priceFeedTxOneAave: any =
  await priceFeedAave.populateTransaction.getThePrice(); // notice for our derived price feeds we use this calldata

  tx = await oracleAggregator.setTokenOracle(
    aaveAddress,
    aavePriceFeedAddress,
    18,
    priceFeedTxOneAave.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for AAVE");
  await delay(10000)

  tx = await tokenPaymaster.transferOwnership(owner);
  receipt = await tx.wait();
  console.log("ownership transferred: Token Paymaster");
  await delay(10000)

  tx = await oracleAggregator.transferOwnership(owner);
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
