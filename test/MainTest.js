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
    describe("Deploy a new market and buy parcels", function() {
        it('Deploy a new market', async function() {
            let periodInSec = period * 3600;
            let settlementIntInSec = settlementInterval * 3600;
            let count1 = await this.MarketFactory.getMarketsCount();
            //console.log(count1.toString())
            await this.MarketFactory.addMarket(this.token.address, addressUniswapV2Pair, periodInSec, initTimestamp, marketTax, marketFee, dPrice, {from: accounts[0]});
            
            let count2 = await this.MarketFactory.getMarketsCount();

            var marketKey = await this.MarketFactory.marketsKeys(0);
            var address = await this.MarketFactory.markets(marketKey);
            this.market = await contractMarket.at(address);
            //console.log(count2.toString());
            assert.equal(count2-count1, 1); 
        });
        it('Get num of frames left', async function() {
            FrameNextKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
            let frames = await this.market.clcFramesLeft(FrameNextKey, {from: accounts[1]});
            console.log(colors.bgYellow("Num of frames left untill final frame: " + frames.toString()));
        });
        it('Approve parcel purchase for 1st user', async function() {
            let intervalPrice = await this.market.clcParcelInterval(9346134345);
            console.log(colors.bgGreen("Parcel interval (key) is " + intervalPrice.toString()));

            let allowance1 = await this.token.allowance(accounts[1], this.market.address, {from: accounts[1]});
            console.log(colors.green("Allowance before is: " + allowance1.toString()));

            /* timestamp = (Date.now() / 1000 | 0)+60;
            console.log(timestamp); */

            let approveAmount = new BigN(await this.market.AmountToApprove(FrameNextKey, 9346134345, new BigN('10e18'), new BigN(startTimestamp+3600)));
            console.log(approveAmount.toString())
            await this.token.approve(this.market.address, approveAmount, {from: accounts[1]});

            let allowance2 = await this.token.allowance(accounts[1], this.market.address, {from: accounts[1]});
            console.log(colors.green("Allowance after is: " + allowance2.toString()));
        });
        it('Buy parcel', async function() {

            let b = await web3.eth.getBlockNumber();
            let t = await web3.eth.getBlock(b);

            let currentFrame = await this.market.clcFrameTimestamp(t.timestamp);
            consola.log(colors.underline("Current frame is: " + currentFrame.toString()));

            let approveAmount = new BigN(await this.market.getApprovedAmount({from: accounts[1]}));
            console.log(colors.green("Approved amount is: " + approveAmount.toString()));

            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.red("Balance of user is: " + b1));

            await this.market.buyParcel(FrameNextKey, 9346134345, new BigN('10e18'), {from: accounts[1]});

            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.red("Balance of user is: " + b2));
            let diff = web3.utils.fromWei(b1.sub(b2), 'ether');
            consola.log(colors.inverse("Difference is: " + diff));

            /* let parcelKey = await this.market.clcParcelInterval(9346134345);

            console.log("Parcel key is: " + parcelKey);
            let parcel = await this.market.parcels(parcelKey);
            console.log(colors.bgWhite("Block frame key is: : " + parcel.frameKey.toString()));
            let ownerBlockNum = await this.market.getParcelOwnerBlockNum(parcelKey, 0);
            console.log(colors.bgBlue("Current parcel owner's block number is: : " + ownerBlockNum.toString())); */

        });      
        it('Block has updated price', async function() {
            let parcelKey = await this.market.clcParcelInterval(9346134345);

            let price = await this.market.getCurrentPrice(FrameNextKey, parcelKey);
            price = web3.utils.fromWei(price, 'ether');

            consola.log(colors.america('Current price is ' + price));

            let frame = await this.market.frames(FrameNextKey);
            let reward = web3.utils.fromWei(frame.rewardFund, 'ether');
            console.log(colors.america('Current reward fund is equal to: ' + reward));
        });
        it('New approvement amount has new parcel price added', async function() {

            for(let i=1; i<11; i++) {
                await functions.advanceTimeAndBlock(10); 
                console.log(colors.grey("Advanced " + i + " blocks"));
            }

            await functions.advanceTimeAndBlock(period*3650);


            let allowance1 = await this.token.allowance(accounts[2], this.market.address, {from: accounts[2]});
            allowance1 = web3.utils.fromWei(allowance1, 'ether');
            console.log(colors.green("Allowance before is: " + allowance1));

            let approveAmount = new BigN(await this.market.AmountToApprove(FrameNextKey, 9346134345, new BigN('70e18'), (Date.now() / 1000 | 0)+3600));
            console.log(approveAmount.toString());
            
            await this.token.approve(this.market.address, approveAmount, {from: accounts[2]});

            let allowance2 = await this.token.allowance(accounts[2], this.market.address, {from: accounts[2]});
            allowance2 = web3.utils.fromWei(allowance2, 'ether');
            console.log(colors.green("Allowance after is: " + allowance2));


        });
        it('Second account buys the parcel 1 frame closer to the end frame', async function() {


            let b = await web3.eth.getBlockNumber();
            let t = await web3.eth.getBlock(b);

            let currentFrame = await this.market.clcFrameTimestamp(t.timestamp);
            consola.log(colors.underline("Current frame is: " + currentFrame.toString()));

            
            let seller1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b1));
            consola.log(colors.bgGreen("Balance of seller is: " + seller1));

            await this.market.buyParcel(FrameNextKey, 9346134345, new BigN('70e18'), {from: accounts[2]});

            let seller2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of 2nd user is: " + b2));
            consola.log(colors.bgGreen("Balance of seller is: " + seller2));
            let diff = web3.utils.fromWei(b1.sub(b2), 'ether');
            consola.log(colors.inverse("Difference in buyer's balance is: " + diff));
            let diffSeller = web3.utils.fromWei(seller2.sub(seller1), 'ether');
            consola.log(colors.bgGreen("Difference in seller's balance is: " + diffSeller));

            /* let parcelKey = await this.market.clcParcelInterval(9346134345);

            console.log("BlockKey is: " + parcelKey);
            let parcel = await this.market.parcels(parcelKey);
            console.log("Block frame key is: : " + parcel.frameKey.toString()); */
            /* let ownerBlockNum = await this.market.getParcelOwnerBlockNum(parcelKey, 1);
            console.log(colors.blue("Current parcel owner's block number is: : " + ownerBlockNum.toString())); */
        });
        it('Calculate owner index', async function() {

            let parcelKeyWin = (await this.market.clcParcelInterval(9346134345));

            let number = await this.market.getParcelOwnerIndex(FrameNextKey, parcelKeyWin, accounts[2], {from: accounts[2]}); 

            console.log("Index is: " + number);


        });
        it('Block has updated price', async function() {
           /*  let parcelKey = await this.market.clcParcelInterval(9346134345);

            let price = await this.market.getCurrentPrice(parcelKey);
            price = web3.utils.fromWei(price, 'ether');

            consola.log(colors.america('Current price is ' + price)); */

            let frame = await this.market.frames(FrameNextKey);
            let reward = web3.utils.fromWei(frame.rewardFund, 'ether');
            console.log(colors.america('Current reward fund is equal to: ' + reward));
        });
        // it('Accounts buy non-winning parcels', async function() {


        // });      

        it('should update frame prices every 1h', async function() {
            // let tts = hoursToSkip/0.5 | 0;
            // consola.log(tts);

            let periodInSec = 2*period * 3600;
            await functions.advanceTimeAndBlock(periodInSec);
            for(let i=0; i<10; i++) {
                await functions.advanceTimeAndBlock(1); //cca 240 blocks mined in one hour
                console.log("Advanced " + i + " blocks");
            }
            let tts= hoursToSkip | 0;

            for(let i=0;i<tts;i++){

                let parcelNum = await web3.eth.getBlockNumber();
                let parcelInfo = await web3.eth.getBlock(parcelNum);
                consola.log(colors.blue("Block number: "+parcelNum+" timestamp: "+parcelInfo.timestamp));


                for(let i=0; i<10; i++) {
                    await functions.advanceTimeAndBlock(1); //cca 240 blocks mined in one hour
                    console.log("Advanced " + i + " blocks");
                }

                await functions.advanceTimeAndBlock(3600); //Advance by 1h each run (1800sec)

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
        it('Calculate share', async function() {

            let frame = await this.market.frames(FrameNextKey);
            consola.log("Average price is: " + frame.priceAverage)

            let parcelKeyWin = (await this.market.clcParcelInterval(frame.priceAverage));

            let share = await this.market.clcShare(FrameNextKey, parcelKeyWin, accounts[2], {from: accounts[2]}); //15004292677200000000  15004307946600000000   15004844072200000000


            console.log("Amount is: " + share);


        });
        it('Settle parcel for first user', async function() {
            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            let mb1 = web3.utils.toBN(await this.token.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb1));
            consola.log(colors.yellow("Balance of user is: " + b1));


            await this.market.settleParcel(FrameNextKey, accounts[1], {from: accounts[1]});

           
            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[1]));
            consola.log(colors.yellow("Balance of user is: " + b2.toString()));
            let Diff = web3.utils.fromWei(b2.sub(b1), 'ether');
            consola.log(colors.yellow("Difference is: " + Diff));
            let mb2 = web3.utils.toBN(await this.token.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb2));


        });
        it('Settle parcel for second user', async function() {
            let b1 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            let mb1 = web3.utils.toBN(await this.token.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb1));
            consola.log(colors.yellow("Balance of user is: " + b1));

            await this.market.settleParcel(FrameNextKey, accounts[2], {from: accounts[2]});

            let b2 = web3.utils.toBN(await this.token.balanceOf(accounts[2]));
            consola.log(colors.yellow("Balance of user is: " + b2.toString()));
            let diff = web3.utils.fromWei(b2.sub(b1), 'ether');
            consola.log(colors.yellow("Difference is: " + diff));
            let mb2 = web3.utils.toBN(await this.token.balanceOf(this.market.address));
            consola.log(colors.green("Balance of market is: " + mb2));
        });

         
    });

    });
});