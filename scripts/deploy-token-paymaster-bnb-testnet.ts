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

  const usdtAddress = "0xbf22b04E250A5921ab4dC0d4ceD6E391459e92D4";

  
  const usdtPriceFeedAddress = "0xf89CeAC4f45A36BE82CDC88cE034c4170E0f0086";

  const OracleAggregator = await ethers.getContractFactory("ChainlinkOracleAggregator");
  const oracleAggregator = await OracleAggregator.deploy(earlyOwner);
  await oracleAggregator.deployed();
  console.log(`OracleAggregator deployed at ${oracleAggregator.address}`);
  await delay(10000)

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

  const priceFeedusdt = await ethers.getContractAt(
    "FeedInterface",
    usdtPriceFeedAddress
  );

  const priceFeedTxusdt: any =
    await priceFeedusdt.populateTransaction.getThePrice();

  tx = await oracleAggregator.setTokenOracle(
    usdtAddress,
    usdtPriceFeedAddress,
    18,
    priceFeedTxusdt.data,
    true
  );
  receipt = await tx.wait();
  console.log("Oracle set for usdt");
  await delay(10000)

  tx = await tokenPaymaster.transferOwnership(owner);
  receipt = await tx.wait();
  console.log("ownership transferred: Token Paymaster");
  await delay(10000)

  tx = await oracleAggregator.transferOwnership(owner);
  receipt = await tx.wait();
  console.log("ownership transferred: OA");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
