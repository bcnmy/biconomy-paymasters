import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import * as dotenv from "dotenv";

import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomiclabs/hardhat-etherscan";

const walletUtils = require("./walletUtils");

dotenv.config();

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
},
networks: {
  hardhat: {
    accounts: {
      accountsBalance: "10000000000000000000000000",
      //   mnemonic: MNEMONIC,
    },
    allowUnlimitedContractSize: true,
    chainId: 31337,
  },
  ganache: {
    chainId: 1337,
    url: "http://localhost:8545",
    accounts: {
      mnemonic:
        "garbage miracle journey siren inch method pulse learn month grid frame business",
      path: "m/44'/60'/0'/0",
      initialIndex: 0,
      count: 20,
    },
  },
  eth_mainnet: {
    url: process.env.ETH_MAINNET_URL || "",
    chainId: 1,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
  },
  goerli: {
    url: process.env.GOERLI_URL || "",
    chainId: 5,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
  },
  sepolia: {
    url: process.env.SEPOLIA_URL || "",
    chainId: 11155111,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
  },
  polygon_mainnet: {
    url: process.env.POLYGON_URL || "",
    chainId: 137,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    gas: 10e6
  },
  polygon_mumbai: {
    url: process.env.POLYGON_MUMBAI_URL || "",
    chainId: 80001,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
  },
  bnb_mainnet: {
    url: "https://bsc-dataseed2.binance.org",
    chainId: 56,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
  },
  bnb_testnet: {
    url:
      process.env.BSC_TESTNET_URL ||
      "https://data-seed-prebsc-1-s2.binance.org:8545",
    chainId: 97,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    gasPrice: 50e9,
  },
  baseTestnet: {
    url: process.env.BASE_TESTNET_URL || `https://base-goerli.blockpi.network/v1/rpc/public`,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 84531,
  },
  linea: {
    url: process.env.LINEA_TESTNET_URL || `https://rpc.goerli.linea.build`,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 59140,
  },
  avalancheMain: {
    url: "https://api.avax.network/ext/bc/C/rpc",
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 43114,
  },
  avalancheTest: {
    url: "https://api.avax-test.network/ext/bc/C/rpc",
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 43113,
  },
  arbitrumMain: {
    url: "https://arb1.arbitrum.io/rpc",
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 42161,
  },
  arbitrumGoerli: {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 421613,
    // gasPrice: 2e9, //2 gwei
  },
  arbitrumTest: {
    url: "https://rinkeby.arbitrum.io/rpc",
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 421611,
  },
  arbitrumNova: {
    url: "https://nova.arbitrum.io/rpc",
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 42170,
  },
  zkevm_mainnet: {
    url: process.env.ZKEVM_MAINNET_URL || "https://zkevm-rpc.com",
    chainId: 1101,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
  },
  zkevm_testnet: {
    url: process.env.ZKEVM_TESTNET_URL || "https://rpc.public.zkevm-test.net",
    chainId: 1442,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    // gasPrice: 50e9,
  },
  optimismGoerli: {
    url: `https://goerli.optimism.io`,
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    gasPrice: 10e9,
    chainId: 420,
  },
  optimismMainnet: {
    url: `https://mainnet.optimism.io`,
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    chainId: 10,
  },
  moonbeam_mainnet: {
    url: "https://rpc.api.moonbeam.network",
    chainId: 1284,
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
  },
  moonbeamTest: {
    url: "https://rpc.api.moonbase.moonbeam.network",
    accounts:
      process.env.PRIVATE_KEY !== undefined
        ? [process.env.PRIVATE_KEY]
        : walletUtils.makeKeyList(),
    chainId: 1287,
  },
  celoTestnet: {
    url: `https://alfajores-forno.celo-testnet.org`,
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    chainId: 44787,
    // gasPrice: 6400000
  },
  celoMainnet: {
    url: `https://forno.celo.org`,
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    chainId: 42220,
    // gasPrice: 6400000
  },
  neonDevnet: {
    url: `https://proxy.devnet.neonlabs.org/solana`,
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    chainId: 245022926,
    // gasPrice: 6400000
  },
  seiAtlanticDevnet: {
    url: "https://evm-rpc-testnet.sei-apis.com/",
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    chainId: 1328,
  },
  comboTestnet: {
    url: process.env.COMBO_TESTNET_URL,
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    chainId: 1715,
  },
  baseSepoliaTestnet: {
    url: process.env.BASE_SEPOLIA_URL || "https://sepolia.base.org/",
    accounts: process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList(),
    chainId: 84532,
  },
},
etherscan: {
  apiKey: {
    mainnet: process.env.ETHERSCAN_API_KEY || "",
    goerli: process.env.ETHERSCAN_API_KEY || "",
    polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
    polygon: process.env.POLYGONSCAN_API_KEY || "",
    bscTestnet: process.env.BSCSCAN_API_KEY || "",
    bsc: process.env.BSCSCAN_API_KEY || "",
    moonbeam: process.env.MOONBEAM_KEY || "",
    moonbaseAlpha: process.env.MOONBEAM_KEY || "",
    avalancheFujiTestnet: process.env.AVALANCHE_API_KEY || "",
    avalanche: process.env.AVALANCHE_API_KEY || "",
    arbitrumGoerli: process.env.ARBITRUM_API_KEY || "",
    arbitrumTestnet: process.env.ARBITRUM_API_KEY || "",
    arbitrumOne: process.env.ARBITRUM_API_KEY || "",
    optimisticGoerli: process.env.OPTIMISTIC_API_KEY || "",
    optimisticEthereum: process.env.OPTIMISTIC_API_KEY || "",
  },
},
};

export default config;
