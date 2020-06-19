const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:7545'));

const colors = require('colors');
const path = require('path');
const fs = require('fs');

//Load smart contracts ABIs
let abis = {};
const directoryPath = path.join(__dirname, '../build/contracts/');
let files = fs.readdirSync(directoryPath)
files.forEach(function (file) {
    // Do whatever you want to do with the file
    abis[file.split(".")[0]] = require("../build/contracts/" + file).abi;
})

web3.eth.getAccounts().then(async accounts => {
    //Load smart contract instances deployed at migration
    let contractsAddresses = require("./contracts.json");
    let contracts = {};
    for (let contract in contractsAddresses) {
        contracts[contract] = await new web3.eth.Contract(abis[contract], contractsAddresses[contract], {gas: 2500000});
    }
    console.log("Market factory at: " + contractsAddresses["MarketFactory"]);

    //Deploy Market contract
    try {
        await contracts["MarketFactory"].methods
            .addMarket(contracts["DAIToken"]._address, "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449", 57, 25, 123)
            .send({from: accounts[0]});
    } catch (e) {
        console.log(colors.yellow("Market already exists"));
    }

    //Get markets
    let markets = await getMarkets(contracts["MarketFactory"], abis["Market"])
    markets.forEach(market=>{
        console.log("Market at: " + market._address);
    })

    //Check amount of DAI first account
    let amount = await contracts["DAIToken"].methods.balanceOf(accounts[0]).call({from: accounts[0]});
    console.log("Loaded: " + amount + " DAI to account: " + accounts[0]);

    //Add frames
    try {
        await markets[0].methods.newFrame(517).send({from: accounts[0]})
    } catch (e) {
        console.log(colors.yellow("Frame already exists"));
    }

    //Get frames struct
    let framesCount = await markets[0].methods.getFramesCount().call();
    let frames=[];
    for(let i=0;i<framesCount;i++){
        let frameKey=await markets[0].methods.framesKeys(i).call();
        frames.push(await markets[0].methods.frames(frameKey).call());
        console.log("Frame with start block: "+frameKey);
    }

})


async function getMarkets(marketFactory, marketABI) {
    let count = await marketFactory.methods.getMarketsCount().call();
    let markets = [];
    for (let i = 0; i < count; i++) {
        let marketKey = await marketFactory.methods.marketsKeys(i).call();
        //Get market contract address
        let address= await marketFactory.methods.markets(marketKey).call();
        markets.push(await new web3.eth.Contract(marketABI, address, {gas: 2500000}));
    }
    return markets;
}
