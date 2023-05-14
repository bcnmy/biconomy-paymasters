import { ethers } from "hardhat";

async function main() {
  let tx, receipt;
  const provider = ethers.provider;

  const accounts = await ethers.getSigners();
  const ZERO_ADDRESS_ROUTER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

  const earlyOwner = await accounts[0].getAddress();
  const owner = "0x7306aC7A32eb690232De81a9FFB44Bb346026faB";
  const verifyingSigner = "0x37ca4D86A0e33502F7CD93e0C88AFa2F172d39a1";
  const entryPoint =
    process.env.ENTRY_POINT_ADDRESS ||
    "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const usdcAddress = "0xdA5289fCAAF71d52a80A254da614a192b693e977";
  const usdcPriceFeedAddress = "0x0B99544394582DFb7b3334e8e8032491C36FDCa9";

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

  tx = await tokenPaymaster.transferOwnership(owner);
  receipt = await tx.wait();
  console.log("ownership transferred: Token Paymaster");

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
