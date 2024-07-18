# Unihedge core contracts
## Deployed contracts on Polygon mainnet:


* Market address: [0x3F1A0f4303a5CAa12165F15ceC24dFBfeBeec1b0](https://polygonscan.com/address/0x3F1A0f4303a5CAa12165F15ceC24dFBfeBeec1b0)
    * Accounting Token - DAI: [0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063](https://polygonscan.com/address/0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063)  

* Market Getter address: [0x1FA341466575674e537Ef17953ceEDe22B66917c](https://polygonscan.com/address/0x1FA341466575674e537Ef17953ceEDe22B66917c)

## Latest updates:
* Market contract now has **lotsArray** that stores all lots that were ever created
    * Array elements are in uint format: lotKey + frameKey concatenated. 
    * Ex: 
        * LotKey = 900000000000000000000
        * FrameKey = 1721923200
        * lotKey + frameKey = 9000000000000000000001721923200
* New functions in market contract:
    * getLotsArrayLength() --> returns length of lotsArray
* New functions in marketGetter:    
    * function splitLotsArrayElement(uint256 concatenated) public pure returns (uint256 frameKey, uint256 lotKey)
    * function getLotsByIndex updated with new logic



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



