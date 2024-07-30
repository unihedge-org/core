# Unihedge core contracts
## Deployed contracts on Polygon mainnet:


* Market address: [0xC582D1DE0Ee6a37DC25A9DecB1602dd254000FC1](https://polygonscan.com/address/0xC582D1DE0Ee6a37DC25A9DecB1602dd254000FC1)
    * Accounting Token - DAI: [0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063](https://polygonscan.com/address/0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063)  

* Market Getter address: [0x53A655EEAFCe59d596Ef91363498e3fa95639DF8](https://polygonscan.com/address/0x53A655EEAFCe59d596Ef91363498e3fa95639DF8)

## Latest updates:
* New functions in marketGetter:    
    * function getUsersByIndexFull(Market market, uint startIndex, uint endIndex) external view returns (User[] memory users)
        * startIndex - start index of users in the user array
        * endIndex - end index of users in the user array
        * returns users with rewards and collected arrays (100 %)
    * function getUsersByIndex(Market market, uint startIndex, uint endIndex, uint startIndexArray, uint endIndexArray) external view returns (User[] memory users)
        * startIndex - start index of users in the user array
        * endIndex - end index of users in the user array
        * startIndexArray - start index of users rewards and collected arrays
        * endIndexArray - end index of users rewards and collected arrays
    * function getUserRewardsLength(Market market, address user) public view returns (uint)
    * function getUserRewardsByIndex(Market market, address user, uint startIndex, uint endIndex) public view returns (uint[] memory rewards)
    * function getUserCollectedByIndex(Market market, address user, uint startIndex, uint endIndex) public view returns (uint[] memory collected)



## Software version for developement
Software | Version
------------- | -------------
Hardhat  | 2.22.3
Solidity  | 0.8.0 (solc-js)
Node | v18.17.0
npm | 9.6.7


## Transaction fees
TODO: Sprobat vse funkcije kolko stanejo cca.
* Set Frame Rate: [0.021271387854123456 MATIC](https://polygonscan.com/tx/0xa94618edbc1149304a1a99fca82da961ec577b824da5ac7c30117914013b4815)



