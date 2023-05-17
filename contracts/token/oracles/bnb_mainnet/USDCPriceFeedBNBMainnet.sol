// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

//@review againsnt chainlink reference PriceConverter https://docs.chain.link/docs/get-the-latest-price/ 
//@review decimals for individual feeds
contract USDCPriceFeedBNBMainnet {

    AggregatorV3Interface internal priceFeed1;
    AggregatorV3Interface internal priceFeed2;


    constructor() {
        priceFeed1 = AggregatorV3Interface(0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE);     // BNB usd 
        priceFeed2 = AggregatorV3Interface(0x51597f405303C4377E36123cBc172b13269EA163);     // usdc usd
    }

    function decimals() public view returns (uint8) { 
      return 18;
    }

    function description() public view returns(string memory) {
      return "USDC / BNB";
    }

    function getThePrice() public view returns (int) {   

      // Review: If either of the base or quote price feeds have mismatch in decimal then it could be a problem  
         
      /**
       * Returns the latest price of price feed 1
      */
    
      (             
       uint80 roundID1,              
       int256 price1,            
       ,             
       uint256 updatedAt1,
       uint80 answeredInRound1        
       ) = priceFeed1.latestRoundData();  

      require(price1 > 0, "Chainlink price <= 0");
      // 2 days old price is considered stale since the price is updated every 24 hours
      require(updatedAt1 >= block.timestamp - 60 * 60 * 24 * 2, "Incomplete round");
      require(answeredInRound1 >= roundID1, "Stale price");
      // price11 = uint192(int192(price1));
     
     /**
      * Returns the latest price of price feed 2
     */
    
      (             
       uint80 roundID2,              
       int256 price2,            
       ,             
       uint256 updatedAt2,
       uint80 answeredInRound2        
       ) = priceFeed2.latestRoundData();  

      require(price2 > 0, "Chainlink price <= 0");
      // 2 days old price is considered stale since the price is updated every 24 hours
      require(updatedAt2 >= block.timestamp - 60 * 60 * 24 * 2, "Incomplete round");
      require(answeredInRound2 >= roundID2, "Stale price");
     
    
    // Always using decimals 18 for derived price feeds
    int usdc_BNB = price2*(10**18)/price1;
    return usdc_BNB;
    }
     
}