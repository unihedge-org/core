const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));
web3.eth.handleRevert=true;

const colors = require('colors');

let addressUniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";

let scalar = 1e24;

let tx;

web3.eth.getAccounts().then(async accounts => {
    //Load ERC20 token contract
    let addressToken = require("../test/contracts.json")["Token"];
    let contractERC20 = await new web3.eth.Contract(require("../build/contracts/Token.json").abi, addressToken, {gas: 2500000});
    console.log("Contract ERC20 deployed from chain at address " + addressToken);
    //Transfer 1000 tokens to all addresses
    for (let account of accounts) {
        //Burn previous existing tokens
        await contractERC20.methods.burn(account).send({from: account});
        let tx = await contractERC20.methods.loadMore().send({from: account});
        console.log("Token at: " + account + " BalanceOf: " + await contractERC20.methods.balanceOf(account).call());
    }

    //Load UniswapV2Factory contract instance
    let contractUniswapV2Factory = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-core/build/UniswapV2Factory.json").abi, addressUniswapV2Factory, {gas: 2500000});
    console.log("Contract UniswapV2Factory loaded from chain at address " + addressUniswapV2Factory);

    //Load UniswapV2Pair contract instance
    let contractUniswapV2Pair = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-core/build/UniswapV2Pair.json").abi, addressUniswapV2Pair, {gas: 2500000});
    console.log("Contract UniswapV2Pair WETH/DAI loaded from chain at address " + addressUniswapV2Pair);

    //Load MarketFactory contract
    let addressMarketFactory = require("../test/contracts.json")["MarketFactory"];
    let contractMarketFactory = await new web3.eth.Contract(require("../build/contracts/MarketFactory.json").abi, addressMarketFactory, {gas: 6721975});
    console.log("Contract MarketFactory loaded from chain at address " + addressMarketFactory);

    //Get markets
    let markets = await getMarkets(contractMarketFactory)

    //Deploy Market contract if there is no market
    let period = 20;
    let settlePeriod = 2;
    if (markets.length <= 0) {
        try {
            await contractMarketFactory.methods.addMarket(addressToken, addressUniswapV2Pair, period, 0, 100)
                .send({from: accounts[0]});
        } catch (e) {
            console.log(colors.red("Error Market: " + e.message));
        }
    }
    //Get markets
    markets = await getMarkets(contractMarketFactory)
    markets.forEach(market => {
        console.log("Contract Market at: " + market._address);
    })

    //Burn all tokens on the market contract
    await contractERC20.methods.burn(markets[0]._address).send({from: accounts[0]});
    let b = parseInt(await contractERC20.methods.balanceOf(markets[0]._address).call());
    console.log(colors.green("Balance of MarketContract: " + b));


    let n = 3;
    //Approve market contract to spend tokens
    for (let i = 0; i < n; i++) {
        //Safety set first to 0
        try {
            let tx = await contractERC20.methods.approve(markets[0]._address, 0).send({from: accounts[i]});
            tx = await contractERC20.methods.approve(markets[0]._address, web3.utils.toBN(100e18)).send({from: accounts[i]});
            //Check allowance
            console.log("Allow to spend :" + await contractERC20.methods.allowance(accounts[i], markets[0]._address).call());
        }catch (e) {
            console.log(e.reason.red);
        }

    }

    //Place wagers
    try {
        let block = await web3.eth.getBlockNumber();
        let frameNextKey = await markets[0].methods.clcFrameBlockStart(block+period+5).call();
        tx = await markets[0].methods.placeWager(frameNextKey, 75, 125).send({from: accounts[0]});
         console.log(tx);
        tx = await markets[0].methods.placeWager(frameNextKey, 50, 150).send({from: accounts[1]});
        // console.log(tx);
        tx = await markets[0].methods.placeWager(frameNextKey, 25, 175).send({from: accounts[2]});
        // console.log(tx);



    let wagers = await getWagersKeys(markets[0], frameNextKey);
    for (let wager of wagers) {
        let w = await markets[0].methods.wagers(wager).call();
        console.log("Wager horizon: " + (w.frameKey - w.block) + " placed at: " + w.block + " for frame:"+w.frameKey+" with amountPlaced: " + w.amountPlaced);
    }
    }catch (e) {
        console.log(e);
    }

    //Check balance of tokens on contract
    let balance = parseFloat(await contractERC20.methods.balanceOf(markets[0]._address).call());
    console.log(colors.yellow("Balance market: " + balance));

    // Mine blocks to close frame
    await mineBlocks(frameNextKey-parseInt(await web3.eth.getBlockNumber())+period, accounts);

    //Close frame
    tx = await markets[0].methods.closeFrame(frameNextKey).send({from: accounts[0]});

    //Check frame status
    let frame = await markets[0].methods.frames(frameNextKey).call();
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
    await markets[0].methods.withdrawFeesMarket().send({from:accounts[0]});
    let b2 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
    console.log(colors.yellow("Balance of market is: " + b2.toString()));
    console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));

    //Collect protocol fees
    console.log("PROTOCOL FEES");
    b1 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
    console.log(colors.yellow("Balance of market is: " + b1));
    await markets[0].methods.withdrawFeesProtocol().send({from:accounts[0]});
    b2 = web3.utils.toBN(await contractERC20.methods.balanceOf(markets[0]._address).call());
    console.log(colors.yellow("Balance of market is: " + b2.toString()));
    console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));

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
