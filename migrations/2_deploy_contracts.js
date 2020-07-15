let MarketFactory = artifacts.require("MarketFactory");
let addrUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

const fs = require('fs');
let contracts = {};

module.exports = async function (deployer) {
    //Deploy MarketFactory
    await deployer.deploy(MarketFactory, addrUniswapFactory);

    //Write to file contract addresses
    contracts["MarketFactory"]=MarketFactory.address;
    fs.writeFile("./test/contracts.json",JSON.stringify(contracts),()=>{
    });

};
