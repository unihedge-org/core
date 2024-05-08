# Unihedge core contracts
## Deployed contracts on Polygon mainnet:


* Market address: [0x32C0819301bF603954C309A439cC99955b38191a](https://polygonscan.com/address/0x32C0819301bF603954C309A439cC99955b38191a)
    * Accounting Token - DAI: [0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063](https://polygonscan.com/address/0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063)  

* Market Getter address: [0x3D22cf7B927fe1a4Ed547BFC0C403A8eC2c5Edf7](https://polygonscan.com/address/0x4E7ACEc79247264e731830f67D933129682b531f)

## Latest updates:
* Referral address field added in tradeLot function
* Referral logic added to contract
* settleRate is now updated in settleFrame function
* In case of no winner, reward fund gets transfered to market owner
* New testing structure (more details in ./test folder)
* .secret switched with .env in hardhat config


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



