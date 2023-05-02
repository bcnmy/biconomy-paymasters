import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

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
