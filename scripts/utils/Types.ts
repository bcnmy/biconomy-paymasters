export interface Token {
  address: string;
  nativeOracleAddress: string;
  tokenOracleAddress: string;
  symbol: string;
  derivedFeed: boolean;
  priceUpdateThreshold?: number;
  // Add any other required properties for each token
}

export interface TokenConfig {
  tokens: Token[];
}
