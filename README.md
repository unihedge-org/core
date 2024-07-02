# Unihedge core contracts
## Deployed contracts on Polygon mainnet:


* Market address: [0xF868b1d4E640a793E5CE17aE710f86539670E490](https://polygonscan.com/address/0xF868b1d4E640a793E5CE17aE710f86539670E490)
    * Accounting Token - DAI: [0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063](https://polygonscan.com/address/0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063)  

* Market Getter address: [0x0F0e8939d9bEd51377cd9461D66e22a82958739f](https://polygonscan.com/address/0x0F0e8939d9bEd51377cd9461D66e22a82958739f)

## Latest updates:
* Market contract now has **userArray** that stores all users that were created
* New functions in market contract:
    * getFramesLength() --> returns length of framesKeys array
    * getLotsLength(uint frameKey) --> returns length of lotKey in a given frame
    * getUsersArrayLength() --> returns the number of users
* New functions in marketGetter:    
    * function getLotsByIndex(Market market, uint frameKey, uint startIndex, uint endIndex) external view returns (Market.Lot[] memory lots)
    * function getFramesByIndex(Market market, uint startIndex, uint endIndex) external view returns (Market.Frame[] memory frames)
    * function getLotsSoldUser(Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (Market.Lot[] memory userLots, uint pagesLeft)
        * works the same as getLotsUser, except it looks only at past lot states to find the current user as owner
    * function getUsersReferrals(Market market, address user) external view returns (address[] memory referrals, uint16 length)
    * function getUserRewards(Market market, address user, uint frameKeyStart, uint frameKeyEnd) external view returns (uint reward)
    * function getMultipleUsersRewards(Market market, uint firstUserIndex, uint lastUserIndex, uint frameKeyStart, uint frameKeyEnd) external view returns (uint comulativeReward, uint[] memory rewards)


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



