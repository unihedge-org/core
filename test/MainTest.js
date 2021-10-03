//$ ganache-cli --fork https://rinkeby.infura.io/v3/<key>             |
//$ truffle test ./test/MainTest.js                                   | 
//$ ETH/DAI market deployed on Rinkeby:                               | 
//--------------------------------------------------------------------|

const functions = require("./functions.js");


const {
    BN,
    constants,
    shouldFail,
    expectRevert
} = require('@openzeppelin/test-helpers');

const truffleAssert = require('truffle-assertions');

const { assert } = require('chai');
const colors = require('colors');
const consola = require('consola');
const BigN = require("bignumber.js");

//Contracts
const Token = artifacts.require("./Token.sol");
const contractMarket = artifacts.require("./Market.sol");
const contractMarketFactory = artifacts.require("./MarketFactory.sol");
const contractToken = artifacts.require("@openzeppelin/contracts/token/ERC20/ERC20.sol");
const contractUniswapV2Factory = artifacts.require("@uniswap/v2-core/contracts/UniswapV2Factory.sol");
const conatractUniswapV2Pair = artifacts.require("@uniswap/v2-core/contracts/UniswapV2Pair.sol");
const contractUniswapV2Router02 = artifacts.require("@uniswap/v2-periphery/contracts/UniswapV2Router02.sol");

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
const n=6; 
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
const tReporting = 3600;
const winningPairPrice = new BigN('37000100687192035822865933');
const minTax = 77677;
                 
//----------------------------------------------------------------------

//TODO: add assert,expect... statements to each test lot

let timeStart = Date.now() / 1000 | 0;
let timeEnd = 0;

contract("UniHedge", async accounts => {

    describe("Testing functionality of Unihedge protocol", function() {
        before(async function() {
            //Deploy market factory
            this.MarketFactory = await contractMarketFactory.new(addressUniswapV2Factory);
            //Import deployed contracts
            //this.MarketFactory = await contractMarketFactory.at(addressMarketFactory);
            //this.token = await contractToken.at(addressTokenDAI);
            this.UniswapV2Factory = await contractUniswapV2Factory.at(addressUniswapV2Factory);
            this.UniswapV2Pair = await conatractUniswapV2Pair.at(addressUniswapV2Pair);
            this.UniswapV2Router02 = await contractUniswapV2Router02.at(addressUniswapV2Router02);
            // //Swap ETH for DAI on 'n' accounts
            // for (let i = 0; i < n; i++) {
            //     await this.UniswapV2Router02.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[i], parseInt(+new Date() / 1000) + 3600 * 24, {from: accounts[i], value: new BN('100e18')});
            // }

            this.token = await Token.new("UniHedgeToken", "UNH", new BigN('100e18'), {from: accounts[0]});
            for (let i = 0; i < n; i++) {
                await this.token.loadMore({from: accounts[i]})
            }
            

        });
    describe("Deploy a new market and buy lots", function() {
        it('Deploy a new market', async function() {
            let periodInSec = period * 3600;
            let settlementIntInSec = settlementInterval * 3600;
            let count1 = await this.MarketFactory.getMarketsCount();
            await this.MarketFactory.addMarket(this.token.address, addressUniswapV2Pair, periodInSec, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax, {from: accounts[0]});
            
            let count2 = await this.MarketFactory.getMarketsCount();

            var marketKey = await this.MarketFactory.marketsKeys(0);
            var address = await this.MarketFactory.markets(marketKey);
            this.market = await contractMarket.at(address);
            //console.log(count2.toString());
            assert.equal(count2-count1, 1); 
        });
        it('Get num of frames left', async function() {
            FrameNextKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
            console.log(colors.bold("New frame key is:" + FrameNextKey));

            let frames = await this.market.clcFramesLeft(FrameNextKey, {from: accounts[1]});
            console.log(colors.bgYellow("Num of frames left untill final frame: " + frames.toString()));
            assert.equal(frames, 3)
        });
        it('Approve lot purchase for 1st user', async function() {
            let intervalPrice = await this.market.clcLotInterval(winningPairPrice);
            console.log(colors.blue("Lot interval (key) is " + intervalPrice.toString()));

            let allowance1 = await this.token.allowance(accounts[1], this.market.address, {from: accounts[1]});
            console.log(colors.green("Allowance before is: " + allowance1.toString()));

            //lot: 9350000000; framekey: 1627895117
            const lotPrice = new BigN(await this.market.clcAmountToApprove(FrameNextKey, winningPairPrice, new BigN('10e18')));
            console.info("Amount to approve is: " + lotPrice);
            await this.token.approve(this.market.address, lotPrice, {from: accounts[1]});

            let allowance2 = await this.token.allowance(accounts[1], this.market.address, {from: accounts[1]});
            console.log(colors.green("Allowance after is: " + allowance2));

            assert.equal(lotPrice.toString(), allowance2.toString())
        });
        it('Buy lot', async function() {
            let b = await web3.eth.getBlockNumber();
            let t = await web3.eth.getBlock(b);

            let currentFrame = await this.market.clcFrameTimestamp(t.timestamp);
            consola.log(colors.underline("Current frame is: " + currentFrame.toString()));

            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.green("Balance of user is: " + b1));

            await this.market.buyLot(FrameNextKey, winningPairPrice, new BigN('10e18'), {from: accounts[1]});

            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.green("Balance of user is: " + b2));
            let diff = web3.utils.fromWei(b1.sub(b2), 'ether');
            consola.log(colors.inverse("Difference is: " + diff));

            /* 
            console.log("Lot key is: " + lotKey);
            let lot = await this.market.lots(lotKey);
            console.log(colors.bgWhite("Block frame key is: : " + lot.frameKey.toString()));
            let ownerBlockNum = await this.market.getLotOwnerBlockNum(lotKey, 0);
            console.log(colors.bgBlue("Current lot owner's block number is: : " + ownerBlockNum.toString())); */

            /* let index = await this.market.getLotOwnerIndex(FrameNextKey, lotKey, accounts[1]);
            console.log("Lot : \n" + index); */

            let lotKey = await this.market.clcLotInterval(winningPairPrice);
            let lot = await this.market.getLot(FrameNextKey, lotKey);
            //console.log("Lot : \n" + lot);
            
            /* let owner = (JSON.stringify(lot)).slice(18, 60);
            assert.equal(owner, accounts[1]) */

        });      
        it('Lot has updated price and frame reward price', async function() {
            let lotKey = await this.market.clcLotInterval(winningPairPrice);
            let lot = await this.market.getLot(FrameNextKey, lotKey);
            let price = web3.utils.fromWei(lot.acquisitionPrice, 'ether');
            consola.log(colors.cyan('Current price is ' + price));
            assert.equal(price, 10);
        });
        it('Frame has updated reward price', async function() { //TODO: check if the reward amount is correctly calulated
            let frame = await this.market.frames(FrameNextKey);
            let reward = web3.utils.fromWei(frame.rewardFund, 'ether');
            consola.log(colors.cyan('Current reward fund is equal to: ' + reward));
        });
        it('Lower the lot price', async function() {
            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.green("Balance of user is: " + b1));

            await this.market.updateLotPrice(FrameNextKey, winningPairPrice, new BigN('7e18'), {from: accounts[1]});

            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.red("Balance of user is: " + b2));
            let diff = web3.utils.fromWei(b2.sub(b1), 'ether');
            consola.log(colors.inverse("Difference is: " + diff));

            let lotKey = await this.market.clcLotInterval(winningPairPrice);
            let lot = await this.market.getLot(FrameNextKey, lotKey);
            let price = web3.utils.fromWei(lot.acquisitionPrice, 'ether');
            assert.equal(price, 7);
        });    
        it('Approve for second account', async function() {

            for(let i=1; i<30; i++) {
                await functions.advanceTimeAndBlock(10); 
            }
            console.log(colors.grey("Advanced 30 blocks"));

            await functions.advanceTimeAndBlock(period*3650);


            let allowance1 = await this.token.allowance(accounts[2], this.market.address, {from: accounts[2]});
            allowance1 = web3.utils.fromWei(allowance1, 'ether');
            console.log(colors.green("Allowance before is: " + allowance1));

            const lotPrice = new BigN(await this.market.clcAmountToApprove(FrameNextKey, winningPairPrice, new BigN('70e18')));
            console.log(lotPrice.toString());
            
            await this.token.approve(this.market.address, lotPrice, {from: accounts[2]});

            let allowance2 = await this.token.allowance(accounts[2], this.market.address, {from: accounts[2]});
            //allowance2 = web3.utils.fromWei(allowance2, 'ether');
            console.log(colors.green("Allowance after is: " + allowance2));
            assert.equal(allowance2.toString(), lotPrice.toString())


        });
        it('Second account buys the lot 1 frame closer to the end frame', async function() {


            let b = await web3.eth.getBlockNumber();
            let t = await web3.eth.getBlock(b);

            let currentFrame = await this.market.clcFrameTimestamp(t.timestamp);
            consola.log(colors.underline("Current frame is: " + currentFrame.toString()));

            
            let seller1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b1));
            consola.log(colors.bgGreen("Balance of seller is: " + seller1));

            await this.market.buyLot(FrameNextKey, winningPairPrice, new BigN('70e18'), {from: accounts[2]});

            

            let seller2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b2));
            consola.log(colors.bgGreen("Balance of seller is: " + seller2));
            let diff = web3.utils.fromWei(b1.sub(b2), 'ether');
            consola.log(colors.inverse("Difference in buyer's balance is: " + diff));
            let diffSeller = web3.utils.fromWei(seller2.sub(seller1), 'ether');
            consola.log(colors.bgGreen("Difference in seller's balance is: " + diffSeller));

            /* let lotKey = await this.market.clcLotInterval(winningPairPrice);

            console.log("BlockKey is: " + lotKey);
            let lot = await this.market.lots(lotKey);
            console.log("Block frame key is: : " + lot.frameKey.toString()); */
            /* let ownerBlockNum = await this.market.getLotOwnerBlockNum(lotKey, 1);
            console.log(colors.blue("Current lot owner's block number is: : " + ownerBlockNum.toString())); */
        });
        it('Reward fund is updated', async function() {
            let frame = await this.market.frames(FrameNextKey);
            let reward = web3.utils.fromWei(frame.rewardFund, 'ether');
            console.log(colors.america('Current reward fund is equal to: ' + reward));
        });
        it('First account buys back the lot 1h later', async function() {

            for(let i=1; i<11; i++) {
                await functions.advanceTimeAndBlock(10); 
            }
            console.log(colors.grey("Advanced 10 blocks"));

            await functions.advanceTimeAndBlock(period*3600);


            let allowance1 = await this.token.allowance(accounts[1], this.market.address, {from: accounts[1]});
            allowance1 = web3.utils.fromWei(allowance1, 'ether');
            console.log(colors.green("Allowance before is: " + allowance1));

            let lotPrice  = new BigN(await this.market.clcAmountToApprove(FrameNextKey, winningPairPrice, new BigN('150e18')));
            console.log(lotPrice.toString());
            
            await this.token.approve(this.market.address, lotPrice, {from: accounts[1]});

            let allowance2 = await this.token.allowance(accounts[1], this.market.address, {from: accounts[1]});
            allowance2 = web3.utils.fromWei(allowance2, 'ether');
            console.log(colors.green("Allowance after is: " + allowance2));

            //-----------------------------------------------------------------------------------------------------------------


            let b = await web3.eth.getBlockNumber();
            let t = await web3.eth.getBlock(b);

            let currentFrame = await this.market.clcFrameTimestamp(t.timestamp);
            consola.log(colors.underline("Current frame is: " + currentFrame.toString()));

            
            let seller1 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b1));
            consola.log(colors.bgGreen("Balance of seller is: " + seller1));

            await this.market.buyLot(FrameNextKey, winningPairPrice, new BigN('150e18'), {from: accounts[1]});

            let seller2 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b2));
            consola.log(colors.bgGreen("Balance of seller is: " + seller2));
            let diff = web3.utils.fromWei(b1.sub(b2), 'ether');
            consola.log(colors.inverse("Difference in buyer's balance is: " + diff));
            let diffSeller = web3.utils.fromWei(seller2.sub(seller1), 'ether');
            consola.log(colors.bgGreen("Difference in seller's balance is: " + diffSeller));

        });
        it('Accounts buy non-winning lots', async function() {//TODO: calculate "manualy" (off chain) reward amount to check with assert

            let awardAmount1 = await this.market.getRewardAmount(FrameNextKey);
            console.log(colors.bgGreen("Award amount before is: " + awardAmount1));


            for (i=0; i<5; i++) {
                let priceRange = 6346134345+i*dPrice;
                const lotPrice = new BigN(await this.market.clcAmountToApprove(FrameNextKey, priceRange, new BigN('15e18')));
                await this.token.approve(this.market.address, lotPrice, {from: accounts[i]});
                await this.market.buyLot(FrameNextKey, priceRange, new BigN('15e18'), {from: accounts[i]});
            }

            let awardAmount2 = await this.market.getRewardAmount(FrameNextKey);
            console.log(colors.bgGreen("Award amount after is: " + awardAmount2));

        });      

        it('Update frame prices every 30min', async function() {
            // let tts = hoursToSkip/0.5 | 0;
            // consola.log(tts);

            let periodInSec = period * 3600 + 20 * 3600;
            await functions.advanceTimeAndBlock(periodInSec);
            for(let i=0; i<10; i++) { //advance blocks
                await functions.advanceTimeAndBlock(1); 
                //console.log("Advanced " + i + " blocks");
            }
            // let tts= hoursToSkip *2;
            let tts= 14;

            for(let i=0;i<tts;i++){
                let lotNum = await web3.eth.getBlockNumber();
                let lotInfo = await web3.eth.getBlock(lotNum);


                for(let i=0; i<10; i++) {//advance blocks
                    await functions.advanceTimeAndBlock(1); 
                }
                console.log(colors.cyan("Advanced 10 blocks"));

                await functions.advanceTimeAndBlock(1800); //Advance by 30min each run (1800sec)

                let b2 = await web3.eth.getBlockNumber();
                let t2 = await web3.eth.getBlock(b2);
                consola.log(colors.cyan("Skip time is : " + parseFloat((t2.timestamp - lotInfo.timestamp) / 3600).toFixed(2) + " hours"));
                consola.log(colors.cyan("New block number is: "+b2+" timestamp: " + t2.timestamp));
                consola.info("End frame is: " + FrameNextKey);
                newFrameKey = await this.market.clcFrameTimestamp(t2.timestamp);
                consola.log(colors.cyan("Current Frame is: " + newFrameKey))


        
                let startPirceAccu = new BigN('351376658422403395211142728202634126243');

                let priceAccu = startPirceAccu.plus(new BigN('10000000')).multipliedBy(i+1);

                await this.market.updateFramePrices(priceAccu, {from: accounts[0]});

                let frame = await this.market.frames(FrameNextKey);
                
                consola.log(colors.cyan("Start frame price is: " + frame.oraclePrice0CumulativeStart));
                consola.log(colors.cyan("End frame price is: " + frame.oraclePrice0CumulativeEnd));
                consola.log(colors.cyan("Difference is: " + (frame.oraclePrice0CumulativeEnd - frame.oraclePrice0CumulativeStart)));
                consola.log(colors.cyan("Start frame timestamp is: " + frame.oracleTimestampStart));
                consola.log(colors.cyan("End frame timestamp is: " + frame.oracleTimestampEnd));
                consola.log(colors.cyan("Difference is: " + (frame.oracleTimestampEnd - frame.oracleTimestampStart) + "\n"));

                

                consola.log("-------------------------------------------------------------------------------------------------------\n");
            }
        });
        it('should close frame', async function() {
            await this.market.closeFrame(FrameNextKey, {from: accounts[0]});
            let frame = await this.market.frames(FrameNextKey);
            consola.log("Average price is: " + frame.priceAverage)
            assert.equal(frame.state, 2);
        });
        it('Settle lot', async function() {
            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            let mb1 = web3.utils.toBN(await this.token.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb1));
            consola.log(colors.yellow("Balance of user is: " + b1));


            let address = await this.market.settleLot(FrameNextKey, {from: accounts[1]});
            console.log(address);

            
           
            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.yellow("Balance of user is: " + b2.toString()));
            let Diff = web3.utils.fromWei(b2.sub(b1), 'ether');
            consola.log(colors.yellow("Difference is: " + Diff));
            let mb2 = web3.utils.toBN(await this.token.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb2));

            timeEnd = Date.now() / 1000 | 0;
            console.log("Time it took to run all test:" + (timeEnd - timeStart));
        });         
    });

    });
});