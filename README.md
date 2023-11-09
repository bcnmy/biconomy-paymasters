# Biconomy Paymasters 🌐

Welcome to the `biconomy-paymasters` repository! Paymaster contracts enable seamless transaction fee handling in decentralized applications. 🛠️

## What is Biconomy Paymasters? 🤔

Biconomy Paymasters are smart contracts that abstract away the complexity of gas fees for end-users. By utilizing these contracts, developers can offer their users gasless transactions or the ability to pay for gas in ERC20 tokens. 🚀

- **Sponsorship Paymaster**: Allows transactions without end-users needing to pay for gas, enhancing UX.
- **Token Paymaster**: Provides the ability to pay for transactions with ERC20 tokens.

## Features 🌟

- Simplified transaction fee handling.
- ERC 4337 Account Abstraction compliant.
- Multi-token support for gas payments.

### ERC20 Token Paymaster ![ERC20 Token Paymaster](./assets/readme/token-paymaster.png)

- ERC20 Token Paymaster helps users pay for their transactions using ERC20 tokens.
- Users initiate a transaction using an ERC20 token.
- Paymaster validates the transaction and forwards it to the network while handling necessary fee conversions. 
- This flow ensures ease of use and convenience for users.

### Sponsorship Paymaster ![Sponsorship Paymaster](./assets/readme/sponsorship-paymaster.png)

- Sponsorship Paymaster covers transaction fees for users.
- The process starts with the user initiating a transaction.
- Paymaster takes over and sponsors the fees, so users don't have to bear the gas costs.
- This ensures that the transaction is confirmed on the network.

## Getting Started 🏁

To set up and use the Biconomy Paymasters, you'll need to have Node.js, Yarn, Hardhat, and Foundry installed. 

### Prerequisites 📋 
Make sure you have Node.js and Yarn installed. You will also need to install Foundry for smart contract development with Solidity.

### Installation 📦
Clone the repository and install the dependencies with `yarn`:

```bash
git clone https://github.com/bcnmy/biconomy-paymasters.git
cd biconomy-paymasters
yarn install
```

### Building the Project 🏗️

Compile your smart contracts and generate typechain artifacts:
```bash
yarn build
```

### Running Tests 🧪

After building, run your tests to ensure everything is working correctly:

```bash
yarn test
```
This will run both Hardhat and Foundry tests as specified in your `package.json` scripts.

## Documentation 📚

For more detailed information about Paymasters and how to integrate them into your project, visit the [Biconomy Paymaster Documentation](https://docs.biconomy.io/category/paymaster).

## Foundry Installation

For instructions on how to set up Foundryfollow the instructions provided in the [Foundry Book](https://book.getfoundry.sh/getting-started/installation.html).

## Contributing 🤝
We welcome contributions from the community. Please take a look at the [guidelines for contributions](./CONTRIBUTING.md).

## License 📜
This project is licensed under the MIT License. See the [`LICENSE`](./LICENSE.md) file for more information.