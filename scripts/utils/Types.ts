export interface TokenConfig {
  tokens: Token[];
}

export interface Token {
  address: string;
  priceFeedAddress: string;
  priceFeedFunction: string;
  description: string;
  nativeOracleAddress: string;
  tokenOracleAddress: string;
  symbol: string;
  feedSalt: string;
  derivedFeed: boolean;
  // Add any other required properties for each token
}
