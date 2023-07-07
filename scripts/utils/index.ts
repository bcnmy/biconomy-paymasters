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
/*export enum DEPLOYMENT_SALTS { // DEV
  ORACLE_AGGREGATOR = "DEVX_CHAINLINK_ORACLE_AGGREGATOR_V0_27062023_bBee55b", // 0x0000065b8abb967271817555f23945eedf08015c
  TOKEN_PAYMASTER = "DEVX_TOKEN_PAYMASTER_V0_07072023_UjCTfVP", // 0x00007d1c46f655a90cec22033bba3de393981bdc
  PRICE_FEED_USDC = "DEVX_PRICE_FEED_USDC_V0_27062023_uiaqdyv", // 0x000005abae3deadbe1fbd12105f950efba9eaec4
  PRICE_FEED_USDT = "DEVX_PRICE_FEED_USDT_V0_27062023_dIos1Nw", // 0x000001e2c2b39542c30a3fe57c4487030bc03adf
  PRICE_FEED_DAI = "DEVX_PRICE_FEED_DAI_V0_27062023_1m7JNWQ", // 0x000000d2da196474046c7a4d94ab0e566b26d054
  PRICE_FEED_SAND = "DEVX_PRICE_FEED_SAND_V0_27062023_eHPqgeR", // 0x00000980455efb131c1908efa908c1eaf19db352
  PRICE_FEED_AAVE = "DEVX_PRICE_FEED_AAVE_V0_28062023_HsugnpY", // 0x0000af22a276f86b405835c18863e1c2a679d9e3
  PRICE_FEED_CAKE = "DEVX_PRICE_FEED_CAKE_V0_27062023_1BKpzde", // 0x000007198738f877c01d9b7e4a4e1bd17e46e4a8
  PRICE_FEED_LINK = "DEVX_PRICE_FEED_LINK_V0_27062023_JHIxs6o", // 0x00000da809fe7be1297ee731f998141ba352778d
  PRICE_FEED_1INCH = "DEVX_PRICE_FEED_1INCH_V0_27062023_XhXA3sd", // 0x00000c451fa0b0a79a36c82820f061683e26714c
  PRICE_FEED_TWT = "DEVX_PRICE_FEED_TWT_V0_27062023_92Xklvq", // 0x00000e862312c82af2301e6c433e75099665649d
  PRICE_FEED_UNI = "DEVX_PRICE_FEED_UNI_V0_27062023_PBQ6vdq" // 0x0000095cce092e83e5826cfeb0f03cfa74915b41 
}*/

// 0x988C135a1049Ce61730724afD342fb7C56CD2776 : Deployer address
export enum DEPLOYMENT_SALTS { // PROD
  ORACLE_AGGREGATOR = "PROD_CHAINLINK_ORACLE_AGGREGATOR_V0_27062023_UT8R11e", // 0x00000f7748595e46527413574a9327942e744e91
  TOKEN_PAYMASTER = "PROD_TOKEN_PAYMASTER_V0_07072023_ViQb010", // 0x0000b721585eec45c313e010e2020fc8429178ce
  PRICE_FEED_USDC = "DEVX_PRICE_FEED_USDC_V0_27062023_uiaqdyv", // 0x000005abae3deadbe1fbd12105f950efba9eaec4
  PRICE_FEED_USDT = "DEVX_PRICE_FEED_USDT_V0_27062023_dIos1Nw", // 0x000001e2c2b39542c30a3fe57c4487030bc03adf
  PRICE_FEED_DAI = "DEVX_PRICE_FEED_DAI_V0_27062023_1m7JNWQ", // 0x000000d2da196474046c7a4d94ab0e566b26d054
  PRICE_FEED_SAND = "DEVX_PRICE_FEED_SAND_V0_27062023_eHPqgeR", // 0x00000980455efb131c1908efa908c1eaf19db352
  PRICE_FEED_AAVE = "DEVX_PRICE_FEED_AAVE_V0_28062023_HsugnpY", // 0x0000af22a276f86b405835c18863e1c2a679d9e3
  PRICE_FEED_CAKE = "DEVX_PRICE_FEED_CAKE_V0_27062023_1BKpzde", // 0x000007198738f877c01d9b7e4a4e1bd17e46e4a8
  PRICE_FEED_LINK = "DEVX_PRICE_FEED_LINK_V0_27062023_JHIxs6o", // 0x00000da809fe7be1297ee731f998141ba352778d
  PRICE_FEED_1INCH = "DEVX_PRICE_FEED_1INCH_V0_27062023_XhXA3sd", // 0x00000c451fa0b0a79a36c82820f061683e26714c
  PRICE_FEED_TWT = "DEVX_PRICE_FEED_TWT_V0_27062023_92Xklvq", // 0x00000e862312c82af2301e6c433e75099665649d
  PRICE_FEED_UNI = "DEVX_PRICE_FEED_UNI_V0_27062023_PBQ6vdq", // 0x0000095cce092e83e5826cfeb0f03cfa74915b41
  PRICE_FEED_ETH = "DEVX_PRICE_FEED_ETH_V0_27062023_jZ9Dvxh", // 0x00008cc9d5bf9f97ae2879163011707812561b42
  PRICE_FEED_BUSD = "DEVX_PRICE_FEED_BUSD_V0_27062023_J8nJR8O", // 0x000020c39775542112e3db0dbad0d47a44beb49a
  PRICE_FEED_MANA = "DEVX_PRICE_FEED_MANA_V0_28062023_E87OPLB", // 0x0000de2ed5b4f74b6f03539529e8cb67545d7834
  PRICE_FEED_QUICK = "DEVX_PRICE_FEED_QUICK_V0_27062023_9UTXOsb", // 0x0000abae40c30ab8ac824ba01eb1003a0d1a2754
  PRICE_FEED_SUSHI = "DEVX_PRICE_FEED_SUSHI_V0_27062023_dyZta4I", // 0x0000552e10e879f403dd5f041742e6356d031825
  PRICE_FEED_TUSD = "DEVX_PRICE_FEED_TUSD_V0_27062023_QHVx0oQ", // 0x000064b138edb97ac8a3f4564e14d9a331288a6b
  PRICE_FEED_WBTC = "DEVX_PRICE_FEED_WBTC_V0_27062023_z41FLvK", // 0x00002d444779516f9d60368f3fa1e2b036bccc7d
  PRICE_FEED_WOO = "DEVX_PRICE_FEED_WOO_V0_27062023_zjZa7el", // 0x0000de1c603c7272383e8a7ed24a5b9941da36df
  PRICE_FEED_AVAX = "DEVX_PRICE_FEED_AVAX_V0_27062023_f9ygwpY", // 0x0000312944601e41a06bc26c7b28912ff15248e1
  PRICE_FEED_BAL = "DEVX_PRICE_FEED_BAL_V0_27062023_IzEMruz", // 0x00002a35f6a70c64769d9ff26750f5b5cae2bc88
  PRICE_FEED_CEL = "DEVX_PRICE_FEED_CEL_V0_28062023_ZALYl4b", // 0x0000c8effbe9d075b6e56c1ab2d1de9952141c8d
  PRICE_FEED_COMP = "DEVX_PRICE_FEED_COMP_V0_27062023_54gIpet", // 0x00003fa408c59d15f1c43f07cba2724d2d64bc73
  PRICE_FEED_CRV = "DEVX_PRICE_FEED_CRV_V0_27062023_GrIWEtf", // 0x0000ba91fb68ea2ff253328834cb9e1d0f427d83
  PRICE_FEED_AGEUR = "DEVX_PRICE_FEED_AGEUR_V0_27062023_npeAxaf", // 0x00000a13b868feed2de6adc47b982caa875f1879
  PRICE_FEED_FRAX = "DEVX_PRICE_FEED_FRAX_V0_27062023_MmgkOOQ", // 0x00005f9f7f943e3db079d3b9a7a86aa80b70898c
  PRICE_FEED_GHST = "DEVX_PRICE_FEED_GHST_V0_27062023_GgAZpkz", // 0x0000af2e95ecabcc7b2c03bf2dd8e840554a98c4
  PRICE_FEED_GRT = "DEVX_PRICE_FEED_GRT_V0_27062023_uBLkfy1", // 0x000005e5cc18cdb3cdb513cabafb4d215ae63235
  PRICE_FEED_KNC = "DEVX_PRICE_FEED_KNC_V0_27062023_G3ECzSl", // 0x0000db3bfa1c8c27e4b99e5b023bfd30f210c185
  PRICE_FEED_MIMATIC = "DEVX_PRICE_FEED_MIMATIC_V0_27062023_IgmN8NM", // 0x0000a60ddc7e929da83af1821fb13b7bbc2bf2c2
  PRICE_FEED_OM = "DEVX_PRICE_FEED_OM_V0_27062023_moV4Zhy", // 0x00005afae4a06322ce9b08bb930ec175bd35fa53
  PRICE_FEED_PLA = "DEVX_PRICE_FEED_PLA_V0_27062023_BsEEM6r", // 0x00007adbc383d37a2f67d45544b677191d73d2ba
  PRICE_FEED_RAI = "DEVX_PRICE_FEED_RAI_V0_27062023_GfS8MIt", // 0x0000a3d0bedb1f6533db80ff63d33a3ccba4ddde
  PRICE_FEED_SNX = "DEVX_PRICE_FEED_SNX_V0_27062023_4DrwwXZ", // 0x0000f303a2ed1edf64c3b41e937028b7140d94c8
  PRICE_FEED_SOL = "DEVX_PRICE_FEED_SOL_V0_27062023_tnr0Rv6", // 0x0000daa8f8e278521abe99805113c0cc157acb97
  PRICE_FEED_TRY = "DEVX_PRICE_FEED_TRY_V0_27062023_CDdLFlo", // 0x000017bbc04b0b1efd0372e1f353bc5aadd4c659
  PRICE_FEED_XRP = "DEVX_PRICE_FEED_XRP_V0_27062023_tjCRahl", // 0x000088dd30d78558afc27ff79b7e3ead5751dbc6
  PRICE_FEED_MASK = "DEVX_PRICE_FEED_MASK_V0_27062023_n5J3tCG", // 0x0000ca992a5420de8725a494ae98638e2682b0f8
  PRICE_FEED_DOGE = "DEVX_PRICE_FEED_DOGE_V0_27062023_5YdLYJc", // 0x0000ddb960714b49a6470f66c032c7c6cc41acb2
  PRICE_FEED_MIM = "DEVX_PRICE_FEED_MIM_V0_27062023_faxTfxe", // 0x000020a943cece5043e1309663bc5bfa822de646
  PRICE_FEED_AUTO = "DEVX_PRICE_FEED_AUTO_V0_27062023_nk64r20", // 0x000093807d7670407cca1f1b4c2222acc81f2dda
  PRICE_FEED_DOT = "DEVX_PRICE_FEED_DOT_V0_27062023_lIgEmg1", // 0x0000344411679c8d7e049349b02d082ef500661b
  PRICE_FEED_VAI = "DEVX_PRICE_FEED_VAI_V0_27062023_5JAZXHq", // 0x00002f98e2473e715c4c799ed6283af82cae5436
  PRICE_FEED_BAND = "DEVX_PRICE_FEED_BAND_V0_27062023_wtCuh5w", // 0x00000c66455d60c1cd69af839fe95cee02ed531f
  PRICE_FEED_ADA = "DEVX_PRICE_FEED_ADA_V0_27062023_qygbOee", // 0x0000d32bded21f301b68d7bea45276f3e6314fe2
  PRICE_FEED_XVS = "DEVX_PRICE_FEED_XVS_V0_27062023_wBKaSPp", // 0x000003721b4d9c88c38ad56aa11e13de61486ab5
  PRICE_FEED_YFI = "DEVX_PRICE_FEED_YFI_V0_27062023_6EmwyeO", // 0x00009c23613df04f733a2b72f4e5cb585a47e5c9
  PRICE_FEED_SXP = "DEVX_PRICE_FEED_SXP_V0_27062023_NHosDhE", // 0x0000d67b9bbfccefc402bfa787829a8dc49205e6
  PRICE_FEED_REEF = "DEVX_PRICE_FEED_REEF_V0_27062023_CMtabEv", // 0x000076ad9069129feba496946bbf4b5e8aba72b5
  PRICE_FEED_ALPHA = "DEVX_PRICE_FEED_ALPHA_V0_27062023_MtEbJge", // 0x0000343be957fc284f4df64d38cbaa7e065dd984
  PRICE_FEED_INJ = "DEVX_PRICE_FEED_INJ_V0_27062023_HCNhbey", // 0x00009d870cd3d340588cdc63414785d84680cd84
  PRICE_FEED_EOS = "DEVX_PRICE_FEED_EOS_V0_27062023_ORB34FP", // 0x0000a730301a18c1f2a8fd7656f8f368135eff17
  PRICE_FEED_LTC = "DEVX_PRICE_FEED_LTC_V0_27062023_zxuYpzV", // 0x0000d03686e0113616906f8018cef0ebff588edf
  PRICE_FEED_LIT = "DEVX_PRICE_FEED_LIT_V0_27062023_QzFcBwH", // 0x00004244169f87a2b6fa95fb60481f7d02d9927e
  PRICE_FEED_BCH = "DEVX_PRICE_FEED_BCH_V0_27062023_kMHbG6e", // 0x00000756352a0224a157c8867df7af41592b66f0
  PRICE_FEED_FIL = "DEVX_PRICE_FEED_FIL_V0_27062023_4v9KFOn", // 0x0000d2911880fca9c055c858c8ee36a4c00df11a
  PRICE_FEED_ATOM = "DEVX_PRICE_FEED_ATOM_V0_27062023_uA0jFGU", // 0x0000b3b5e8722d41f23b483747ad69d553ad4e41
  PRICE_FEED_BETH = "DEVX_PRICE_FEED_BETH_V0_27062023_HIdX0nG", // 0x00001844fe863119d4f5a36fb9b13477cc7fb482
  PRICE_FEED_NEAR = "DEVX_PRICE_FEED_NEAR_V0_27062023_GfOHuQa", // 0x0000e8fbb89b5a593183d52fbe0cacc4fde43d06
  PRICE_FEED_ONT = "DEVX_PRICE_FEED_ONT_V0_27062023_cvuyqC7", // 0x0000331f158b3691c9d7e5b623f8e59ee6d4dfc4
  PRICE_FEED_DODO = "DEVX_PRICE_FEED_DODO_V0_27062023_ZYqxFW0", // 0x00000dfd5ba9c0bd10d739cc6c315cbd0bf22d03
  PRICE_FEED_LINA = "DEVX_PRICE_FEED_LINA_V0_27062023_tsAKhlg", // 0x00009d8f80ac35d0242251b1475f8e6d056ca56f
  PRICE_FEED_BIFI = "DEVX_PRICE_FEED_BIFI_V0_27062023_j5hVBjs", // 0x0000dd2600f5fc02fef2cd97717364144e6c0298
  PRICE_FEED_ALPACA = "DEVX_PRICE_FEED_ALPACA_V0_27062023_HmWTvr1", // 0x0000778014b53a0396a3ce80237afcf89c4a603f
  PRICE_FEED_MBOX = "DEVX_PRICE_FEED_MBOX_V0_27062023_gtGW8Jd", // 0x0000d4b5153b5cc737d5c8a53a29e70257e7de5e
  PRICE_FEED_ZIL = "DEVX_PRICE_FEED_ZIL_V0_27062023_zucJh8i", // 0x0000d52fa02fb12f469df9b21e8069271844cf9c
  PRICE_FEED_XTZ = "DEVX_PRICE_FEED_XTZ_V0_27062023_EqsLbfu", // 0x00004443efb75bdecdaaad6293e10e3e9cdbd0a7
  PRICE_FEED_BSW = "DEVX_PRICE_FEED_BSW_V0_27062023_Kv26Fjv", // 0x0000f453c85ab3c839c49ef729f36081ac8d7ac2
  PRICE_FEED_GMT = "DEVX_PRICE_FEED_GMT(GREENMETA)_V0_27062023_OP631xI", // 0x0000a179410b6ae396fbf9328179cc51e8eb811e
  PRICE_FEED_USDD = "DEVX_PRICE_FEED_USDD_V0_27062023_PvMWVhA", // 0x000062e3727903c86308e8c008f2c4147e1bf83b
  PRICE_FEED_AXS = "DEVX_PRICE_FEED_AXS_V0_27062023_TcgSX8U", // 0x0000129361c7da0ade90f2559d8dbfce86f73cf0
  PRICE_FEED_C98 = "DEVX_PRICE_FEED_C98_V0_27062023_5SwtjcK", // 0x0000ecddfafffcc20a2ef11694513a2c63564c45
  PRICE_FEED_FTM = "DEVX_PRICE_FEED_FTM_V0_27062023_e8NvX2b", // 0x000014e7939ad646144ea6b96267bb1bd7cd7067
  PRICE_FEED_MDX = "DEVX_PRICE_FEED_MDX_V0_27062023_4cZxM3m", // 0x000055ceb7e51700701d185a2fc5c85cd0a0b4c0
  PRICE_FEED_RDNT = "DEVX_PRICE_FEED_RDNT_V0_27062023_CE7LvWZ", // 0x000008fa6c7a8dfdd2eee14360704552e7ff1106
  PRICE_FEED_GMT2 = "DEVX_PRICE_FEED_GMT(GOMINING)_V0_27062023_9BlrrVe", // 0x000000eb1bd01130b0429299c59bcc51280ecfa3
  PRICE_FEED_MATIC = "DEVX_PRICE_FEED_MATIC_V0_27062023_dUA11H1", // 0x0000131e033973d4042167f814974d398c954ae4
  PRICE_FEED_WSTETH = "DEVX_PRICE_FEED_WSTETH_V0_27062023_mg8XpNM", // 0x0000a6681f350ef83af4dbf603bb0c54b63f6526
  PRICE_FEED_ARB = "DEVX_PRICE_FEED_ARB_V0_27062023_3wuHuct", // 0x00003ecc9947e6e5128427290debbcaae8199b3f
  PRICE_FEED_GMX = "DEVX_PRICE_FEED_GMX_V0_27062023_qKe9UwO", // 0x00001bc10bab33fb8c0f93330e16153894f02a61
  PRICE_FEED_JOE = "DEVX_PRICE_FEED_JOE_V0_27062023_XxQWl65", // 0x000074df2b9ad8a7be4d07a85f278ca0017513d3
  PRICE_FEED_DPX = "DEVX_PRICE_FEED_DPX_V0_27062023_5Y1OOrG", // 0x00003e7f4bb63a6b24f2b45afc698a20d7efed65
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
  const { hash, wait } = await deployerInstance.deploy(salt, contractByteCode, {gasPrice: 10e9});

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
