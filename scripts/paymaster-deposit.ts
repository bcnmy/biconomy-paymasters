import { ethers } from "hardhat";
import { VerifyingSingletonPaymaster__factory } from "../typechain-types";
import { formatEther, parseEther } from "ethers/lib/utils";

const paymasterAddress = "0x0000064E9C653e373AF18ef27F70bE83dF5476B7";
const paymasterId = "0x58006a3BC89Dfc5c60E9433EF7c8dF6023c6805d";

(async () => {
  const [signer] = await ethers.getSigners();

  console.log("Signer: ", await signer.getAddress());
  console.log("Signer Balance: ", formatEther(await signer.getBalance()));

  const paymaster = VerifyingSingletonPaymaster__factory.connect(
    paymasterAddress,
    signer
  );

  console.log("Entrypoint: ", await paymaster.entryPoint());
  const { hash, wait } = await paymaster.depositFor(paymasterId, {
    value: parseEther("0.01"),
  });

  console.log("Transaction hash:", hash);

  await wait();

  console.log("Done!");
})();
