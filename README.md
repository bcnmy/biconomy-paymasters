# Biconomy Paymasters

![Biconomy Paymasters](https://img.shields.io/badge/Biconomy-Paymasters-blue.svg)

## Playground for ERC4337 Paymasters built with :heart_eyes: by Biconomy

### 🌟 Some examples

1. Singleton Verifying Paymaster: Acts as a sponsorship paymaster and lets Dapps manage deposits without deploying a new one for each Dapp.
1. Token Paymaster: Extended version of Verifying Paymaster which can accept fees from users by withdrawing ERC20 tokens.

### 🛠️ Other WIP

- FIAT Paymaster
- Deposit Paymaster
- Custom versions of the above Verifying (allow Dapp deposit sponsorship in different tokens) and Token Paymaster (acts as deposit paymaster also)

### 📚 Resources

- [Biconomy Documentation](https://docs.biconomy.io/)
- [Biconomy Dashboard](https://dashboard.biconomy.io)

## ⚙️ How to run the project

You're going to need to place a private key in a .env file in the root.

### In order to add/update the git submodule account-abstraction:

.gitmodules file is already added. Two submodules are being used in this project:

1. `git submodule update --init` (This command will initialize and fetch the submodules listed in the .gitmodules file.)
2. `git submodule update --remote` (This will update the submodules to the latest commit in their respective repositories.)

You can also alternatively run `forge install` (or `forge install <repo_url>`)

If you encounter any issues during the submodule update process, you can try deleting the submodules directory and then running the `git submodule update --init` command again.

### If you face the below error, make sure typechain artifacts are generated in the account-abstraction folder.

> [!WARNING]
> Error: Cannot find module '../typechain'

1. cd lib/account-abstraction

2. yarn

3. npx hardhat compile

This project demonstrates an advanced Hardhat use case, integrating other tools commonly used alongside Hardhat in the ecosystem. Foundry support is also added.

Try running some of the following tasks:

```shell
forge build --via-ir

npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

# 🗂️ Etherscan verification

To try out [Etherscan](https://etherscan.io/) verification, you first need to deploy a contract to an Ethereum network that's supported by Etherscan, such as Ropsten.

1. In this project, copy the .env.example file to a file named .env, and then edit it to fill in the details. 
1. Enter your [Etherscan API key](https://docs.etherscan.io/getting-started/viewing-api-usage-statistics), your Ropsten node URL (eg from Alchemy), and the private key of the account which will send the deployment transaction.
1. With a valid .env file in place, first deploy your contract:

```shell
hardhat run --network polygon_mumbai scripts/deploy.ts
```

4. Then, copy the deployment address and paste it in to replace `DEPLOYED_CONTRACT_ADDRESS` in this command:

```shell
npx hardhat verify --network polygon_mumbai DEPLOYED_CONTRACT_ADDRESS "Hello, Hardhat!"
```

# 🚀 Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in Hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).
