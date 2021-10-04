const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));

web3.eth.handleRevert = true;


let addressUniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";
let addressTokenDAI = "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735";

web3.eth.handleRevert = true;
const gas = 25000000;

web3.eth.getAccounts().then(async accounts => {
    try {
        //Deploy market factory
        let contractMarketFactory = await new web3.eth.Contract(require("../build/contracts/MarketFactory.json").abi);
        contractMarketFactory = await contractMarketFactory.deploy({
            data: require('../build/contracts/MarketFactory.json').bytecode,
            arguments: [addressUniswapV2Factory]
        })
            .send({
                from: accounts[0],
                gas: gas
            });
        console.log("Contract MarketFactory deployed " + contractMarketFactory._address);
        //Add market
        await contractMarketFactory.methods.addMarket(addressTokenDAI, addressUniswapV2Pair, 86400, 1577836800, 3600, 0, 30, 0)
            .send({
                from: accounts[0],
                gas: gas
            });

        //Get markets
        let marketKey = await contractMarketFactory.methods.marketsKeys(0).call();
        let address = await contractMarketFactory.methods.markets(marketKey).call();
        let contractMarket = await new web3.eth.Contract(require("../build/contracts/Market.json").abi, address, {gas: gas});
        console.log("Contract Market at: " + contractMarket._address);

        //Timestamp
        console.log(await contractMarket.methods.clcFrameTimestamp(1677836800).call())
        let z = await contractMarket.methods.clcFrameTimestamp(0).send({from: accounts[0]});
        let r = 0;

    } catch (e) {
        console.log(e);

    }
})
