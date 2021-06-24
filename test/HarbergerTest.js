//$ ganache-cli                                                       |
//$ truffle test ./test/HarbergerTest.js                               | 
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
const contractMarketFactory = artifacts.require("./MarketFactory_3.sol");
const contractMarket = artifacts.require("./Harberger_Market.sol");
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
var approveAmount;


//----------------------------------------------------------------------
const n=4; //Num of wagers to place
const initTimestamp = startTimestamp;
const period = 24; //in hours
const settlementInterval = 6;
const minHorizon=0;
const maxHorizon=30;
const marketFee = 100; // %/1000
const marketTax = 100;
const hoursToSkip = 27; 
const bet = new BN('1000e18');
const dPrice = 10000000;
                 
//----------------------------------------------------------------------

//TODO: add assert,expect... statements to each test parcel

contract("UniHedge_HarbergerVersion", async accounts => {

    describe("Testing functionality of Unihedge protocol", function() {
        before(async function() {
            //Deploy market factory
            this.MarketFactory = await contractMarketFactory.new(addressUniswapV2Factory);
            //Import deployed contracts
            //this.MarketFactory = await contractMarketFactory.at(addressMarketFactory);
            this.DAIcoin = await contractToken.at(addressTokenDAI);
            this.UniswapV2Factory = await contractUniswapV2Factory.at(addressUniswapV2Factory);
            this.UniswapV2Pair = await conatractUniswapV2Pair.at(addressUniswapV2Pair);
            this.UniswapV2Router02 = await contractUniswapV2Router02.at(addressUniswapV2Router02);
            //Swap ETH for DAI on 'n' accounts
            for (let i = 0; i < n; i++) {
                await this.UniswapV2Router02.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[i], parseInt(+new Date() / 1000) + 3600 * 60, {from: accounts[i], value: new BN('10e18')});
            }
        });
    describe("Deploy a new market and place wagers", function() {
        it('Deploy a new market', async function() {
            let periodInSec = period * 3600;
            let settlementIntInSec = settlementInterval * 3600;
            let count1 = await this.MarketFactory.getMarketsCount();
            //console.log(count1.toString())
            await this.MarketFactory.addMarket(this.DAIcoin.address, addressUniswapV2Pair, periodInSec, initTimestamp, marketTax, marketFee, dPrice, {from: accounts[0]});
            
            let count2 = await this.MarketFactory.getMarketsCount();

            var marketKey = await this.MarketFactory.marketsKeys(0);
            var address = await this.MarketFactory.markets(marketKey);
            this.market = await contractMarket.at(address);
            //console.log(count2.toString());
            assert.equal(count2-count1, 1); 
        });
        it('Get a frame', async function() {
            FrameNextKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+90000);
            console.log(FrameNextKey.toString());
        });
        it('Get parcel interval', async function() {
            let intervalPrice = await this.market.clcParcelInterval(3115378115);
            console.log(colors.bgGreen("Interval is " + intervalPrice.toString()));
        });
        it('Get num of frames left', async function() {
            FrameNextKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
            let frames = await this.market.clcFramesLeft(FrameNextKey, {from: accounts[1]});
            console.log(frames.toString());
        });
        it('Approve parcel purchase', async function() {
            let intervalPrice = await this.market.clcParcelInterval(3115378115);
            console.log(intervalPrice.toString());

            let allowance1 = await this.DAIcoin.allowance(accounts[1], this.market.address, {from: accounts[1]});
            console.log(colors.blue("Allowance before is: " + allowance1.toString()));

            let approveAmount = new BigN(await this.market.AmountToApprove(FrameNextKey, 3115378115, new BigN('0.001e18')));
            console.log(approveAmount.toString())
            await this.DAIcoin.approve(this.market.address, approveAmount, {from: accounts[1]});

            let allowance2 = await this.DAIcoin.allowance(accounts[1], this.market.address, {from: accounts[1]});
            allowance2 = web3.utils.fromWei(allowance2, 'ether');
            console.log(colors.red("Allowance after is: " + allowance2.toString() + ' ETH'));
        });
        it('Buy parcel', async function() {

            let approveAmount = new BigN(await this.market.getApprovedAmount({from: accounts[1]}));
            console.log(approveAmount.toString());

            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[1]));
            consola.log(colors.yellow("Balance of user is: " + b1));

            await this.market.buyParcel(FrameNextKey, 3115378115, new BigN('0.001e18'), {from: accounts[1]});

            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[1]));
            consola.log(colors.yellow("Balance of user is: " + b2));
            let ethDiff = web3.utils.fromWei(b1.sub(b2), 'ether');
            consola.log(colors.inverse("Difference is: " + ethDiff + ' ETH'));

            let intervalPrice = await this.market.clcParcelInterval(3115378115);

            let parcelKey=FrameNextKey.add(intervalPrice);
            console.log("BlockKey is: " + parcelKey);
            let parcel = await this.market.parcels(parcelKey);
            console.log("Block frame key is: : " + parcel.frameKey.toString());
            let ownerFrameKey = await this.market.getParcelOwnerFrameKey(parcelKey, 0);
            console.log(colors.blue("Current parcel owner's time of purchase is: : " + ownerFrameKey.toString()));

        });      
        it('Block has updated price', async function() {
            let intervalPrice = await this.market.clcParcelInterval(3115378115);
            let parcel = await this.market.getCurrentPrice(FrameNextKey, intervalPrice);
            parcel = web3.utils.fromWei(parcel, 'ether');
            consola.log(colors.america('Current price is ' + parcel + ' ETH'));

            let frame = await this.market.frames(FrameNextKey);
            let reward = web3.utils.fromWei(frame.rewardFund, 'ether');
            console.log('Current reward fund is equal to: ' + reward + ' ETH');
        });
        it('New approvement amount has new parcel price added', async function() {

            let intervalPrice = await this.market.clcParcelInterval(3115378115);
            console.log(intervalPrice.toString());

            let allowance1 = await this.DAIcoin.allowance(accounts[2], this.market.address, {from: accounts[2]});
            allowance1 = web3.utils.fromWei(allowance1, 'ether');
            console.log(colors.blue("Allowance before is: " + allowance1 + ' ETH'));

            let approveAmount = new BigN(await this.market.AmountToApprove(FrameNextKey, 3115378115, new BigN('0.005e18')));
            console.log(approveAmount.toString())
            await this.DAIcoin.approve(this.market.address, approveAmount, {from: accounts[2]});

            let allowance2 = await this.DAIcoin.allowance(accounts[2], this.market.address, {from: accounts[2]});
            allowance2 = web3.utils.fromWei(allowance2, 'ether');
            console.log(colors.red("Allowance after is: " + allowance2 + ' ETH'));

            //await this.DAIcoin.approve(accounts[1], approveAmount, {from: accounts[2]});

        });
        it('Second account buys the parcel 1 frame closer to the end frame', async function() {

            await functions.advanceTimeAndBlock(period*3650);

            let b = await web3.eth.getBlockNumber();
            let t = await web3.eth.getBlock(b);

            let currentFrame = await this.market.clcFrameTimestamp(t.timestamp);
            consola.log(colors.underline("Current frame is: " + currentFrame.toString()));

            new BigN(await this.market.getApprovedAmount({from: accounts[2]}));
            
            let seller1 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[1]));
            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b1));
            consola.log(colors.bgGreen("Balance of seller is: " + seller1));

            await this.market.buyParcel(FrameNextKey, 3115378115, new BigN('0.005e18'), {from: accounts[2]});

            let seller2 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[1]));
            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b2));
            consola.log(colors.bgGreen("Balance of seller is: " + seller2));
            let ethDiff = web3.utils.fromWei(b1.sub(b2), 'ether');
            consola.log(colors.inverse("Difference in buyer's balance is: " + ethDiff + ' ETH'));
            let ethDiffSeller = web3.utils.fromWei(seller2.sub(seller1), 'ether');
            consola.log(colors.bgGreen("Difference in seller's balance is: " + ethDiffSeller + ' ETH'));

            let intervalPrice = await this.market.clcParcelInterval(3115378115);
            let parcelKey = FrameNextKey.add(intervalPrice);
            console.log("BlockKey is: " + parcelKey);
            let parcel = await this.market.parcels(parcelKey);
            console.log("Block frame key is: " + parcel.frameKey.toString());
            let ownerFrameKey = await this.market.getParcelOwnerFrameKey(parcelKey, 1);
            console.log(colors.blue("Current parcel owner's time of purchase is: : " + ownerFrameKey.toString()));


            let reward = await this.market.getRewardAmount(FrameNextKey);
            consola.log(colors.magenta("Reward of frame is: " + reward.toString()));
            let mb1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb1.toString()));

        });
        it('should update frame prices every 30 min', async function() {
            // let tts = hoursToSkip/0.5 | 0;
            // consola.log(tts);

            let periodInSec = 2*period * 3600;
            await functions.advanceTimeAndBlock(periodInSec);

            let tts= hoursToSkip/3 | 0;

            for(let i=0;i<tts;i++){

                let parcelNum = await web3.eth.getBlockNumber();
                let parcelInfo = await web3.eth.getBlock(parcelNum);
                consola.log(colors.blue("Block number: "+parcelNum+" timestamp: "+parcelInfo.timestamp));

                await functions.advanceTimeAndBlock(3600*3); //Advance by 3h each run (1800sec)

                let b2 = await web3.eth.getBlockNumber();
                let t2 = await web3.eth.getBlock(b2);
                consola.log(colors.red("Skip time is : " + parseFloat((t2.timestamp - parcelInfo.timestamp) / 3600).toFixed(2) + " hours"));
                consola.log(colors.magenta("Block number: "+b2+" timestamp: " + t2.timestamp));
                consola.log("End frame is: " + FrameNextKey);
                newFrameKey = await this.market.clcFrameTimestamp(t2.timestamp);
                consola.log("Current Frame is: " + newFrameKey)

                //------------------------------------------------------------------------------------------------------------------------------


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

                

                consola.log("\n");
            }
        });
        it('should close frame', async function() {
            await this.market.closeFrame(FrameNextKey, {from: accounts[0]});
            let frame = await this.market.frames(FrameNextKey);
            consola.log("Average price is: " + frame.priceAverage)
            assert.equal(frame.state, 2);
        });
        it('share of first user', async function() {
            let intervalPrice = await this.market.clcParcelInterval(3115378115);
            let parcelKey = FrameNextKey.add(intervalPrice);
            let share = web3.utils.toBN(await this.market.clcShare(parcelKey, 0, {from: accounts[1]}));
            let amount = web3.utils.toBN(await this.market.clcSettleAmount(parcelKey, 0, {from: accounts[1]}));
            amount = web3.utils.fromWei(amount, 'ether');
            console.log(colors.bgMagenta("Share is " + share.toString() + " ETH"));
            console.log(colors.bgMagenta("Wining amount is " + amount + " ETH"));
        });
/*         it('Settle parcel for first user', async function() {
            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[1]));
            let mb1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb1));
            consola.log(colors.yellow("Balance of user is: " + b1));

            // let amount = web3.utils.toBN(await this.market.settleParcel(FrameNextKey, 0, {from: accounts[1]}));
            // amount = web3.utils.fromWei(amount, 'ether');
            // console.log(colors.bgMagenta("Wining amount is " + amount + " ETH"));

            await this.market.settleParcel(FrameNextKey, 0, {from: accounts[1]});
           
            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[1]));
            consola.log(colors.yellow("Balance of user is: " + b2.toString()));
            let ethDiff = web3.utils.fromWei(b2.sub(b1), 'ether');
            consola.log(colors.yellow("Difference is: " + ethDiff + " ETH"));
            let mb2 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb2));


        });
        it('Settle parcel for second user', async function() {
            let b1 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[2]));
            let mb1 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb1));
            consola.log(colors.yellow("Balance of user is: " + b1));

            let intervalPrice = await this.market.clcParcelInterval(3115378115);
            let parcelKey = FrameNextKey.add(intervalPrice);

            let share = await this.market.clcSettleAmount(parcelKey, 0, {from: accounts[2]});
            console.log("First user share: " + share);

            let share2 = await this.market.clcSettleAmount(parcelKey, 1, {from: accounts[2]});
            console.log("Second user share: " + share2);

            await this.market.settleParcel(FrameNextKey, 1, {from: accounts[2]});

           
            let b2 = web3.utils.toBN(await this.DAIcoin.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of user is: " + b2.toString()));
            let ethDiff = web3.utils.fromWei(b2.sub(b1), 'ether');
            consola.log(colors.yellow("Difference is: " + ethDiff + " ETH"));
            let mb2 = web3.utils.toBN(await this.DAIcoin.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb2));
        }); */

         
    });

    });
});