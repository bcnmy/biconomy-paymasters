import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import * as dotenv from "dotenv";

import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

const config: HardhatUserConfig = {
  solidity: {
  compilers: [
    {
      version: "0.8.17",
      settings: {
        optimizer: { enabled: true, runs: 800},
        viaIR: true 
      },
    },
  ],
}
};

export default config;
