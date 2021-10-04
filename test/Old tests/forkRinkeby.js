const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));

const axios = require("axios");

web3.eth.handleRevert = true;
const gas = 25000000;
const colors = require('colors');
const BN=require('bignumber.js');


let addressUniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";
let addressTokenDAI = "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735";
let addressTokenWETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
let addressUniswapV2Router02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

let scalar = 1e24;

let tx;
let n = 3;
let startTimestamp= 1606780800;


web3.eth.getAccounts().then(async accounts => {
    try {
        await minerSetTimestamp(startTimestamp-3600);

        //Load DAI token contract
        let contractDAI = await new web3.eth.Contract(require("../node_modules/@openzeppelin/contracts/build/contracts/ERC20.json").abi, addressTokenDAI, {gas: gas});

        //Load WETH token contract
        //let contractWETH = await new web3.eth.Contract(require("../node_modules/canonical-weth/build/contracts/WETH9.json").abi, addressTokenWETH, {gas: gas});

        //Load UniswapV2Factory contract instance
        let contractUniswapV2Factory = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-core/build/UniswapV2Factory.json").abi, addressUniswapV2Factory, {gas: gas});
        console.log("Contract UniswapV2Factory loaded from chain at address " + addressUniswapV2Factory);

        //Load UniswapV2Pair contract instance
        let contractUniswapV2Pair = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-core/build/UniswapV2Pair.json").abi, addressUniswapV2Pair, {gas: gas});
        console.log("Contract UniswapV2Pair WETH/DAI loaded from chain at address " + addressUniswapV2Pair);

        //Load UniswapV2Router02 instance
        let contractUniswapV2Router02 = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json").abi, addressUniswapV2Router02, {gas: gas});
        console.log("Contract UniswapV2Router02 loaded from the chain at address " + addressUniswapV2Router02);

        //Swap ETH to DAI tokens
        for (let i = 0; i < n; i++) {
            await contractUniswapV2Router02.methods.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[i], parseInt(+new Date() / 1000) + 3600 * 24).send({
                from: accounts[i],
                value: 1e18
            });
            let amount = parseFloat(await contractDAI.methods.balanceOf(accounts[i]).call());
            console.log("Swap ETH: " + 1 + " for DAI: " + amount + " account: " + accounts[i]);
        }

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
        console.log("Contract MarketFactory loaded from chain at address " + contractMarketFactory._address);

        //Get markets
        let markets = await getMarkets(contractMarketFactory)

        //Deploy Market contract
        await contractMarketFactory.methods.addMarket(addressTokenDAI, addressUniswapV2Pair, 86400, 1577836800, 3600, 0, 30, 0)
            .send({
                from: accounts[0],
                gas: gas
            });


        //Get markets
        let contractMarket = (await getMarkets(contractMarketFactory))[0]
        console.log("Contract Market at: " + contractMarket._address);

        //Approve market contract to spend tokens
        for (let i = 0; i < n; i++) {
            try {
                //Safety set first to 0
                let tx = await contractDAI.methods.approve(contractMarket._address, 0).send({from: accounts[i]});
                tx = await contractDAI.methods.approve(contractMarket._address, web3.utils.toBN(100e18)).send({from: accounts[i]});
                //Check allowance
                console.log("Allow to spend :" + await contractDAI.methods.allowance(accounts[i], contractMarket._address).call());
            } catch (e) {
                console.log(e.reason.red);
            }

        }

        //Place wagers
        let frameNextKey = await contractMarket.methods.clcFrameTimestamp(startTimestamp+3600).call();
        for (let i = 0; i < n; i++) {
            tx = await contractMarket.methods.placeWager(frameNextKey, 75 - i * 25, 125 + i * 25).send({from: accounts[i]});
            // console.log(tx);
        }

        let wagers = await getWagersKeys(contractMarket, frameNextKey);
        for (let wager of wagers) {
            let w = await contractMarket.methods.wagers(wager).call();
            console.log((
                "Wager: placed at: " + new Date(parseInt(w.timestamp) * 1000).toISOString() +
                " frame datetime:" +new Date(parseInt(w.frameKey)*1000).toISOString()+
                " with amountPlaced: " + w.amountPlaced
            ).green);
        }

        //Check balance of tokens on contract
        let balance = parseFloat(await contractDAI.methods.balanceOf(contractMarket._address).call());
        console.log(colors.yellow("Balance market: " + balance));

        //Mine and report prices
        for(let i=0;i<50;i++){
            await minerSkipToTimestamp(startTimestamp+1800*i);
            //Buy fake DAI so the price changes
            await contractUniswapV2Router02.methods.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[0], startTimestamp + 3600 * 240).send({
                from: accounts[0],
                value: 1e8
            });
            await contractMarket.methods.updateFramePrices().send({from: accounts[0]});
        }

        //Close frame
        tx = await contractMarket.methods.closeFrame(frameNextKey).send({from: accounts[0]});

        //Check frame status
        let frame = await contractMarket.methods.frames(frameNextKey).call();

        console.log("Price cumulative start: "+frame.oraclePrice0CumulativeStart);
        console.log("Timestamp cumulative start: "+frame.oracleTimestampStart);
        console.log("Price cumulative end: "+frame.oraclePrice0CumulativeEnd);
        console.log("Timestamp cumulative start: "+frame.oracleTimestampEnd);
        //console.log("Average price: "+decodeUQ112x112(frame.priceAverage));
        //console.log("Average price: "+decodeUQ112x112(frame.priceAverage));
        console.log("Average price2 : "+(parseFloat(frame.priceAverage)/1e24).toFixed(24));
        let r= await contractUniswapV2Pair.methods.getReserves().call();
        console.log("spot price: "+(new BN(r[1])).dividedBy(new BN(r[0])).toFixed())

        if (frame.state === "2") {
            console.log("Frame " + frameNextKey + " in state CLOSED");
        } else {
            console.log(colors.red("Frame " + frameNextKey + " in wrong state " + frame.state));
        }


        //Settle wager
        let wagersKeys = await getWagersKeys(markets[0], frameNextKey);
        let i = 0;
        for (const key of wagersKeys) {
            //Check shares
            let shareAmount = await markets[0].methods.clcShareAmount(key).call();
            console.log("Wager " + key + " share amount = " + parseFloat(shareAmount) / scalar);
            let shareHorizon = await markets[0].methods.clcShareHorizon(key).call();
            console.log("Wager " + key + " share horizon = " + parseFloat(shareHorizon) / scalar);
            let shareRange = await markets[0].methods.clcShareRange(key).call();
            console.log("Wager " + key + " share range = " + parseFloat(shareRange) / scalar);
            //Total share
            let share = await markets[0].methods.clcShare(key).call();
            console.log("Wager " + key + " total share = " + parseFloat(share) / scalar);
            //Total amount
            let payoutAmount = await markets[0].methods.clcSettleAmount(key).call();
            console.log("Wager " + key + " payout = " + web3.utils.toBN(payoutAmount).toString());
            //Settle wager
            //Get amount of tokens before
            let wager = await markets[0].methods.wagers(key).call();
            let b1 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
            console.log(colors.yellow("Balance of market is: " + b1));
            tx = await markets[0].methods.settleWager(key).send({from: accounts[i]});
            let b2 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
            console.log(colors.yellow("Balance of market is: " + b2.toString()));
            console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));
        }

        //Collect market fees
        console.log("MARKET FEES");
        let b1 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
        console.log(colors.yellow("Balance of market is: " + b1));
        await markets[0].methods.withdrawFeesMarket().send({from: accounts[0]});
        let b2 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
        console.log(colors.yellow("Balance of market is: " + b2.toString()));
        console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));

        //Collect protocol fees
        console.log("PROTOCOL FEES");
        b1 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
        console.log(colors.yellow("Balance of market is: " + b1));
        await markets[0].methods.withdrawFeesProtocol().send({from: accounts[0]});
        b2 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
        console.log(colors.yellow("Balance of market is: " + b2.toString()));
        console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));
    }catch (e) {
        console.log(e.message.red);
    }
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

async function mineBlocks(number, accounts) {
    let b = await web3.eth.getBlockNumber();
    //Mine blocks until end of frame
    console.log(colors.blue("Mining dummy blocks starting at: " + b));
    console.log(colors.blue("Mining " + number + " blocks"));
    for (let i = 0; i < number; i++) {
        await web3.eth.sendTransaction({from: accounts[1], to: accounts[2], value: 1});
    }
    console.log(colors.blue("Current block: " + await web3.eth.getBlockNumber()));

}

async function minerSkipToTimestamp(timestamp) {
    return new Promise(async (resolve, reject) => {
        let b = await web3.eth.getBlockNumber();
        let t1 = await web3.eth.getBlock(b);
        // console.log(("Mining: Current block number: "+b+" date: "+new Date(parseInt(t.timestamp)*1000).toLocaleString()).bgMagenta);
        axios.post("http://localhost:7545", {
            jsonrpc: '2.0',
            id: 1337,
            method: 'evm_mine',
            params: [timestamp]
        })
            .then(async value => {
                let b = await web3.eth.getBlockNumber();
                let t2 = await web3.eth.getBlock(b);
                console.log(("Mining: SKIP TIME: " + (t2.timestamp - t1.timestamp) / 3600 + " hours").bgMagenta);
                console.log(("Block number: "+b+" date: "+new Date(t2.timestamp*1000).toUTCString()).magenta);
                resolve(value);
            }).catch(reason => {
            reject(reason);
        })
    })
}

async function minerSetTimestamp(timestamp) {
    return new Promise(async (resolve, reject) => {
        axios.post("http://localhost:7545", {
            jsonrpc: '2.0',
            id: 1337,
            method: 'evm_mine',
            params: [timestamp]
        })
            .then(async value => {
                let b = await web3.eth.getBlockNumber();
                let t = await web3.eth.getBlock(b);
                console.log(("Mining RESET: Current block number: " + b + " date: " + new Date(parseInt(t.timestamp) * 1000).toUTCString()).bgMagenta);
                resolve(value);
            }).catch(reason => {
            reject(reason);
        })
    })
}

async function getWagersKeys(market, frameKey) {
    let n = [];
    //Get all wagers
    let wagerCount = parseInt(await market.methods.getWagersCount().call());
    for (let i = 0; i < wagerCount; i++) {
        let w = await market.methods.wagers(i).call();
        if (w.frameKey === frameKey) n.push(i);
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

function decodeUQ112x112(number){
    let x=BigInt(number);
    return (x>>112n).toString()+"."+(x<<112n).toString();
}
