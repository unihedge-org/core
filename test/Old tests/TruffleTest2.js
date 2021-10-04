//This test uses contracts deployed on Rinkeby test network           |
//                                                                    |
//$ ganache-cli --fork https://rinkeby.infura.io/v3/<API key>         |
//$ truffle test ./test/TruffleTest2.js                               |
//                                                                    |
//Market contract is modified due to inconsistent                     |
//values from uniswao oracle on testnet                               |
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
const consola = require('consola');
const BigN = require("bignumber.js");

//Contracts
const contractMarketFactory = artifacts.require("./MarketFactory_2.sol");
const contractMarket = artifacts.require("./Market_2.sol");
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
let addressMarketFactory = "0xf63ecBC45737E9087751CA5d3C98A0359Ee71226";




const startTimestamp = Date.now() / 1000 | 0;
consola.info("Current timestamp: " + startTimestamp + " s");
var FrameNextKey;


//----------------------------------------------------------------------
const n=3; //Num of wagers to place
const initTimestamp = startTimestamp;
const period = 24; //in hours
const settlementInterval = 6;
const minHorizon=0;
const maxHorizon=30;
const marketFee = 100; // %/1000
const hoursToSkip = 26; //How many hours to skip after placig wagers
const bet = new BN('1000e18');
//----------------------------------------------------------------------

//TODO: add assert,expect... statements to each test block

contract("UniHedge", async accounts => {

    describe("Testing functionality of Unihedge protocol", function() {
        before(async function() {
            //Deploy market factory
            //this.MarketFactory = await contractMarketFactory.new(addressUniswapV2Factory);
            //Import deployed contracts
            this.MarketFactory = await contractMarketFactory.at(addressMarketFactory);
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
            let periodInSec = period * 3600;
            let settlementIntInSec = settlementInterval * 3600;
            let count1 = await this.MarketFactory.getMarketsCount();
            console.log(count1.toString())
            await this.MarketFactory.addMarket(this.DAIcoin.address, addressUniswapV2Pair, periodInSec, initTimestamp, settlementIntInSec, minHorizon, maxHorizon, marketFee, {from: accounts[0]});
            //assert.equal(, 1); 
            let count2 = await this.MarketFactory.getMarketsCount();
            console.log(count2.toString())
        });
        it('Approve market to spend tokens', async function() {
            var marketKey = await this.MarketFactory.marketsKeys(1);
            var address = await this.MarketFactory.markets(marketKey);
            this.market = await contractMarket.at(address);
            for (let i = 0; i < n; i++) {
                await this.DAIcoin.approve(this.market.address, new BN('0'), {from: accounts[i]});
                await this.DAIcoin.approve(this.market.address, bet, {from: accounts[i]});
            }
        });
        it('Place '+ n + ' wagers', async function() {
            //We add 25h to current timestamp and calculate FrameTimestamp
            FrameNextKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+90000);
            /*consola.log(FrameNextKey.toString());
            consola.log(FrameNextKey-initTimestamp);
            consola.log(period); */
             for (let i = 0; i < n; i++) { 
                let maxP = new BigN('13211698376');
                let minP = new BigN('10211298376'); 
                let tx = await this.market.placeWager(FrameNextKey, minP, maxP.minus(i*(new BigN('100000'))), {from: accounts[i]});
             }
             let b = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
             consola.log(colors.green("Balance of market is: " + b));

             let frame = await this.market.frames(FrameNextKey);
             console.log("Frame range acc amount is: " + frame.accAmount)

        });
        describe("Skip "+ hoursToSkip + " hours and report prices at different time intervals", function() {
            it('should update frame prices every 30 min', async function() {

                let tts = hoursToSkip/0.5 | 0;
                consola.log(tts);

                let periodInSec = period * 3600;
                await functions.advanceTimeAndBlock(periodInSec);

                for(let i=0;i<tts;i++){
                    let blockNum = await web3.eth.getBlockNumber();
                    let blockInfo = await web3.eth.getBlock(blockNum);
                    consola.log(colors.blue("Block number: "+blockNum+" timestamp: "+blockInfo.timestamp));

                    //--------------------------------------------------------------
                    await functions.advanceTimeAndBlock(1800); //Advance by 0,5h each run (1800sec)
                    //--------------------------------------------------------------

                    let b2 = await web3.eth.getBlockNumber();
                    let t2 = await web3.eth.getBlock(b2);
                    consola.log(colors.red("Skip time is : " + parseFloat((t2.timestamp - blockInfo.timestamp) / 3600).toFixed(2) + " hours"));
                    consola.log(colors.magenta("Block number: "+b2+" timestamp: " + t2.timestamp));
                    consola.log("End frame is: " + FrameNextKey);
                    newFrameKey = await this.market.clcFrameTimestamp(t2.timestamp);
                    consola.log("Current Frame is: " + newFrameKey)
                    /* if ( t2.timestamp <= ((newFrameKey+period)-settlementInterval)) {
                        consola.log(colors.bold("Is updating start prices").bgRed);
                        consola.log(((newFrameKey+period)-settlementInterval))
                    }
                    else if ( t2.timestamp <= (newFrameKey+period)) {
                        consola.log(colors.bold("Is in settlement period").bgRed);
                    }
                    else {
                        consola.log(colors.bold("Different frame").bgRed);
                    } */
                    
                    //consola.log(web3.utils.hexToNumber(await this.market.clcFrameTimestamp(t2.timestamp)));
                    //--------------------------------------------------------------
                    //await this.UniswapV2Router02.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[0], initTimestamp*3600*240, {from: accounts[5], value: new BN('10e18')});
                    
                    let startPirceAccu = new BigN('351376658422403395211142728202634126243');

                    let priceAccu = startPirceAccu.plus(new BigN('10000000')).multipliedBy(i+1);

                    await this.market.updateFramePrices(priceAccu, {from: accounts[0]});

                    let frame = await this.market.frames(FrameNextKey);
                    
                    consola.log(colors.cyan("Start frame price is: " + frame.oraclePrice0CumulativeStart));
                    consola.log(colors.cyan("End frame price is: " + frame.oraclePrice0CumulativeEnd));
                    consola.log("Difference is: " + (frame.oraclePrice0CumulativeEnd - frame.oraclePrice0CumulativeStart));
                    consola.log(colors.cyan("Start frame timestamp is: " + frame.oracleTimestampStart));
                    consola.log(colors.cyan("End frame timestamp is: " + frame.oracleTimestampEnd));
                    consola.log("Difference is: " + (frame.oracleTimestampEnd - frame.oracleTimestampStart));
                    /* let averagePrice = new BigN(frame.oraclePrice0CumulativeEnd - frame.oraclePrice0CumulativeStart)/(frame.oracleTimestampEnd - frame.oracleTimestampStart);
                    consola.log(colors.underline("Average price is: " + averagePrice.toFixed() + "\n")); */
                }
                });
            describe("Close frame", function() {
                it('should close frame', async function() {
                    await this.market.closeFrame(FrameNextKey, {from: accounts[0]});
                    let frame = await this.market.frames(FrameNextKey);
                    consola.log("Average price is: " + frame.priceAverage)
                    assert.equal(frame.state, 2);
                });
                it('should not close frame more than once', async function() {
                    await expectRevert(
                        this.market.closeFrame(FrameNextKey, {from: accounts[0]}),
                        "FRAME NOT OPENED"
                    );
                });
                describe("Resolve wager", function() {
                    it('Should resolve all ' +n+ ' wagers', async function() {
                        let wagerKeys = [];
                        let wagerCount = parseInt(await this.market.getWagersCount());
                        //consola.log(wagerCount);
                        for (let i = 0; i < wagerCount; i++) {
                            wagerKeys.push(i);
                        }
                        //consola.log(wagerKeys);
            
            
                        for (let i = 0; i < wagerCount; i++) {
/*                             //Check shares
                            let shareAmount = await this.market.clcShareAmount(wagerKeys[i]);
                            consola.log("Wager " + wagerKeys[i] + " share amount = " + parseFloat(shareAmount) / scalar);
                            let shareHorizon = await this.market.clcShareHorizon(wagerKeys[i]);
                            consola.log("Wager " + wagerKeys[i] + " share horizon = " + parseFloat(shareHorizon) / scalar);
                            let shareRange = await this.market.clcShareRange(wagerKeys[i]);
                            consola.log("Wager " + wagerKeys[i] + " share range = " + parseFloat(shareRange) / scalar);
                            //Total share
                            let share = await this.market.clcShare(wagerKeys[i]);
                            consola.log("Wager " + wagerKeys[i]  + " total share = " + parseFloat(share) / scalar);
                            //Total amount
                            let payoutAmount = await this.market.clcSettleAmount(wagerKeys[i]);
                            consola.log("Wager " + wagerKeys[i]  + " payout = " + web3.utils.toBN(payoutAmount).toString()); */
                            //Settle wager
                            //Get amount of tokens before
                            let frame = await this.market.frames(FrameNextKey);
                            consola.log("Frame average price is: " + frame.priceAverage.toString() );

    
                            let wager = await this.market.wagers(wagerKeys[i]);
                            consola.log("User wagered between prices "+ wager.priceMin.toString() +" and " + wager.priceMax.toString() );
                            consola.log("framekey: " + wager.frameKey)
                            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[i]));
                            let mb1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            consola.log(colors.green("Balance of market is: " + mb1));
                            consola.log(colors.yellow("Balance of user is: " + b1));
                            let tx = await this.market.settleWager(wagerKeys[i], {from: accounts[i]});
                            //consola.log(tx);
                            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[i]));
                            consola.log(colors.yellow("Balance of user is: " + b2.toString()));
                            consola.log(colors.yellow("Difference is: " + (b2.sub(b1)).toString()));
                            let mb2 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            consola.log(colors.green("Balance of market is: " + mb2));

                            let wagers = await this.market.wagers(0);
                            consola.log(wagers.state.toString() + "\n");
                        

                            assert.equal(wagers.state.toString(), '2');
                            }
                    });
            
                    it('shouldnt allow to settle wager more than once', async function() {
                    let wagerKeys = [];
                    let wagerCount = parseInt(await this.market.getWagersCount());
                    for (let i = 0; i < wagerCount; i++) {
                        wagerKeys.push(i);
                    }
                    //consola.log(wagerKeys);
                    await expectRevert(
                        this.market.settleWager(wagerKeys[1], {from: accounts[1]}),
                        "WAGER ALREADY SETTLED OR NON EXISTING"
                    );
                    });
                    //TODO: convertaj v ETH te številke!!!
                    describe("Check fees", function() {
                        it('Correct amount of market fees is colected.', async function() {
                            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            consola.log(colors.yellow("Balance of market is: " + b1));
                            await this.market.withdrawFeesMarket({from: accounts[0]});
                            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            consola.log(colors.yellow("Balance of market is: " + b2.toString()));
                            consola.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));
                            let finalFee = 0;
                            for (i=0; i < n; i++) {
                                finalFee = finalFee + (bet*(marketFee/100000) | 0);
                            }
                            
                            consola.log(colors.green("Final fee is: " + finalFee));
                            assert.equal((b1.sub(b2)).toString(), finalFee.toString());
                        });
                        
                        it('Collect protocol fees', async function() {
                            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            consola.log(colors.yellow("Balance of market is: " + b1));
                            await this.market.withdrawFeesProtocol({from: accounts[0]});
                            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
                            consola.log(colors.yellow("Balance of market is: " + b2.toString()));
                            consola.log(colors.yellow("Difference is: " + (b1.sub(b2)).toString()));
                            let finalFee = 0;
                            for (i=0; i < n; i++) {
                                finalFee = finalFee + (bet*(100/100000) | 0);
                            }
                            consola.log(colors.green("Final fee is: " + finalFee));
                            assert.equal((b1.sub(b2)).toString(), finalFee.toString());
                        });
                    });
                });
            });
        });
    });





});
});