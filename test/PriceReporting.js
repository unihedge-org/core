//npx hardhat node --fork https://rinkeby.infura.io/v3/fa45f0ccc7eb423e983a72671d038716
//npx hardhat test ./test/test.js

const { expect } = require("chai");
const colors = require('colors');
const BigN = require("bignumber.js");

//Rinkeby contract addresses
let addressUniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";
let addressTokenDAI = "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735";
let addressTokenWETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
let addressUniswapV2Router02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
let addressMarketFactory = "0xf63ecBC45737E9087751CA5d3C98A0359Ee71226";

var accounts = [];

//----------------------------------------------------------------------
const startTimestamp = Date.now() / 1000 | 0;
console.log("Current timestamp: " + startTimestamp + " s");
const n=6; 
const initTimestamp = startTimestamp;
const period = 24; //in hours
const settlementInterval = 6;
const minHorizon=0;
const maxHorizon=30;
const marketFee = 100; // %/1000
const marketTax = 100;
const hoursToSkip = 27; 
const bet = new BigN('1000e18');
const dPrice = 10000000;
const tReporting = 3600;
const winningPairPrice = ethers.BigNumber.from('37000101302161004392578051');
const minTax = 77677;
let frameKey;     
let lotKey;            
//----------------------------------------------------------------------

let timeStart = Date.now() / 1000 | 0;
let timeEnd = 0;


describe("Market contract", function () {
  before(async function() {
    accounts = await ethers.getSigners();
    //console.log(accounts[5].address);

    const MarketFactoryContract = await ethers.getContractFactory("MarketFactory");
    this.MarketFactory = await MarketFactoryContract.deploy("0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");

    const TokenContract = await ethers.getContractFactory("Token");
    this.accountingToken = await TokenContract.connect(accounts[0]).deploy();

    await this.MarketFactory.connect(accounts[0]).addMarket(this.accountingToken.address, addressUniswapV2Pair, period*3600, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax);
    var marketKey = await this.MarketFactory.marketsKeys(0);
    let address = await this.MarketFactory.markets(marketKey);
    const MarketContract = await ethers.getContractFactory("Market");
    this.market = await MarketContract.attach(address);
  });
it('Get frame key', async function() {
    frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
});
it('Update frame prices', async function() {
    let secToSKip = (period * 3600 * 2) + (3600*20);
    await ethers.provider.send("evm_increaseTime", [secToSKip]);
    await ethers.provider.send("evm_mine");

    let tts= 60;

    for(let i=0;i<tts;i++){

      let blockNum1 = await ethers.provider.getBlockNumber();
      let blockInfo1 = await ethers.provider.getBlock(blockNum1);

      await ethers.provider.send("evm_increaseTime", [1800]);
      await ethers.provider.send("evm_mine");

      let blockNum2 = await ethers.provider.getBlockNumber();
      let blockInfo2 = await ethers.provider.getBlock(blockNum2);
      console.log(colors.cyan("Skip time is : " + parseFloat((blockInfo2.timestamp - blockInfo1.timestamp) / 3600).toFixed(2) + " hours"));
      console.log(colors.cyan("New block number is: "+blockNum2+" timestamp: " + blockInfo2.timestamp));
      console.log("End frame is: " + frameKey);
      newFrameKey = await this.market.clcFrameTimestamp(blockInfo2.timestamp);
      console.log(colors.cyan("Current Frame is: " + newFrameKey));

      let startPirceAccu = ethers.BigNumber.from("351376658422403395211142728202634126243");
      let priceAccu = startPirceAccu.add(ethers.BigNumber.from("10000000")).mul(i+1);

      await this.market.connect(accounts[0]).updateFramePrices(priceAccu);

      let frame = await this.market.frames(frameKey);
      
      console.log(colors.cyan("Start frame price is: " + frame.oraclePrice0CumulativeStart));
      console.log(colors.cyan("End frame price is: " + frame.oraclePrice0CumulativeEnd));
      console.log(colors.cyan("Difference is: " + (frame.oraclePrice0CumulativeEnd - frame.oraclePrice0CumulativeStart)));
      console.log(colors.cyan("Start frame timestamp is: " + frame.oracleTimestampStart));
      console.log(colors.cyan("End frame timestamp is: " + frame.oracleTimestampEnd));
      console.log(colors.cyan("Difference is: " + (frame.oracleTimestampEnd - frame.oracleTimestampStart) + "\n"));

      console.log("□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□ \n");
  }
});
});