import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import * as dotenv from "dotenv";

import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomiclabs/hardhat-etherscan";

const walletUtils = require("./walletUtils");

dotenv.config();

const hardhatAccounts =
  process.env.PRIVATE_KEY !== undefined
    ? [process.env.PRIVATE_KEY]
    : walletUtils.makeKeyList();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: { enabled: true, runs: 800 },
          viaIR: true,
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
    hardhat_local: {
      chainId: 31337,
      url: "http://localhost:8545",
      accounts: {
        mnemonic:
          "garbage miracle journey siren inch method pulse learn month grid frame business",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    local: {
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
      accounts: hardhatAccounts,
    },
    goerli: {
      url: process.env.GOERLI_URL || "",
      chainId: 5,
      accounts: hardhatAccounts,
    },
    sepolia: {
      url: process.env.SEPOLIA_URL || "",
      chainId: 11155111,
      accounts: hardhatAccounts,
    },
    polygon_mainnet: {
      url: process.env.POLYGON_URL || "",
      chainId: 137,
      accounts: hardhatAccounts,
      gas: 10e6,
    },
    polygon_mumbai: {
      url: process.env.POLYGON_MUMBAI_URL || "",
      chainId: 80001,
      accounts: hardhatAccounts,
    },
    bnb_mainnet: {
      url: "https://bsc-dataseed2.binance.org",
      chainId: 56,
      accounts: hardhatAccounts,
    },
    bnb_testnet: {
      url:
        process.env.BSC_TESTNET_URL ||
        "https://data-seed-prebsc-1-s2.binance.org:8545",
      chainId: 97,
      accounts: hardhatAccounts,
      gasPrice: 50e9,
    },
    baseGoerli: {
      url:
        process.env.BASE_TESTNET_URL ||
        `https://base-goerli.blockpi.network/v1/rpc/public`,
      accounts: hardhatAccounts,
      chainId: 84531,
    },
    lineaGoerli: {
      url: process.env.LINEA_TESTNET_URL || `https://rpc.goerli.linea.build`,
      accounts: hardhatAccounts,
      chainId: 59140,
    },
    lineaMainnet: {
      url: process.env.LINEA_MAINNET_URL || ``,
      accounts: hardhatAccounts,
      chainId: 59144,
    },
    baseMainnet: {
      url:
        process.env.BASE_MAINNET_URL ||
        `https://developer-access-mainnet.base.org`,
      accounts: hardhatAccounts,
      chainId: 8453,
    },
    avalancheMain: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: hardhatAccounts,
      chainId: 43114,
    },
    avalancheTest: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: hardhatAccounts,
      chainId: 43113,
    },
    arbitrumMain: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts: hardhatAccounts,
      chainId: 42161,
    },
    arbitrumGoerli: {
      url: "https://goerli-rollup.arbitrum.io/rpc",
      accounts: hardhatAccounts,
      chainId: 421613,
      // gasPrice: 2e9, //2 gwei
    },
    arbitrumTest: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts: hardhatAccounts,
      chainId: 421611,
    },
    arbitrumNova: {
      url: "https://nova.arbitrum.io/rpc",
      accounts: hardhatAccounts,
      chainId: 42170,
    },
    zkevm_mainnet: {
      url: process.env.ZKEVM_MAINNET_URL || "https://zkevm-rpc.com",
      chainId: 1101,
      accounts: hardhatAccounts,
    },
    zkevm_testnet: {
      url: process.env.ZKEVM_TESTNET_URL || "https://rpc.public.zkevm-test.net",
      chainId: 1442,
      accounts: hardhatAccounts,
      // gasPrice: 50e9,
    },
    optimismGoerli: {
      url: `https://goerli.optimism.io`,
      accounts: hardhatAccounts,
      gasPrice: 10e9,
      chainId: 420,
    },
    optimismMainnet: {
      url: `https://mainnet.optimism.io`,
      accounts: hardhatAccounts,
      chainId: 10,
    },
    moonbeam_mainnet: {
      url: "https://rpc.api.moonbeam.network",
      chainId: 1284,
      accounts: hardhatAccounts,
    },
    moonbeamTest: {
      url: "https://rpc.api.moonbase.moonbeam.network",
      accounts: hardhatAccounts,
      chainId: 1287,
    },
    celoTestnet: {
      url: `https://alfajores-forno.celo-testnet.org`,
      accounts: hardhatAccounts,
      chainId: 44787,
      // gasPrice: 6400000
    },
    celoMainnet: {
      url: `https://forno.celo.org`,
      accounts: hardhatAccounts,
      chainId: 42220,
      // gasPrice: 6400000
    },
    neonDevnet: {
      url: `https://proxy.devnet.neonlabs.org/solana`,
      accounts: hardhatAccounts,
      chainId: 245022926,
      // gasPrice: 6400000
    },
    opBNBMainnet: {
      url: process.env.OP_BNB_MAINNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 204,
    },
    opBNBTestnet: {
      url: process.env.OP_BNB_TESTNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 5611,
    },
    mantleMainnet: {
      url: process.env.MANTLE_MAINNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 5000,
    },
    mantleTestnet: {
      url: process.env.MANTLE_TESTNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 5001,
    },
    comboTestnet: {
      url: process.env.COMBO_TESTNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 91715,
    },
    avaxSubnet0001Testnet: {
      url: process.env.AVAX_SUBNET_0001_TESTNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 88018,
    },
    astarShibuyaTestnet: {
      url: process.env.ASTAR_SHIBUYA_URL || "https://evm.shibuya.astar.network",
      accounts: hardhatAccounts,
      chainId: 81,
    },
    astarMainnet: {
      url: process.env.ASTAR_MAINNET_URL || "https://evm.astar.network",
      accounts: hardhatAccounts,
      chainId: 592,
    },
    chillizTestnet: {
      url: process.env.CHILLIZ_TESTNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 88882,
    },
    chillizMainnet: {
      url: process.env.CHILLIZ_MAINNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 88888,
    },
    capxTestnet: {
      url: process.env.CAPX_TESTNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 1001,
    },
    coreDaoTestnet: {
      url: process.env.COREDAO_TESTNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 1115,
    },
    coreDaoMainnet: {
      url: process.env.COREDAO_MAINNET_URL || "",
      accounts: hardhatAccounts,
      chainId: 1116,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      goerli: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
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
      "base-goerli": "PLACEHOLDER_STRING",
      "linea-goerli": "PLACEHOLDER_STRING",
      "linea-mainnet": "PLACEHOLDER_STRING",
      "base-mainnet": process.env.BASE_API_KEY || "",
      opBNBTestnet: process.env.OP_BNB_API_KEY || "",
      opBNBMainnet: process.env.OP_BNB_API_KEY || "",
      mantleTestnet: "PLACEHOLDER_STRING",
      mantleMainnet: "PLACEHOLDER_STRING",
      comboTestnet: process.env.COMBO_API_KEY || "",
      zkEVMMainnet: process.env.ZKEVM_API_KEY || "",
      zkEVMGoerli: process.env.ZKEVM_API_KEY || "",
      arbitrumNova: process.env.ARBITRUM_NOVA_API_KEY || "",
      astarShibuyaTestnet: process.env.ASTAR_SHIBUYA_API_KEY || "",
      astarMainnet: process.env.ASTAR_MAINNET_API_KEY || "",
      chillizTestnet: "PLACEHOLDER_STRING",
      chillizMainnet: "PLACEHOLDER_STRING",
      capxTestnet: "PLACEHOLDER_STRING",
      coreDaoTestnet: process.env.COREDAO_TESTNET_API_KEY || "",
      coreDaoMainnet: process.env.COREDAO_MAINNET_API_KEY || "",
    },
    customChains: [
      {
        network: "coreDaoTestnet",
        chainId: 1115,
        urls: {
          apiURL: "https://api.test.btcs.network/api",
          browserURL: "https://scan.test.btcs.network/",
        },
      },
      {
        network: "coreDaoMainnet",
        chainId: 1116,
        urls: {
          apiURL: "https://openapi.coredao.org/api",
          browserURL: "https://scan.coredao.org/",
        },
      },
      {
        network: "capxTestnet",
        chainId: 1001,
        urls: {
          apiURL: "http://148.113.163.123:4010/api",
          browserURL: "http://148.113.163.123:4010",
        },
      },
      {
        network: "chillizTestnet",
        chainId: 88882,
        urls: {
          apiURL: "https://spicy-explorer.chiliz.com/api",
          browserURL: "https://spicy-explorer.chiliz.com",
        },
      },
      {
        network: "chillizMainnet",
        chainId: 88888,
        urls: {
          apiURL: "https://scan.chiliz.com/api",
          browserURL: "https://scan.chiliz.com",
        },
      },
      {
        network: "astarShibuyaTestnet",
        chainId: 81,
        urls: {
          apiURL: "https://blockscout.com/shibuya/api",
          browserURL: "https://blockscout.com/shibuya/",
        },
      },
      {
        network: "astarMainnet",
        chainId: 592,
        urls: {
          apiURL: "https://blockscout.com/astar/api",
          browserURL: "https://blockscout.com/astar/",
        },
      },
      {
        network: "linea-goerli",
        chainId: 59140,
        urls: {
          apiURL: "https://explorer.goerli.linea.build/api",
          browserURL: "https://goerli.lineascan.build",
        },
      },
      {
        network: "linea-mainnet",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build",
        },
      },
      {
        network: "lineaGoerli",
        chainId: 59140,
        urls: {
          apiURL: "https://explorer.goerli.linea.build/api",
          browserURL: "https://goerli.lineascan.build",
        },
      },
      {
        network: "lineaMainnet",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build",
        },
      },
      {
        network: "base-goerli",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org",
        },
      },
      {
        network: "base-mainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "opBNBMainnet",
        chainId: 204,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.OP_BNB_API_KEY}/op-bnb-mainnet/contract/`,
          browserURL: "https://mainnet.opbnbscan.com/",
        },
      },
      {
        network: "opBNBTestnet",
        chainId: 5611,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.OP_BNB_API_KEY}/op-bnb-testnet/contract/`,
          browserURL: "https://opbscan.com",
        },
      },
      {
        network: "mantleMainnet",
        chainId: 5000,
        urls: {
          apiURL: "https://explorer.mantle.xyz/api",
          browserURL: "https://explorer.mantle.xyz",
        },
      },
      {
        network: "mantleTestnet",
        chainId: 5001,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
      {
        network: "comboTestnet",
        chainId: 91715,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.COMBO_API_KEY}/combotrace-testnet/contract/`,
          browserURL: "https://combotrace-testnet.nodereal.io",
        },
      },
      {
        network: "arbitrumNova",
        chainId: 42170,
        urls: {
          apiURL: "https://api-nova.arbiscan.io/api",
          browserURL: "https://nova.arbiscan.io/",
        },
      },
      {
        network: "zkEVMMainnet",
        chainId: 1101,
        urls: {
          apiURL: "https://api-zkevm.polygonscan.com/api",
          browserURL: "https://zkevm.polygonscan.com",
        },
      },
      {
        network: "zkEVMGoerli",
        chainId: 1442,
        urls: {
          apiURL: "https://api-testnet-zkevm.polygonscan.com/api",
          browserURL: "https://testnet-zkevm.polygonscan.com",
        },
      },
    ],
  },
};

export default config;
