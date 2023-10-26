import { ethers } from "hardhat";
import { VerifyingSingletonPaymaster__factory } from "../typechain-types";
import { formatEther, parseEther } from "ethers/lib/utils";

const paymasterAddress = "0x2E97907F2dDf3436b7828E28083f147B9d283F94";
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
  console.log("deposit", await paymaster.getBalance(paymasterId));
  const { hash, wait } = await paymaster.depositFor(paymasterId, {
    value: parseEther("0.01"),
  });

  console.log("Transaction hash:", hash);

  await wait();

  console.log("Done!");
})();
