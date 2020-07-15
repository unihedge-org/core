const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));

const colors = require('colors');

let addressUniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";

let scalar = 1000000000000000000;

web3.eth.getAccounts().then(async accounts => {
    //Load UniswapV2Factory contract instance
    let contractUniswapV2Factory = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-core/build/UniswapV2Factory.json").abi, addressUniswapV2Factory, {gas: 2500000});
    console.log("Contract UniswapV2Factory loaded from chain at address " + addressUniswapV2Factory);

    //Load UniswapV2Pair contract instance
    let contractUniswapV2Pair = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-core/build/UniswapV2Pair.json").abi, addressUniswapV2Pair, {gas: 2500000});
    console.log("Contract UniswapV2Pair WETH/DAI loaded from chain at address " + addressUniswapV2Pair);

    //Load MarketFactory contract
    let addressMarketFactory = require("../test/contracts.json")["MarketFactory"];
    let contractMarketFactory = await new web3.eth.Contract(require("../build/contracts/MarketFactory.json").abi, addressMarketFactory, {gas: 2500000});
    console.log("Contract MarketFactory loaded from chain at address " + addressMarketFactory);

    //Get markets
    let markets = await getMarkets(contractMarketFactory)

    //Deploy Market contract if there is no market
    let period = 10;
    let settlePeriod = 2;
    if (markets.length <= 0) {
        try {
            await contractMarketFactory.methods.addMarket(addressUniswapV2Pair, period, settlePeriod, 0, 100)
                .send({from: accounts[0]});
        } catch (e) {
            console.log(colors.red("Error Market: " + e.message));
        }
    }
    //Get markets
    markets = await getMarkets(contractMarketFactory)
    markets.forEach(market => {
        console.log("Market at: " + market._address);
    })

    //Get next frame
    let frameNextKey = await clcNextFrameKey(markets[0], period);
    let frameNext = await markets[0].methods.frames(frameNextKey).call();
    if (frameNext.state === "0") {
        //Add next frame
        await markets[0].methods.newFrame(frameNextKey).send({from: accounts[0]});
        console.log("Frame added: " + frameNextKey);
    } else {
        console.log("Frame next exist: " + frameNextKey);
    }

    //Place 3 wagers in current frame if there is none
    let w = await getWagers(markets[0], frameNextKey);
    if (w.length == 0) {
        let tx = await markets[0].methods.placeWager(frameNextKey, 75, 125).send({from: accounts[0], value: 10000});
        tx = await markets[0].methods.placeWager(frameNextKey, 50, 150).send({from: accounts[0], value: 10000});
        tx = await markets[0].methods.placeWager(frameNextKey, 25, 175).send({from: accounts[0], value: 10000});
        let wagers = await getWagers(markets[0], frameNextKey);
        wagers.forEach(wager => {
            console.log("New wager placed: " + wager.frameKey + " horizon: " + (frameNextKey - parseInt(wager.block)));
            console.log("Fee market: " + wager.amountFeeMarket + " Fee protocol " +wager.amountFeeProtocol);
        })
    } else {
        let wagers = await getWagers(markets[0], frameNextKey);
        wagers.forEach(wager => {
            console.log("Wager placed: " + wager.frameKey + " horizon: " + (frameNextKey - parseInt(wager.block)));
        })
    }



    // Mine blocks to close frame
    await mineBlocks(frameNextKey + period + 1, accounts);

    //Close frame
    let tx = await markets[0].methods.closeFrame(frameNextKey).send({from: accounts[0]});

    //Check frame status
    let frame = await markets[0].methods.frames(frameNextKey).call();
    if (frame.state === "2") {
        console.log("Frame " + frameNextKey + " in state CLOSED");
    } else {
        console.log(colors.red("Frame " + frameNextKey + " in wrong state " + frame.state));
    }


    //Settle wager
    let wagersKeys = await getWagersKeys(markets[0], frameNextKey);
    for (const key of wagersKeys) {
        //Check shares
        let shareAmount = await markets[0].methods.clcShareAmount(key).call();
        console.log("Wager "+key+" share amount = " + parseFloat(shareAmount) / scalar);
        let shareHorizon = await markets[0].methods.clcShareHorizon(key).call();
        console.log("Wager "+key+" share horizon = " + parseFloat(shareHorizon) / scalar);
        let shareRange = await markets[0].methods.clcShareRange(key).call();
        console.log("Wager "+key+" share range = " + parseFloat(shareRange) / scalar);
        //Total share
        let share = await markets[0].methods.clcShare(key).call();
        console.log("Wager "+key+" total share = " + parseFloat(share) / scalar);
        //Total amount
        let payoutAmount = await markets[0].methods.clcSettleAmount(key).call();
        console.log("Wager "+key+" payout = " + parseFloat(payoutAmount));
        //Settle wager
        tx = await markets[0].methods.settleWager(key).send({from: accounts[0]});
        // console.log("Wager "+key+" payout = " + payout);
    }


    // let share = await markets[0].methods.clcShare(wagersKeys).call();
    //
    // tx = await markets[0].methods.settleWager(wagersKeys[0]).send({from: accounts[0]});
    // console.log("Wager settled :" + wagersKeys[0]);
    // //Get wager
    // let wager = await markets[0].methods.wagers(wagersKeys[0]).call();
    // console.log("Wager " + wagersKeys[0] + " state is: " + wager.state);
    // let t = 0;


})


async function getMarkets(marketFactory) {
    let count = await marketFactory.methods.getMarketsCount().call();
    let markets = [];
    for (let i = 0; i < count; i++) {
        let marketKey = await marketFactory.methods.marketsKeys(i).call();
        //Get market contract address
        let address = await marketFactory.methods.markets(marketKey).call();
        markets.push(await new web3.eth.Contract(require("../build/contracts/Market.json").abi, address, {gas: 2500000}));
    }
    return markets;
}

async function mineBlocks(height, accounts) {
    let b = await web3.eth.getBlockNumber();
    //Mine blocks until end of frame
    console.log(colors.blue("Mining dummy blocks starting at: " + b));
    let n = height - b;
    console.log(colors.blue("Mining " + n + " blocks"));
    for (let i = 0; i < n; i++) {
        await web3.eth.sendTransaction({from: accounts[1], to: accounts[2], value: 1});
    }
    console.log(colors.blue("Current block: " + await web3.eth.getBlockNumber()));

}

async function getWagersKeys(market, frameKey) {
    let n = [];
    //Get all wagers
    let wagerCount = parseInt(await market.methods.getWagersCount().call());
    for (let i = 0; i < wagerCount; i++) {
        let w = await market.methods.wagers(i).call();
        if (parseInt(w.frameKey) === frameKey) n.push(i);
    }
    return n;
}

async function getWagers(market, frameKey) {
    let keys = await getWagersKeys(market, frameKey);
    //Get all wagers
    let wagers = [];
    for (let i = 0; i < keys.length; i++) {
        let w = await market.methods.wagers(keys[i]).call();
        wagers.push(w);
    }
    return wagers;
}

async function clcCurrentFrameKey(market, period) {
    return parseInt(await market.methods.clcFrameBlockStart(await web3.eth.getBlockNumber()).call());

}

async function clcNextFrameKey(market, period) {
    return parseInt(await market.methods.clcFrameBlockStart(await web3.eth.getBlockNumber()).call()) + period;

}
