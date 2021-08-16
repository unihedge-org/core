let MarketFactory = artifacts.require("MarketFactory");
let Token = artifacts.require("Token");

let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";
let addressDAIToken = "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735";
let tokenAddress = "0x218ff5C741891eF52D7B3C3a43C59E07d3C79Ddc";

const BigN = require("bignumber.js");


module.exports = async function (deployer) {
    // await deployer.deploy(Token, "UniHedgeTestToken", "UNH", new BigN('100e18'));
    // let token = await Token.deployed();
    // console.log("Token address:" + token.address);

    //Deploy MarketFactory
    await deployer.deploy(MarketFactory, addressUniswapFactory);
    let marketFactory = await MarketFactory.deployed();
    //Create Market for ETH/DAI with 24h long frames, 10000000 sized parcels
    await marketFactory.addMarket(tokenAddress, addressUniswapV2Pair, 86400, 1625134135, 100, 100, 10000000, 3600, 10000);
    let market = await marketFactory.marketsKeys.call(0);
    console.log("Market address:" + market);
};
