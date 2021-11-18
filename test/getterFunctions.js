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
    const MarketFactoryContract = await ethers.getContractFactory("MarketFactory");
    this.MarketFactory = await MarketFactoryContract.deploy("0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");
    const TokenContract = await ethers.getContractFactory("Token");
    this.accountingToken = await TokenContract.connect(accounts[0]).deploy();

    for (let i = 0; i < 4; i++) {
      await this.accountingToken.connect(accounts[i]).loadMore();
      const balance = await this.accountingToken.balanceOf(accounts[i].address);
      //console.log("Balance of " + accounts[i].address + " is " + balance)
    }

    await this.MarketFactory.connect(accounts[0]).addMarket(this.accountingToken.address, addressUniswapV2Pair, period*3600, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax);
    
    var marketKey = await this.MarketFactory.marketsKeys(0);
    let address = await this.MarketFactory.markets(marketKey);

    const MarketContract = await ethers.getContractFactory("Market");
    this.market = await MarketContract.attach(address);

    frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
    var lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[1]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('10')));
    await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);
    await this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'));
    
    lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[2]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('15')));
    await this.accountingToken.connect(accounts[2]).approve(this.market.address, lotPrice);
    await this.market.connect(accounts[2]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('15'));
  });
  it('Get frame reward fund', async function() {
    let frame = await this.market.frames(frameKey);
    let reward = ethers.utils.formatEther(frame.rewardFund);
    console.log(colors.bgBlue('Current reward fund is equal to: ' + reward + ' DAI'));
  });
  it('Get frame count', async function() {
    await this.market.connect(accounts[0]).getOrCreateFrame((Date.now() / 1000 | 0)+86400);
    let frameCount = await this.market.getNumberOfFrameKeys();
    console.log(colors.bgBlue('There is ' + frameCount + ' frames.'));

    expect(frameCount).to.equal(2);
  });
  it('Get open frames', async function() {
    for (let i = 0; i<=10; i++) {
      await this.market.connect(accounts[0]).getOrCreateFrame((Date.now() / 1000 | 0)+(period*3600*i));
    }    
    let frames = await this.market.connect(accounts[0]).getOpenFrameKeys(10);
    console.log(colors.bgBlue('Open frames ' + frames));

   // expect(frameCount).to.equal(2);
  });
  it('Get frame count', async function() {
    await this.market.connect(accounts[0]).getOrCreateFrame((Date.now() / 1000 | 0)+86400);
    let frameCount = await this.market.getNumberOfFrameKeys();
    console.log(colors.bgBlue('There is ' + frameCount + ' frames.'));

  });
  it('Get lot struct', async function() {
    let lotKey = await this.market.getLotKey(frameKey, 0);
    let lot = await this.market.getLot(frameKey, lotKey);
    console.log(colors.bgBlue('Lot key struct: ' + lot));

    expect(lot.lotOwner.toString()).to.equal(accounts[2].address.toString());
  });
  it('Get number of lots', async function() {
    for (let i = 0; i < 7; i++) {
        let pairPrice = (ethers.BigNumber.from('1000101302161004392578051')).mul(i);
        let lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[3]).clcAmountToApprove(frameKey, pairPrice, ethers.utils.parseEther('15')));
        await this.accountingToken.connect(accounts[3]).approve(this.market.address, lotPrice);
        await this.market.connect(accounts[3]).buyLot(frameKey, pairPrice, ethers.utils.parseEther('15'));
    }

    let lotCount = await this.market.getLotsCount(frameKey);
    console.log(colors.bgBlue('There are : ' + lotCount + ' lots'));

    expect(lotCount).to.equal(8);
  });
  it('Get lot key', async function() {
    let lotKey = await this.market.getLotKey(frameKey, 2);

    let expectedLotKey = ethers.BigNumber.from('1000101302161004392578051').div(dPrice).mul(dPrice).add(dPrice);
    expect(lotKey.toString()).to.equal(expectedLotKey.toString());
  });

 
 
 




});