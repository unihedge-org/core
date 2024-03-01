//npx hardhat node --fork https://rinkeby.infura.io/v3/fa45f0ccc7eb423e983a72671d038716
//npx hardhat test ./test/test.js --network localhost (be careful, did not work on node 19, had to downgrade to version 14)
//npx hardhat node --fork https://polygon-mainnet.infura.io/v3/fa45f0ccc7eb423e983a72671d038716 --fork-block-number 44446422

const { expect } = require("chai");
const colors = require('colors');
const BigN = require("bignumber.js");

let addressUniswapV2Factory = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"; 
let addressUniswapV2Pair = "0x6FF62bfb8c12109E8000935A6De54daD83a4f39f";
let addressTokenDAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
let addressTokenWETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";


var accounts = [];

//----------------------------------------------------------------------
const startTimestamp = Date.now() / 1000 | 0;
console.log("Current timestamp: " + startTimestamp + " s");
const n=6; 
const initTimestamp = startTimestamp;
const period = 24; //in hours
const marketFee = 100; // %/1000
const marketTax = 100;
const hoursToSkip = 27; 
const dPrice = ethers.BigNumber.from('10000000000000');
const tReporting = 3600;
const winningPairPrice = ethers.BigNumber.from('2108000000000000000000000000');
const minTax = 77677; 
let frameKey; 
let lotKey;          
let startframe;  

function printObject(obj) {
  const convertBigNumber = (value) => {
      return ethers.BigNumber.isBigNumber(value) ? value.toString() : value;
  };

  const parseObject = (obj) => {
      if (Array.isArray(obj)) {
          return obj.map(parseObject);
      } else if (obj !== null && typeof obj === 'object') {
          const newObj = {};
          for (const key in obj) {
              newObj[key] = parseObject(obj[key]);
          }
          return newObj;
      } else {
          return convertBigNumber(obj);
      }
  };

  console.log(JSON.stringify(parseObject(obj), null, 2));
}




describe("Market contract", function () {
  before(async function() {
    accounts = await ethers.getSigners();
    //console.log(accounts[5].address);
    // console.log("Deploying contracts...")
    const MarketFactoryContract = await ethers.getContractFactory("MarketFactory");
    this.MarketFactory = await MarketFactoryContract.deploy(addressUniswapV2Factory);

    const TokenContract = await ethers.getContractFactory("Token");
    this.accountingToken = await TokenContract.connect(accounts[0]).deploy();

    const MarketGetterContract = await ethers.getContractFactory("MarketGetter");
    this.marketGetter = await MarketGetterContract.deploy();

    for (let i = 0; i < 15; i++) {
      await this.accountingToken.connect(accounts[i]).loadMore();
      const balance = await this.accountingToken.balanceOf(accounts[i].address);
      // console.log("Balance of " + accounts[i].address + " is " + balance)
    }
  });
  it('Deploy a new market', async function() {
    let marketCount = await this.MarketFactory.getMarketsCount();
    // console.log("Market count is: " + marketCount);
    await this.MarketFactory.connect(accounts[0]).addMarket(this.accountingToken.address, addressUniswapV2Pair, period*3600, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax, true);
    marketCount = await this.MarketFactory.getMarketsCount();
    // console.log("Market count is: " + marketCount);

    var marketKey = await this.MarketFactory.marketsKeys(0);
    let address = await this.MarketFactory.markets(marketKey);
    const MarketContract = await ethers.getContractFactory("Market");
    this.market = await MarketContract.attach(address);

    expect(marketCount).to.equal(1);
});
  it('Buy some lots', async function() {
    //First user buys 3 lots at different prices and different frames
    for(let i=0; i<3; i++) {
      frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400*i);
      startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
      let lotKey = winningPairPrice.mul(i);
      const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address, frameKey, lotKey, ethers.utils.parseEther('10')));
      await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);

      await this.market.connect(accounts[1]).buyLot(frameKey, lotKey, ethers.utils.parseEther('10'), ethers.constants.AddressZero);
      const balance = await this.accountingToken.balanceOf(accounts[1].address);
    }
    //Second user buys 3 lots at different prices and different frames
    for(let i=0; i<3; i++) {
      frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400*i);
      startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
      let lotKey = dPrice.mul(100*(i+1));
      const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[2]).clcAmountToApprove(this.market.address, frameKey, lotKey, ethers.utils.parseEther('10')));
      await this.accountingToken.connect(accounts[2]).approve(this.market.address, lotPrice);

      await this.market.connect(accounts[2]).buyLot(frameKey, lotKey, ethers.utils.parseEther('10'), ethers.constants.AddressZero);
      const balance = await this.accountingToken.balanceOf(accounts[2].address);
    }

  });
  it('Test getFrameStruct function', async function() {
    let frame = await this.marketGetter.connect(accounts[1]).getFrameStruct(this.market.address, frameKey);
    console.log(frame);
  });
  it('Test getLotStruct function', async function() {
    let lotKey = await this.market.connect(accounts[1]).clcLotKey(winningPairPrice);
    let frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400);
    let lot = await this.marketGetter.connect(accounts[1]).getLotStruct(this.market.address, frameKey, lotKey);
    console.log(lot);
  });
  it('Test getLotsCount function', async function() {
    let frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400);
    let lotCount = await this.marketGetter.connect(accounts[1]).getLotsCount(this.market.address, frameKey);
    console.log(lotCount);
  });
  it('Test getOpenFrameKeys function', async function() {
    let frameKeyStart = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
    let openFrames = await this.marketGetter.connect(accounts[1]).getOpenFrameKeys(this.market.address, frameKeyStart, 4);
    //Convert to json string and print
    // console.log(JSON.stringify(openFrames));
  });
  it('Test getLots function', async function() {
    let frameKeyStart = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
    let frameKeyEnd = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400*5);
    let lots = await this.marketGetter.connect(accounts[1]).getLots(this.market.address, frameKeyStart, frameKeyEnd, 0, 4);
    //Convert to json string and print
    // console.log(JSON.stringify(lots));
    console.log(lots[0].length);
  });
  it('Test getLotsUser function', async function() {
    let frameKeyStart = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
    let frameKeyEnd = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400*5);
    let lotsUser = await this.marketGetter.connect(accounts[1]).getLotsUser(this.market.address, accounts[1].address, 0, frameKeyStart, frameKeyEnd, 0, 4);
    //Convert to json string and print
    console.log("No. of lots:" + lotsUser[0].length);
    printObject(lotsUser);
  });
  it('Test getFrames function', async function() {
    let frameKeyStart = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
    let frameKeyEnd = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400*5);
    let frames = await this.marketGetter.connect(accounts[1]).getFrames(this.market.address, frameKeyStart, frameKeyEnd, 0, 4);
    //Convert to json string and print
    // console.log(JSON.stringify(frames));
    console.log(frames[0].length);
    // printObject(lotsUser);
  });
  it('Test getFramesUser function', async function() {
    let frameKeyStart = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
    let frameKeyEnd = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+86400*5);
    let userFrames = await this.marketGetter.connect(accounts[1]).getFramesUser(this.market.address, accounts[1].address, frameKeyStart, frameKeyEnd, 0, 4);
    //Convert to json string and print
    // console.log(JSON.stringify(userFrames));
    console.log(userFrames[0].length);
    // printObject(lotsUser);
  });




});