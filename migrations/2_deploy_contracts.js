let DAIToken = artifacts.require("DAIToken");
let TRWToken = artifacts.require("TRWToken");
let MarketFactory = artifacts.require("MarketFactory");

let addrUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

const fs = require('fs');
let contracts = {};

module.exports = async function (deployer) {
    //Deploy test DAI token
    await deployer.deploy(DAIToken);
    //Deploy TRW token
    await deployer.deploy(TRWToken);
    //Deploy MarketFactory
    await deployer.deploy(MarketFactory, addrUniswapFactory);

    contracts["DAIToken"]=DAIToken.address;
    contracts["TRWToken"]=TRWToken.address;
    contracts["MarketFactory"]=MarketFactory.address;
    fs.writeFile("./test/contracts.json",JSON.stringify(contracts),()=>{
    });

};
