import { ethers } from "hardhat";
import { BundlerTestEnvironment } from "./bundlerEnvironment";
import { promises } from "fs";
import path from "path";
import { EntryPoint__factory } from "@account-abstraction/contracts";

const envPath = path.join(__dirname, ".env");

if (require.main === module) {
  (async () => {
    await BundlerTestEnvironment.getDefaultInstance();
    const [deployer] = await ethers.getSigners();
    const entrypoint = await new EntryPoint__factory(deployer).deploy();
    await promises.writeFile(envPath, `ENTRYPOINT=${entrypoint.address}`);
  })();
}
