Software | Version
------------- | -------------
Hardhat  | 2.6.4
Solidity  | ^0.8.0 (solc-js)
Node | v14.17.2

* Recent updates:
    * getUserLots() function added 
        * It returns an array of 100 dimensions, containing structs of user lots
        * Ex: If user has 12 lots, first 12 values in returned array will be these lots, other 88 spots will be "empty" lot structs
            * You have to filter the result for non empty lot structs
            * Something like this
            
                ```
                let lots = await this.market.getUserLots(accounts[2].address);
                let nonEmptyLots = lots.filter(val => val.lotOwner == accounts[2].address);
                ```
    * Change average price calculation, temporarily.
        *  Prices are derived from: uniswapPair.getReserves()
        *  FUnction: uint(UQ112x112.encode(_reserve1).uqdiv(_reserve0))
        * For now reserve1 and reserve0 are saved into oraclePrice0CumulativeStart nad oraclePrice0CumulativeEnd
           


### Deployed contracts on Rinkeby testnetwork ###

* **Market factory address (10. 12. 21)**: [_0xbcc9ca3920410A66F1D8e74546c5Af6f6565dA8e_](https://rinkeby.etherscan.io/address/0xbcc9ca3920410A66F1D8e74546c5Af6f6565dA8e)

* **Rinkeby market address (10. 12. 21)**: [_0x02D1dC7a08543761b259F18f74dAd3c6EcDCCeC0_](https://rinkeby.etherscan.io/address/0x02D1dC7a08543761b259F18f74dAd3c6EcDCCeC0)

    * Accounting Token - DAI: [_0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa_](https://rinkeby.etherscan.io/token/0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea)
    * Pair: [_0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e_](https://rinkeby.etherscan.io/address/0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e)
        * WETH: [_0xc778417E063141139Fce010982780140Aa0cD5Ab_](https://rinkeby.etherscan.io/token/0xc778417E063141139Fce010982780140Aa0cD5Ab)
        * DAI: [_0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa_](https://rinkeby.etherscan.io/token/0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa)




### Deployed contracts on Binance Smart Chain Testnet ###

BNB Faucet: [LINK](https://testnet.binance.org/faucet-smart)

Pancake swap: [LINK](https://pancake.kiemtienonline360.com/#/swap)

* **Market factory address (25. 11. 21)**: [_0x009A53709AE57b6365A440B33a4f8A7e3DDa45bC_](https://testnet.bscscan.com/address/0x009A53709AE57b6365A440B33a4f8A7e3DDa45bC)

* **Market address (25. 11. 21)**: [_0x079F5130f6db6a17f25057b6bB80B54fB7F42620_](https://testnet.bscscan.com/address/0x079F5130f6db6a17f25057b6bB80B54fB7F42620)

    * Accounting Token - DAI: [_0x8a9424745056Eb399FD19a0EC26A14316684e274_](https://testnet.bscscan.com/address/0x8a9424745056Eb399FD19a0EC26A14316684e274)
    * Pair: [_0xF8194358E8D0BAb9FdCF411f0f163Df4722d881B_](https://testnet.bscscan.com/address/0xF8194358E8D0BAb9FdCF411f0f163Df4722d881B)
        * DAI: [_0x8a9424745056Eb399FD19a0EC26A14316684e274_](https://testnet.bscscan.com/address/0x8a9424745056Eb399FD19a0EC26A14316684e274)
        * ETH: [_0x8BaBbB98678facC7342735486C851ABD7A0d17Ca_](https://testnet.bscscan.com/address/0x8BaBbB98678facC7342735486C851ABD7A0d17Ca)




### Deployed contracts on XDAI chain ###

* **WETH/WXDAI Market address (6. 9. 21)**: [_0x137127631A198e0e2D2DDadCAE73428F6798Fc13_](https://blockscout.com/xdai/mainnet/address/0x137127631A198e0e2D2DDadCAE73428F6798Fc13/internal-transactions)
    * Accounting token - WXDAI: : _0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d_
    * Pair: _0x7BEa4Af5D425f2d4485BDad1859c88617dF31A67_
        * WXDAI: _0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d_
        * WETH: _0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1_

❗ Honeyswap pairs info: https://info.honeyswap.org/#/pairs
