Software | Version
------------- | -------------
Hardhat  | 2.6.4
Solidity  | ^0.8.0 (solc-js)
Node | v14.17.2

* Recent updates:
    * User should be able to buy lots in the current frame now. 
    * Updated updateFramePrices() function: Cumulative Prices get updated through the whole frame. In reporting phase only oraclePrice0CumulativeEnd gets updated.
    * Lot interval changed from upper to lower limit.
    * ClcPrice() and claimReward() functions added.
    * clcAmountToApproveForUpdate() function added. It calculates amount to approve for updating your lot's price.   

### Deployed contracts on Rinkeby testnetwork ###

* **Market factory address (13. 11. 21)**: [_0x14d56DE6209E1D6Dc62924977FfC175621Ce69DB_](https://rinkeby.etherscan.io/address/0x14d56DE6209E1D6Dc62924977FfC175621Ce69DB)

* **Rinkeby market address (13. 11. 21)**: [_0x01d60439c6EAe1e9cfDc3df1dCAbf09115c9Fc28_](https://rinkeby.etherscan.io/address/0x01d60439c6EAe1e9cfDc3df1dCAbf09115c9Fc28)

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
