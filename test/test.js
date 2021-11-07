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

    for (let i = 0; i < 15; i++) {
      await this.accountingToken.connect(accounts[i]).loadMore();
      const balance = await this.accountingToken.balanceOf(accounts[i].address);
      console.log("Balance of " + accounts[i].address + " is " + balance)
    }
  });
  it('Deploy a new market', async function() {
    let marketCount = await this.MarketFactory.getMarketsCount();
    console.log("Market count is: " + marketCount);
    await this.MarketFactory.connect(accounts[0]).addMarket(this.accountingToken.address, addressUniswapV2Pair, period*3600, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax);
    marketCount = await this.MarketFactory.getMarketsCount();
    console.log("Market count is: " + marketCount);

    var marketKey = await this.MarketFactory.marketsKeys(0);
    let address = await this.MarketFactory.markets(marketKey);
    const MarketContract = await ethers.getContractFactory("Market");
    this.market = await MarketContract.attach(address);

    expect(marketCount).to.equal(1);
});
it('Approve lot purchase for 1st user', async function() {
    frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);

    let allowance1 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    const lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[1]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('10')));

    console.info("Amount to approve is: " + lotPrice);
    await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);

    let allowance2 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    console.log(colors.green("Allowance after is: " + allowance2));
});
it('Buy lot', async function() {
    let b1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b1));

    await this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'));

    let b2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b2));
});
it('Frame has updated reward fund', async function() {
    let frame = await this.market.frames(frameKey);
    let reward = ethers.utils.formatEther(frame.rewardFund);
    console.log(colors.bgYellow('Current reward fund is equal to: ' + reward + ' DAI'));
});
it('Increase timestamp by 1h', async function() {
    let b1 = await ethers.provider.getBlockNumber();
    let t1 = await ethers.provider.getBlock(b1);
    console.log("Timestamp: " + t1.timestamp);
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");
    let b2 = await ethers.provider.getBlockNumber();
    let t2 = await ethers.provider.getBlock(b2);
    console.log("Timestamp: " + t2.timestamp);
    console.log("Difference is: " + (t2.timestamp - t1.timestamp))
});
it('Owners lowers the price', async function() {
    let b1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b1));

    await this.market.connect(accounts[1]).updateLotPrice(frameKey, winningPairPrice, ethers.utils.parseEther('7'));

    let b2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b2));

    console.log(colors.bgGreen("Difference is: " + (b2-b1)));

    lotKey = await this.market.clcLotInterval(winningPairPrice);
    let lot = await this.market.getLot(frameKey, lotKey);
    let price = ethers.utils.formatEther(lot.acquisitionPrice, 'ether');
    assert.equal(price, 7);
});
it('Owners sets the price back to a higher value', async function() {
    let allowance1 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    const lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[1]).clcAmountToApproveForUpdate(frameKey, winningPairPrice, ethers.utils.parseEther('15')));

    console.info("Amount to approve is: " + lotPrice);
    await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);

    let allowance2 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    console.log(colors.green("Allowance after is: " + allowance2));

    let b1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b1));

    await this.market.connect(accounts[1]).updateLotPrice(frameKey, winningPairPrice, ethers.utils.parseEther('15'));

    let b2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b2));

    console.log(colors.bgGreen("Difference is: " + (b1-b2)));

    lotKey = await this.market.clcLotInterval(winningPairPrice);
    let lot = await this.market.getLot(frameKey, lotKey);
    let price = ethers.utils.formatEther(lot.acquisitionPrice, 'ether');
    assert.equal(price, 15);
});
it('Second account buys the same lot 1d later', async function() {
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");
    let allowance1 = await this.accountingToken.allowance(accounts[2].address, this.market.address);
    console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    const lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[2]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('15')));

    console.info("Amount to approve is: " + lotPrice);
    await this.accountingToken.connect(accounts[2]).approve(this.market.address, lotPrice);

    let allowance2 = await this.accountingToken.allowance(accounts[2].address, this.market.address);
    console.log(colors.green("Allowance after is: " + allowance2));

    let b1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[2].address));
    console.log(colors.green("Balance of user is: " + b1));

    await this.market.connect(accounts[2]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('15'));

    let b2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[2].address));
    console.log(colors.green("Balance of user is: " + b2));

    let frame = await this.market.frames(frameKey);
    let reward = ethers.utils.formatEther(frame.rewardFund);
    console.log(colors.bgYellow('Current reward fund is equal to: ' + reward + ' DAI'));

    let lot = await this.market.getLot(frameKey, lotKey);
    let owner = lot.lotOwner;

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");

    assert.equal(owner.toString(), accounts[2].address.toString());
});
// it('Frame mapping to address', async function() {
//     let priceRange = 6346134345;
//     for (i=0; i<4; i++) { 
//         let frame = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+(86400*i));
//         const lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[10]).clcAmountToApprove(frame, priceRange, ethers.utils.parseEther('100')));
//         await this.accountingToken.connect(accounts[10]).approve(this.market.address, lotPrice);
//         await this.market.connect(accounts[10]).buyLot(frame, priceRange, ethers.utils.parseEther('100'));
//     }
//     let frames = await this.market.userFrames(accounts[10]);
//     console.log(colors.cyan(accounts[10] + ' frames: ' + frames));
// });
it('Frame mapping to address', async function() {
    for (i=5; i<8; i++) {
        const lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[5]).clcAmountToApprove(((Date.now() / 1000 | 0)+(86400*i)), 6346134345, ethers.utils.parseEther('100')));
        await this.accountingToken.connect(accounts[5]).approve(this.market.address, lotPrice);
        await this.market.connect(accounts[5]).buyLot(((Date.now() / 1000 | 0)+(86400*i)), 6346134345, ethers.utils.parseEther('100'));
    }

    let numOfFrames = await this.market.connect(accounts[5]).getNumOfUserFrames(accounts[5].address);
    //console.log(Number(numOfFrames));
    let frames = [];
    /* for(let k=0; k<=Number(numOfFrames)-1; k++) frames[k] = await this.market.userFrames(accounts[5].address, k);
    console.log(colors.cyan(accounts[5].address + ' frames: ' + frames)); */
    await this.market.getUserFrames(accounts[5].address);
    console.log(colors.cyan(accounts[5].address + ' frames: ' + frames)); 

});
it('Accounts buy non-winning lots', async function() {
    for (i=0; i<4; i++) {
        let priceRange = 6346134345+i*dPrice;
        const lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[2]).clcAmountToApprove(frameKey, priceRange, ethers.utils.parseEther('100')));
        await this.accountingToken.connect(accounts[i]).approve(this.market.address, lotPrice);
        await this.market.connect(accounts[i]).buyLot(frameKey, priceRange, ethers.utils.parseEther('100'));
    }

    let reward = ethers.utils.formatEther(await this.market.getRewardAmount(frameKey));
    console.log(colors.bgYellow('Current reward fund is equal to: ' + reward + ' DAI'));
});
it('Update frame prices', async function() {
    let secToSKip = (period * 3600 * 2) + (3600*20);
    await ethers.provider.send("evm_increaseTime", [secToSKip]);
    await ethers.provider.send("evm_mine");

    // let tts= hoursToSkip *2;
    let tts= 5;

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
/* it('should close frame', async function() {
    await this.market.connect(accounts[0]).closeFrame(frameKey);
    let frame = await this.market.frames(frameKey);
    console.log(colors.bgWhite("Average price is: " + frame.priceAverage));
    assert.equal(frame.state, 2);
}); */
it('Winner claims reward', async function() {
    let ub1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[2].address));
    let mb1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(this.market.address));
    console.log(colors.green("Balance of user is: " + ub1));
    console.log(colors.magenta("Balance of market contract is: " + mb1));

    await this.market.connect(accounts[2]).claimReward(frameKey);

    let ub2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[2].address));
    let mb2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(this.market.address));
    console.log(colors.green("Balance of user is: " + ub2));
    console.log(colors.magenta("Balance of market contract is: " + mb2));

    let userBDiff = ub2.sub(ub1);
    let marketBDiff = mb1.sub(mb2);

    timeEnd = Date.now() / 1000 | 0;

    let frame = await this.market.frames(frameKey);
    /* let reward = ethers.utils.formatEther(frame.rewardFund);
    console.log(colors.bgYellow('Current reward fund is equal to: ' + reward + ' DAI')); */

    //console.log("Time it took to run all test:" + (timeEnd - timeStart));

    console.log(colors.bgWhite("Average price is: " + frame.priceAverage));
    //assert.equal(frame.state, 2);
    
    assert.equal(frame.rewardFund.toString(), userBDiff.toString());
  
});
it('Call calculate price', async function() {
    let frame = await this.market.frames(frameKey);
    console.log(colors.bgWhite("Average price is: " + frame.priceAverage));
    let avgPrice = await this.market.clcPrice(frameKey);
    console.log(avgPrice.toString());

    assert.equal(frame.priceAverage.toString(), avgPrice.toString());
  });

});