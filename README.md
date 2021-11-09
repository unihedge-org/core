Software | Version
------------- | -------------
Hardhat  | 2.6.4
Solidity  | ^0.8.0 (solc-js)
Node | v14.17.2

* Recent updates:
    * Updated updateFramePrices() function: Cumulative Prices get updated through the whole frame. In reporting phase only oraclePrice0CumulativeEnd gets updated.
    * Lot interval changed from upper to lower limit.
    * ClcPrice() and claimReward() functions added.
    * clcAmountToApproveForUpdate() function added. It calculates amount to approve for updating your lot's price.   

### Deployed contracts on Rinkeby testnetwork ###

* **Market factory address (8. 11. 21)**: [_0x2d9F9075A5f32fA2eaC9177df7e1F1fde1bd281D_](https://rinkeby.etherscan.io/address/0x2d9F9075A5f32fA2eaC9177df7e1F1fde1bd281D)

* **Rinkeby market address (9. 11. 21)**: [_0x38b934662d750Fc2f73C960c5D1888E1f6abcEf1_](https://rinkeby.etherscan.io/address/0x2649c50930195E968e1adD4033Ea9C81c4eD33A1)

    * Accounting Token - DAI: [_0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa_](https://rinkeby.etherscan.io/token/0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea)
    * Pair: [_0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e_](https://rinkeby.etherscan.io/address/0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e)
        * WETH: [_0xc778417E063141139Fce010982780140Aa0cD5Ab_](https://rinkeby.etherscan.io/token/0xc778417E063141139Fce010982780140Aa0cD5Ab)
        * DAI: [_0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa_](https://rinkeby.etherscan.io/token/0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa)


### Deployed contracts on XDAI chain ###

* **WETH/WXDAI Market address (6. 9. 21)**: [_0x137127631A198e0e2D2DDadCAE73428F6798Fc13_](https://blockscout.com/xdai/mainnet/address/0x137127631A198e0e2D2DDadCAE73428F6798Fc13/internal-transactions)
    * Accounting token - WXDAI: : _0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d_
    * Pair: _0x7BEa4Af5D425f2d4485BDad1859c88617dF31A67_
        * WXDAI: _0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d_
        * WETH: _0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1_

❗ Honeyswap pairs info: https://info.honeyswap.org/#/pairs
