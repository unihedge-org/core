//This test uses contracts deployed on Rinkeby test network           |
//                                                                    |
//$ ganache-cli --fork https://rinkeby.infura.io/v3/<API key>         |
//$ truffle test ./test/TruffleTest2.js                               |
//                                                                    |
//--------------------------------------------------------------------|


const functions = require("./functions.js");

const {
    BN,
    constants,
    shouldFail,
    expectRevert
} = require('@openzeppelin/test-helpers');

const { assert } = require('chai');
const colors = require('colors');
const BigNumber = require('bignumber.js');


//Contracts
const contractMarketFactory = artifacts.require("./MarketFactory.sol");
const contractMarket = artifacts.require("./Market.sol");
const contractToken = artifacts.require("./node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol");
const contractUniswapV2Factory = artifacts.require("../node_modules/@uniswap/v2-core/contracts/UniswapV2Factory.sol");
const conatractUniswapV2Pair = artifacts.require("./node_modules/@uniswap/v2-core/contracts/UniswapV2Pair.sol");
const contractUniswapV2Router02 = artifacts.require("./node_modules/@uniswap/v2-periphery/contracts/UniswapV2Router02");

//Rinkeby contract addresses
let addressUniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";
let addressTokenDAI = "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735";
let addressTokenWETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
let addressUniswapV2Router02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";


const startTimestamp = Date.now() / 1000 | 0;
console.log(startTimestamp);
var FrameNextKey;

const scalar = 1e24;
const n=3;

const initTimestamp = startTimestamp;
const period = 86400;
const settlementInterval = 3600*12;
const minHorizon=0;
const maxHorizon=30;
const marketFee = 10; //in %
const hoursToSkip = 26; //How many hours to skip after placig wagers
const bet = '1000e18';


contract("UniHedge", async accounts => {

    describe("Testing functionality of Unihedge protocol", function() {
        before(async function() {
            //Deploy market factory
            this.MarketFactory = await contractMarketFactory.new(addressUniswapV2Factory);
            //Import deployed contracts
            this.DAIcoin = await contractToken.at(addressTokenDAI);
            this.UniswapV2Factory = await contractUniswapV2Factory.at(addressUniswapV2Factory);
            this.UniswapV2Pair = await conatractUniswapV2Pair.at(addressUniswapV2Pair);
            this.UniswapV2Router02 = await contractUniswapV2Router02.at(addressUniswapV2Router02);
            //Swap ETH for DAI on 'n' accounts
            for (let i = 0; i < n; i++) {
                await this.UniswapV2Router02.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[i], parseInt(+new Date() / 1000) + 3600 * 24, {from: accounts[i], value: new BN('1e18')});
            }
        });
    describe("Deploy a new market and place wagers", function() {
        it('Deploy a new market', async function() {
            await this.MarketFactory.addMarket(this.DAIcoin.address, addressUniswapV2Pair, period, initTimestamp, settlementInterval, minHorizon, maxHorizon, marketFee, {from: accounts[0]});
        });
        it('Approve market to spend tokens', async function() {
            var marketKey = await this.MarketFactory.marketsKeys(0);
            var address = await this.MarketFactory.markets(marketKey);
            this.market = await contractMarket.at(address);
            for (let i = 0; i < n; i++) {
                await this.DAIcoin.approve(this.market.address, new BN('0'), {from: accounts[i]});
                await this.DAIcoin.approve(this.market.address, new BN(bet), {from: accounts[i]});
            }
            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
            console.log(colors.yellow("Balance of market is: " + b1));
        });
        it('Place '+ n + ' wagers', async function() {
            FrameNextKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+90000);
            //console.log(FrameNextKey);
             for (let i = 0; i < n; i++) {
                let tx = await this.market.placeWager(FrameNextKey, 75 - i * 25, 125 + i * 25, {from: accounts[i]});
             }
             let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
             console.log(colors.yellow("Balance of market is: " + b1));
        });
        describe("Skip time and report prices at different time intervals", function() {
            it('should update frame prices at different time intervals', async function() {

                let tts = hoursToSkip/0.5 | 0;
                console.log(tts);

                for(let i=0;i<tts;i++){
                    /*let blockNum = await web3.eth.getBlockNumber();
                    let blockInfo = await web3.eth.getBlock(blockNum);
                    console.log(("Block number: "+blockNum+" timestamp: "+blockInfo.timestamp).bgBlue);*/
                    //--------------------------------------------------------------
                    await functions.advanceTimeAndBlock(1800*i); //Advance by 0,5h each run (1800sec)
                    //--------------------------------------------------------------
                    /*let b2 = await web3.eth.getBlockNumber();
                    let t2 = await web3.eth.getBlock(b2);
                    console.log(("Mining: SKIP TIME: " + (t2.timestamp - blockInfo.timestamp) / 3600 + " hours").bgMagenta);
                    console.log(("Block number: "+b2+" timestamp: " + t2.timestamp).bgGreen);*/
                    //console.log(web3.utils.hexToNumber(await this.market.clcFrameTimestamp(t2.timestamp)));
                    //--------------------------------------------------------------
                    await this.UniswapV2Router02.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[0], initTimestamp*3600*240, {from: accounts[0], value: new BN('3e18')});
                    await this.market.updateFramePrices({from: accounts[0]});
                }
                });
            describe("Close frame", function() {
                it('should close frame', async function() {
                    await this.market.closeFrame(FrameNextKey, {from: accounts[0]});
                });
                it('should check if frame status is CLOSED', async function() {
                    let frame = await this.market.frames(FrameNextKey);
        
                    /*console.log("Price cumulative start: "+frame.oraclePrice0CumulativeStart);
                    console.log("Timestamp cumulative start: "+frame.oracleTimestampStart);
                    console.log("Price cumulative end: "+frame.oraclePrice0CumulativeEnd);
                    console.log("Timestamp cumulative end: "+frame.oracleTimestampEnd);
                    console.log("Average price : "+ frame.priceAverage);
                    let r= await this.UniswapV2Pair.getReserves();
                    let price = (new BN(r[1])) / (new BN(r[0]));
                    console.log("spot price: "+ price)*/
        
                    assert.equal(frame.state, 2);
                });
                it('should not close frame more than once', async function() {
                    await expectRevert(
                        this.market.closeFrame(FrameNextKey, {from: accounts[0]}),
                        "FRAME NOT OPENED"
                    );
                });
                describe("Settle wager", function() {
                    it('should settle wager', async function() {
                        let wagerKeys = [];
                        let wagerCount = parseInt(await this.market.getWagersCount());
                        //console.log(wagerCount);
                        for (let i = 0; i < wagerCount; i++) {
                            wagerKeys.push(i);
                        }
                        console.log(wagerKeys);
            
            
                        for (let i = 0; i < wagerCount; i++) {
                            //Check shares
                            let shareAmount = await this.market.clcShareAmount(wagerKeys[i]);
                            console.log("Wager " + wagerKeys[i] + " share amount = " + parseFloat(shareAmount) / scalar);
                            let shareHorizon = await this.market.clcShareHorizon(wagerKeys[i]);
                            console.log("Wager " + wagerKeys[i] + " share horizon = " + parseFloat(shareHorizon) / scalar);
                            let shareRange = await this.market.clcShareRange(wagerKeys[i]);
                            console.log("Wager " + wagerKeys[i] + " share range = " + parseFloat(shareRange) / scalar);
                            //Total share
                            let share = await this.market.clcShare(wagerKeys[i]);
                            console.log("Wager " + wagerKeys[i]  + " total share = " + parseFloat(share) / scalar);
                            //Total amount
                            let payoutAmount = await this.market.clcSettleAmount(wagerKeys[i]);
                            console.log("Wager " + wagerKeys[i]  + " payout = " + web3.utils.toBN(payoutAmount).toString());
                            //Settle wager
                            //Get amount of tokens before
                            let wager = await this.market.wagers(wagerKeys[i]);
                            console.log("framekey: " + wager.frameKey)
                            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[i]));
                            console.log(colors.yellow("Balance of user is: " + b1));
                            tx = await this.market.settleWager(wagerKeys[i], {from: accounts[i]});
                            //console.log(tx);
                            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[i]));
                            console.log(colors.yellow("Balance of user is: " + b2.toString()));
                            console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));
                            }
                    });
            
                    it('shouldnt allow to settle wager more than once', async function() {
                    let wagerKeys = [];
                    let wagerCount = parseInt(await this.market.getWagersCount());
                    for (let i = 0; i < wagerCount; i++) {
                        wagerKeys.push(i);
                    }
                    console.log(wagerKeys);
                    await expectRevert(
                        this.market.settleWager(wagerKeys[1], {from: accounts[1]}),
                        "WAGER ALREADY SETTLED OR NON EXISTING"
                    );
                    });
                    describe("Check fees", function() {
                        it('Market fee should equal ' + (1000*n*(10/100) | 0) + '.', async function() {
                            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            console.log(colors.yellow("Balance of market is: " + b1));
                            await this.market.withdrawFeesMarket({from: accounts[0]});
                            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            console.log(colors.yellow("Balance of market is: " + b2.toString()));
                            console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));
                            console.log(b1.sub(b2));
                            let finalFee= 1000*n*(10/100) | 0;
                            console.log(finalFee);
                            assert.equal(b1.sub(b2), finalFee);
                        });
                        it('Collect protocol fees', async function() {
                            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            console.log(colors.yellow("Balance of market is: " + b1));
                            await this.market.withdrawFeesProtocol({from: accounts[0]});
                            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            console.log(colors.yellow("Balance of market is: " + b2.toString()));
                            console.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));
                        });
                    });
                });
            });
        });
    });





});
});