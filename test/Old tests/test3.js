const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));

web3.eth.handleRevert = true;

web3.eth.handleRevert = true;
const gas = 25000000;

let marketFactoryABI = require("../build/contracts/MarketFactory.json").abi;
let marketABI = require('../build/contracts/Market.json').abi;
let erc20ABI = require('../node_modules/@openzeppelin/contracts/build/contracts/ERC20Detailed.json').abi;
let uniswapV2PairABI = require('../node_modules/@uniswap/v2-core/build/IUniswapV2Pair.json').abi;

web3.eth.getAccounts().then(async accounts => {
    try {
        //Fetch market factory
        let contractMarketFactory = await new web3.eth.Contract(marketFactoryABI, "0xa697a9c0cD428C2B9E197b6BDFE323bb1A80EA1F");
        let addressMarket = await contractMarketFactory.methods.marketsKeys(0).call();
        let contractMarket = await new web3.eth.Contract(marketABI, addressMarket, {gas: 2500000});
        console.log("Contract Market at: " + contractMarket._address);

        let shareAmount=await contractMarket.methods.clcShareAmount("5").call();
        console.log("Share amount: "+shareAmount);
        let shareHorizon=await contractMarket.methods.clcShareHorizon("5").call();
        console.log("Share horizon: "+shareHorizon);
        let shareRange=await contractMarket.methods.clcShareRange("5").call();
        console.log("Share range: "+shareRange);

    } catch (e) {
        console.log(e);

    }
})
