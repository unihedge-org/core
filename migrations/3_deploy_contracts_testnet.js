let MarketFactory = artifacts.require("MarketFactory");

let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";
let addressDAIToken = "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735";


module.exports = async function (deployer) {
    //Deploy MarketFactory
    await deployer.deploy(MarketFactory, addressUniswapFactory);
    let marketFactory = await MarketFactory.deployed();
        //Create Market for ETH/DAI with DAI 6h
    let market = await marketFactory.addMarket(addressDAIToken, addressUniswapV2Pair, 1440, 0, 100);
};
