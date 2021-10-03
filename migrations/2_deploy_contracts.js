let MarketFactory = artifacts.require("MarketFactory");
let Token = artifacts.require("Token");

let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e";
let addressDAIToken = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
let tokenAddress = "0x218ff5C741891eF52D7B3C3a43C59E07d3C79Ddc";

let xdaiMarketFactory = "0x58E130c6c522B2e22A2369412d7C99e56657c46e";
let wethWxdaiPair = "0x7BEa4Af5D425f2d4485BDad1859c88617dF31A67";
let wrappedXdai = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

const BigN = require("bignumber.js");


module.exports = async function (deployer) {
    /* await deployer.deploy(Token, "UniHedgeTestToken", "UNH", new BigN('100e18'));
    let token = await Token.deployed();
    console.log("Token address:" + token.address);
 */


    //Deploy MarketFactory
    // await deployer.deploy(MarketFactory, addressUniswapFactory);
    // let marketFactory = await MarketFactory.deployed();
    // console.log("Market factory: " + marketFactory.address);
    let marketFactory = await MarketFactory.at("0x7d9a9D6B177B93D09AA0e82005894D45A7Eab5cE");
    // //Create Market for WXDAI/WETH with 1h long frames, 10000000 sized parcels
    await marketFactory.addMarket(addressDAIToken, addressUniswapV2Pair, 3600, 1630911654, 100, 100, BigN('100000000000000000000000000'), 1800, 1000);
    let market = await marketFactory.marketsKeys.call(0);
    console.log("Market address: " + market);
};
