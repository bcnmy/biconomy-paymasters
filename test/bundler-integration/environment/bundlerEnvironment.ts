import { providers, BigNumberish, utils, BigNumber } from "ethers";
import axios, { AxiosInstance } from "axios";
import { ethers, config } from "hardhat";
import type { HttpNetworkConfig } from "hardhat/types";
import { UserOperation } from "../../../lib/account-abstraction/test/UserOperation";
import { hexValue } from "ethers/lib/utils";

export type Snapshot = {
  blockNumber: number;
};

export class UserOperationSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserOperationSubmissionError";
  }
}
export class BundlerResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleResetError";
  }
}
export class GetUserOpReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GetUserOpReceiptError";
  }
}

export type JsonRpcResponse<T> = {
  jsonrpc: string;
  result: T;
};

export type EthSendUserOperationResult = JsonRpcResponse<string>;

export type EthGetUserOperationReceipt = JsonRpcResponse<{
  userOpHash: string;
  sender: string;
  nonce: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  logs: Array<any>;
  receipt: any;
}>;

export const serializeUserOp = (op: UserOperation) => ({
  sender: op.sender,
  nonce: hexValue(op.nonce),
  initCode: op.initCode,
  callData: op.callData,
  callGasLimit: hexValue(op.callGasLimit),
  verificationGasLimit: hexValue(op.verificationGasLimit),
  preVerificationGas: hexValue(op.preVerificationGas),
  maxFeePerGas: hexValue(op.maxFeePerGas),
  maxPriorityFeePerGas: hexValue(op.maxPriorityFeePerGas),
  paymasterAndData: op.paymasterAndData,
  signature: op.signature,
});

export class BundlerTestEnvironment {
  public static BUNDLER_ENVIRONMENT_CHAIN_ID = 1337;
  public static DEFAULT_FUNDING_AMOUNT = utils.parseEther("1000");

  DOCKER_COMPOSE_DIR = __dirname;
  DOCKER_COMPOSE_BUNDLER_SERVICE = "bundler";

  private apiClient: AxiosInstance;
  public defaultSnapshot: Snapshot | undefined;
  private static instance: BundlerTestEnvironment;

  constructor(
    public readonly provider: providers.JsonRpcProvider,
    public readonly bundlerUrl: string
  ) {
    this.apiClient = axios.create({
      baseURL: this.bundlerUrl,
    });
  }

  static getDefaultInstance = async () => {
    if (this.instance) {
      return this.instance;
    }

    this.instance = new BundlerTestEnvironment(
      new providers.JsonRpcProvider(
        (config.networks.local as HttpNetworkConfig).url
      ),
      "http://localhost:3000"
    );

    const defaultAddresses = (await ethers.getSigners()).map(
      (signer) => signer.address
    );
    await this.instance.fundAccounts(
      defaultAddresses,
      defaultAddresses.map((_) => this.DEFAULT_FUNDING_AMOUNT)
    );

    this.instance.defaultSnapshot = await this.instance.snapshot();

    return this.instance;
  };

  fundAccounts = async (
    accountsToFund: string[],
    fundingAmount: BigNumberish[]
  ) => {
    const signer = this.provider.getSigner();
    const nonce = await signer.getTransactionCount();
    accountsToFund = (
      await Promise.all(
        accountsToFund.map(
          async (account, i): Promise<[string, boolean]> => [
            account,
            (await this.provider.getBalance(account)).lt(fundingAmount[i]),
          ]
        )
      )
    )
      .filter(([, needsFunding]) => needsFunding)
      .map(([account]) => account);
    await Promise.all(
      accountsToFund.map((account, i) =>
        signer.sendTransaction({
          to: account,
          value: fundingAmount[i],
          nonce: nonce + i,
        })
      )
    );
  };

  snapshot = async (): Promise<Snapshot> => ({
    blockNumber: await this.provider.getBlockNumber(),
  });

  sendUserOperation = async (
    userOperation: UserOperation,
    entrypointAddress: string
  ): Promise<EthSendUserOperationResult> => {
    const result = await this.apiClient.post("/rpc", {
      jsonrpc: "2.0",
      method: "eth_sendUserOperation",
      params: [serializeUserOp(userOperation), entrypointAddress],
    });
    if (result.status !== 200) {
      throw new Error(
        `Failed to send user operation: ${JSON.stringify(
          result.data.error.message
        )}`
      );
    }
    if (result.data.error) {
      throw new UserOperationSubmissionError(JSON.stringify(result.data.error));
    }

    return result.data;
  };

  getUserOperationReceipt = async (
    userOperationHash: string
  ): Promise<EthGetUserOperationReceipt> => {
    const result = await this.apiClient.post("/rpc", {
      jsonrpc: "2.0",
      method: "eth_getUserOperationReceipt",
      params: [userOperationHash],
    });
    if (result.status !== 200) {
      throw new Error(
        `Failed to get userop receipt: ${JSON.stringify(
          result.data.error.message
        )}`
      );
    }
    if (result.data.error) {
      throw new UserOperationSubmissionError(JSON.stringify(result.data.error));
    }

    return result.data;
  };

  resetBundler = async () => {
    const result = await this.apiClient.post("/rpc", {
      jsonrpc: "2.0",
      method: "debug_bundler_clearState",
      params: [],
    });
    if (result.status !== 200) {
      throw new Error(
        `Failed to send reset bundler: ${JSON.stringify(
          result.data.error.message
        )}`
      );
    }
    if (result.data.error) {
      throw new BundlerResetError(JSON.stringify(result.data.error));
    }

    if (result.data.result !== "ok") {
      throw new BundlerResetError(
        `Failed to reset bundler: ${JSON.stringify(result.data.result)}`
      );
    }
  };

  dumpMempool = async () => {
    const result = await this.apiClient.post("/rpc", {
      jsonrpc: "2.0",
      method: "debug_bundler_dumpMempool",
      params: [],
    });
    if (result.status !== 200) {
      throw new Error(
        `Failed to send reset bundler: ${JSON.stringify(
          result.data.error.message
        )}`
      );
    }
    if (result.data.error) {
      throw new BundlerResetError(JSON.stringify(result.data.error));
    }

    return result.data.result;
  };

  revert = async (snapshot: Snapshot) => {
    await this.provider.send("debug_setHead", [
      utils.hexValue(BigNumber.from(snapshot.blockNumber)),
    ]);

    // getBlockNumber() caches the result, so we directly call the rpc method instead
    const currentBlockNumber = BigNumber.from(
      await this.provider.send("eth_blockNumber", [])
    );
    if (!BigNumber.from(snapshot.blockNumber).eq(currentBlockNumber)) {
      throw new Error(
        `Failed to revert to block ${snapshot.blockNumber}. Current block number is ${currentBlockNumber}`
      );
    }
  };
}
