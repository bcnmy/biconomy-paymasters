import { ethers as hardhatEthersInstance } from "hardhat";
import {
  BigNumber,
  BigNumberish,
  Contract,
  ethers,
  Signer,
  ContractFactory,
} from "ethers";
import {
  getContractAddress,
  arrayify,
  hexConcat,
  hexlify,
  hexZeroPad,
  keccak256,
  Interface,
} from "ethers/lib/utils";
import { TransactionReceipt, Provider } from "@ethersproject/providers";
import { Deployer, Deployer__factory } from "../../typechain-types";

// { FACTORY_ADDRESS  } is deployed from chirag's private key for nonce 0
// Marked for removal
export const FACTORY_ADDRESS = "0x757056493cd5E44e4cFe2719aE05FbcfC1178087";
export const FACTORY_BYTE_CODE =
  "0x6080604052348015600f57600080fd5b506004361060285760003560e01c80634af63f0214602d575b600080fd5b60cf60048036036040811015604157600080fd5b810190602081018135640100000000811115605b57600080fd5b820183602082011115606c57600080fd5b80359060200191846001830284011164010000000083111715608d57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250929550509135925060eb915050565b604080516001600160a01b039092168252519081900360200190f35b6000818351602085016000f5939250505056fea26469706673582212206b44f8a82cb6b156bfcc3dc6aadd6df4eefd204bc928a4397fd15dacf6d5320564736f6c63430006020033";
export const factoryDeployer = "0xBb6e024b9cFFACB947A71991E386681B1Cd1477D";
export const factoryTx =
  "0xf9016c8085174876e8008303c4d88080b90154608060405234801561001057600080fd5b50610134806100206000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c80634af63f0214602d575b600080fd5b60cf60048036036040811015604157600080fd5b810190602081018135640100000000811115605b57600080fd5b820183602082011115606c57600080fd5b80359060200191846001830284011164010000000083111715608d57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250929550509135925060eb915050565b604080516001600160a01b039092168252519081900360200190f35b6000818351602085016000f5939250505056fea26469706673582212206b44f8a82cb6b156bfcc3dc6aadd6df4eefd204bc928a4397fd15dacf6d5320564736f6c634300060200331b83247000822470";
export const factoryTxHash =
  "0x803351deb6d745e91545a6a3e1c0ea3e9a6a02a1a4193b70edfcd2f40f71a01c";

const factoryDeploymentFee = (0.0247 * 1e18).toString(); // 0.0247
const options = { gasLimit: 7000000 /*, gasPrice: 70000000000 */ };

// TODO
// remove TEST for production deployments

// 0xD3f89753278E419c8bda1eFe1366206B3D30C44f : Deployer address
// 0xD3f89753278E419c8bda1eFe1366206B3D30C44f
export enum DEPLOYMENT_SALTS {
  ORACLE_AGGREGATOR = "DEVX_CHAINLINK_ORACLE_AGGREGATOR_V0_27062023_bBee55b", // 0x0000065b8abb967271817555f23945eedf08015c
  TOKEN_PAYMASTER = "DEVX_TOKEN_PAYMASTER_V0_27062023_i5HBfZq", // 0x0000009a9d03ddc86a6004c5d890ca27bb67e153
  PRICE_FEED_USDC = "DEVX_PRICE_FEED_USDC_V0_27062023_uiaqdyv", // 0x000005abae3deadbe1fbd12105f950efba9eaec4
  PRICE_FEED_USDT = "DEVX_PRICE_FEED_USDT_V0_27062023_dIos1Nw", // 0x000001e2c2b39542c30a3fe57c4487030bc03adf
  PRICE_FEED_DAI = "DEVX_PRICE_FEED_DAI_V0_27062023_1m7JNWQ", // 0x000000d2da196474046c7a4d94ab0e566b26d054
  PRICE_FEED_SAND = "DEVX_PRICE_FEED_SAND_V0_27062023_eHPqgeR", // 0x00000980455efb131c1908efa908c1eaf19db352
  PRICE_FEED_AAVE = "DEVX_PRICE_FEED_AAVE_V0_27062023_ivsd3iS", // 0x000003d85ffd4917103bf6cd8d697f01c28ed194
  PRICE_FEED_CAKE = "DEVX_PRICE_FEED_CAKE_V0_27062023_1BKpzde", // 0x000007198738f877c01d9b7e4a4e1bd17e46e4a8
  PRICE_FEED_LINK = "DEVX_PRICE_FEED_LINK_V0_27062023_JHIxs6o", // 0x00000da809fe7be1297ee731f998141ba352778d
  PRICE_FEED_1INCH = "DEVX_PRICE_FEED_1INCH_V0_27062023_XhXA3sd", // 0x00000c451fa0b0a79a36c82820f061683e26714c
  PRICE_FEED_TWT = "DEVX_PRICE_FEED_TWT_V0_27062023_92Xklvq" // 0x00000e862312c82af2301e6c433e75099665649d
}

// Marked for removal
export const factoryAbi = [
  {
    inputs: [
      { internalType: "bytes", name: "_initCode", type: "bytes" },
      { internalType: "bytes32", name: "_salt", type: "bytes32" },
    ],
    name: "deploy",
    outputs: [
      {
        internalType: "address payable",
        name: "createdContract",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// Marked for removal
export const buildBytecode = (
  constructorTypes: any[],
  constructorArgs: any[],
  contractBytecode: string
) =>
  `${contractBytecode}${encodeParams(constructorTypes, constructorArgs).slice(
    2
  )}`;

// Marked for removal
export const buildCreate2Address = (saltHex: string, byteCode: string) => {
  return `0x${ethers.utils
    .keccak256(
      `0x${["ff", FACTORY_ADDRESS, saltHex, ethers.utils.keccak256(byteCode)]
        .map((x) => x.replace(/0x/, ""))
        .join("")}`
    )
    .slice(-40)}`.toLowerCase();
};

/**
 * return the deployed address of this code.
 * (the deployed address to be used by deploy()
 * @param initCode
 * @param salt
 */
export const getDeployedAddress = (initCode: string, salt: BigNumberish) => {
  const saltBytes32 = hexZeroPad(hexlify(salt), 32);
  return (
    "0x" +
    keccak256(
      hexConcat(["0xff", FACTORY_ADDRESS, saltBytes32, keccak256(initCode)])
    ).slice(-40)
  );
};

export const getDeployerInstance = async (): Promise<Deployer> => {
  const metaDeployerPrivateKey = process.env.FACTORY_DEPLOYER_PRIVATE_KEY;
  if (!metaDeployerPrivateKey) {
    throw new Error("FACTORY_DEPLOYER_PRIVATE_KEY not set");
  }
  const metaDeployer = new ethers.Wallet(
    metaDeployerPrivateKey,
    hardhatEthersInstance.provider
  );
  // const FACTORY_ADDRESS = getContractAddress({
  //   from: metaDeployer.address,
  //   nonce: 0,
  // });
  
  const provider = hardhatEthersInstance.provider;
  const [signer] = await hardhatEthersInstance.getSigners();
  const chainId = (await provider.getNetwork()).chainId;
  console.log(`Checking deployer ${FACTORY_ADDRESS} on chain ${chainId}...`);
  const code = await provider.getCode(FACTORY_ADDRESS);
  if (code === "0x") {
    console.log("Deployer not deployed, deploying...");
    const metaDeployerPrivateKey = process.env.FACTORY_DEPLOYER_PRIVATE_KEY;
    if (!metaDeployerPrivateKey) {
      throw new Error("FACTORY_DEPLOYER_PRIVATE_KEY not set");
    }
    const metaDeployerSigner = new ethers.Wallet(
      metaDeployerPrivateKey,
      provider
    );
    const deployer = await new Deployer__factory(metaDeployerSigner).deploy();
    await deployer.deployed();
    console.log(`Deployer deployed at ${deployer.address} on chain ${chainId}`);
  } else {
    console.log(`Deployer already deployed on chain ${chainId}`);
  }

  return Deployer__factory.connect(FACTORY_ADDRESS, signer);
};

export const deployContract = async (
  name: string,
  computedContractAddress: string,
  salt: string,
  contractByteCode: string,
  deployerInstance: Deployer
): Promise<string> => {
  //const { hash, wait } = await deployerInstance.deploy(salt, contractByteCode, {maxFeePerGas: 200e9, maxPriorityFeePerGas: 75e9});
  // TODO
  // Review gas price
  const { hash, wait } = await deployerInstance.deploy(salt, contractByteCode, {gasPrice: 40e9});

  console.log(`Submitted transaction ${hash} for deployment`);

  const { status, logs, blockNumber } = await wait(5);

  if (status !== 1) {
    throw new Error(`Transaction ${hash} failed`);
  }

  console.log(`Transaction ${hash} is included in block ${blockNumber}`);

  // Get the address of the deployed contract
  const topicHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("ContractDeployed(address)")
  );
  const contractDeployedLog = logs.find((log) => log.topics[0] === topicHash);

  if (!contractDeployedLog) {
    throw new Error(`Transaction ${hash} did not emit ContractDeployed event`);
  }

  const deployedContractAddress =
    deployerInstance.interface.parseLog(contractDeployedLog).args
      .contractAddress;

  const deploymentStatus =
    computedContractAddress === deployedContractAddress
      ? "Deployed Successfully"
      : false;

  console.log(name, deploymentStatus);

  if (!deploymentStatus) {
    console.log(`Invalid ${name} Deployment`);
  }

  return "0x";
};

/**
 * deploy a contract using our EIP-2470 deployer.
 * The delpoyer is deployed (unless it is already deployed)
 * NOTE: this transaction will fail if already deployed. use getDeployedAddress to check it first.
 * @param initCode
 * @param salt
 */
// Marked for removal
export const deploy = async (
  provider: Provider,
  initCode: string,
  salt: BigNumberish,
  gasLimit?: BigNumberish | "estimate"
): Promise<string> => {
  // await this.deployFactory();

  const addr = getDeployedAddress(initCode, salt);
  const isDeployed = await isContract(addr, provider);
  if (isDeployed) {
    return addr;
  }

  const factory = new Contract(
    FACTORY_ADDRESS,
    ["function deploy(bytes _initCode, bytes32 _salt) returns(address)"],
    (provider as ethers.providers.JsonRpcProvider).getSigner()
  );
  const saltBytes32 = hexZeroPad(hexlify(salt), 32);
  if (gasLimit === "estimate") {
    gasLimit = await factory.deploy(initCode, saltBytes32, options);
  }

  // manual estimation (its bit larger: we don't know actual deployed code size)
  gasLimit =
    gasLimit ??
    arrayify(initCode)
      .map((x) => (x === 0 ? 4 : 16))
      .reduce((sum, x) => sum + x) +
      (200 * initCode.length) / 2 + // actual is usually somewhat smaller (only deposited code, not entire constructor)
      6 * Math.ceil(initCode.length / 64) + // hash price. very minor compared to deposit costs
      32000 +
      21000;
  console.log("gasLimit computed: ", gasLimit);
  const ret = await factory.deploy(initCode, saltBytes32, options);
  await ret.wait(2);
  return addr;
};

// deploy the EIP2470 factory, if not already deployed.
// (note that it requires to have a "signer" with 0.0247 eth, to fund the deployer's deployment
// Marked for removal
export const deployFactory = async (provider: Provider): Promise<void> => {
  const signer = (provider as ethers.providers.JsonRpcProvider).getSigner();
  // Return if it's already deployed
  const txn = await (signer ?? signer).sendTransaction({
    to: factoryDeployer,
    value: BigNumber.from(factoryDeploymentFee),
  });
  await txn.wait(2);
  const tx = await provider.sendTransaction(factoryTx);
  await tx.wait();
  // if still not deployed then throw / inform
};

export const numberToUint256 = (value: number) => {
  const hex = value.toString(16);
  return `0x${"0".repeat(64 - hex.length)}${hex}`;
};

export const saltToHex = (salt: string | number) => {
  salt = salt.toString();
  if (ethers.utils.isHexString(salt)) {
    return salt;
  }

  return ethers.utils.id(salt);
};

export const encodeParam = (dataType: any, data: any) => {
  const abiCoder = ethers.utils.defaultAbiCoder;
  return abiCoder.encode([dataType], [data]);
};

export const encodeParams = (dataTypes: any[], data: any[]) => {
  const abiCoder = ethers.utils.defaultAbiCoder;
  const encodedData = abiCoder.encode(dataTypes, data);
  console.log("encodedData ", encodedData);

  return encodedData;
};

export const isContract = async (address: string, provider: Provider) => {
  const code = await provider.getCode(address);
  return code.slice(2).length > 0;
};

export const parseEvents = (
  receipt: TransactionReceipt,
  contractInterface: Interface,
  eventName: string
) =>
  receipt.logs
    .map((log) => contractInterface.parseLog(log))
    .filter((log) => log.name === eventName);
