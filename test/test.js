//npx hardhat node --fork https://rinkeby.infura.io/v3/fa45f0ccc7eb423e983a72671d038716
//npx hardhat test ./test/test.js
//npx hardhat node --fork https://polygon-mainnet.infura.io/v3/fa45f0ccc7eb423e983a72671d038716 --fork-block-number 25867882

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
const settlementInterval = 6;
const minHorizon=0;
const maxHorizon=30;
const marketFee = 100; // %/1000
const marketTax = 100;
const hoursToSkip = 27; 
const bet = new BigN('1000e18');
const dPrice = 10000000000000;
const tReporting = 3600;
const winningPairPrice = ethers.BigNumber.from('2602000000000000000000000000');
const minTax = 77677; 
let frameKey; 
let lotKey;          
let startframe;  
//----------------------------------------------------------------------

let timeStart = Date.now() / 1000 | 0;
let timeEnd = 0;


describe("Market contract", function () {
  before(async function() {
    accounts = await ethers.getSigners();
    //console.log(accounts[5].address);

    const MarketFactoryContract = await ethers.getContractFactory("MarketFactory");
    this.MarketFactory = await MarketFactoryContract.deploy(addressUniswapV2Factory);

    const TokenContract = await ethers.getContractFactory("Token");
    this.accountingToken = await TokenContract.connect(accounts[0]).deploy();

    const MarketGetterContract = await ethers.getContractFactory("MarketGetter");
    this.marketGetter = await MarketGetterContract.deploy();

    for (let i = 0; i < 15; i++) {
      await this.accountingToken.connect(accounts[i]).loadMore();
      const balance = await this.accountingToken.balanceOf(accounts[i].address);
      console.log("Balance of " + accounts[i].address + " is " + balance)
    }
  });
  it('Deploy a new market', async function() {
    let marketCount = await this.MarketFactory.getMarketsCount();
    console.log("Market count is: " + marketCount);
    await this.MarketFactory.connect(accounts[0]).addMarket(this.accountingToken.address, addressUniswapV2Pair, period*3600, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax, true);
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
    startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));

    let allowance1 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    console.log(colors.green("Allowance before is: " + allowance1.toString())); 

    const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address, frameKey, winningPairPrice, ethers.utils.parseEther('10')));

    console.info("Amount to approve is: " + lotPrice);




    await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);

    let allowance2 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    console.log(colors.green("Allowance after is: " + allowance2));
});
it('Buy lot', async function() {
    let b1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b1));

    console.log("FrameKey: " + frameKey);

    await this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'));

    let b2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    console.log(colors.green("Balance of user is: " + b2));
});
it('Approve lot purchase for 1st user frame now', async function() {
    frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);

    let blockNum1 = await ethers.provider.getBlockNumber();
    let blockInfo1 = await ethers.provider.getBlock(blockNum1);
    let bTime = new Date(blockInfo1.timestamp*1000);

    console.log(colors.bgWhite("Block time is: " + bTime))

    let timestamp = (Date.now() / 1000 | 0);
    console.log("Time of lot purchase: " + timestamp);
    timestamp = timestamp | 1000 | 0;
    console.log("Timestamp in seconds: " + timestamp);

    let blockFrameKey = await this.market.connect(accounts[1]).clcFrameTimestamp(blockInfo1.timestamp);
    let inputFrameKey = await this.market.connect(accounts[1]).clcFrameTimestamp(timestamp);
    console.log("Block frame is: " + blockFrameKey);
    console.log("Input frame is: " + inputFrameKey);

    let inputFrameKeySecond = await this.market.connect(accounts[1]).clcFrameTimestamp(inputFrameKey);
    console.log("Second calculation: " + inputFrameKeySecond);


    // let allowance1 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    // console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address,inputFrameKey, winningPairPrice, ethers.utils.parseEther('10')));

    // console.info("Amount to approve is: " + lotPrice);
    await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);

    // let allowance2 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    // console.log(colors.green("Allowance after is: " + allowance2));
});
it('Buy lot frame now', async function() {
    // let b1 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    // console.log(colors.green("Balance of user is: " + b1));

    let blockNum1 = await ethers.provider.getBlockNumber();
    let blockInfo1 = await ethers.provider.getBlock(blockNum1);

    let timestamp = (Date.now() / 1000 | 0);
    console.log("Time of lot purchase: " + timestamp);
    timestamp = timestamp | 1000 | 0;
    console.log("Timestamp in seconds: " + timestamp);

    //let buyTx = await this.market.connect(accounts[1]).buyLot(timestamp, winningPairPrice, ethers.utils.parseEther('10'));
    //console.log(buyTx);

    

    await expect(this.market.connect(accounts[1]).buyLot(timestamp, winningPairPrice, ethers.utils.parseEther('10')))
      .to.emit(this.market, "LotUpdate");
    // let b2 = ethers.BigNumber.from(await this.accountingToken.balanceOf(accounts[1].address));
    // console.log(colors.green("Balance of user is: " + b2));
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

    lotKey = await this.market.clcLotKey(winningPairPrice);
    console.log("LotKey: " + lotKey);
    let lot = await this.market.getLot(frameKey, lotKey);
    let price = ethers.utils.formatEther(lot.acquisitionPrice, 'ether');
    assert.equal(price, 7);
});
it('Owners sets the price back to a higher value', async function() {
    let allowance1 = await this.accountingToken.allowance(accounts[1].address, this.market.address);
    console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApproveForUpdate(this.market.address, frameKey, winningPairPrice, ethers.utils.parseEther('15')));

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

    lotKey = await this.market.clcLotKey(winningPairPrice);
    let lot = await this.market.getLot(frameKey, lotKey);
    let price = ethers.utils.formatEther(lot.acquisitionPrice, 'ether');
    assert.equal(price, 15);
});
it('Second account buys the same lot 1d later', async function() {
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");
    let allowance1 = await this.accountingToken.allowance(accounts[2].address, this.market.address);
    console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address,frameKey, winningPairPrice, ethers.utils.parseEther('15')));

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
//     for (i=5; i<8; i++) {
//         const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address,((Date.now() / 1000 | 0)+(86400*i)), 6346134345, ethers.utils.parseEther('100')));
//         await this.accountingToken.connect(accounts[5]).approve(this.market.address, lotPrice);
//         await this.market.connect(accounts[5]).buyLot(((Date.now() / 1000 | 0)+(86400*i)), 6346134345, ethers.utils.parseEther('100'));
//     }

//     let numOfFrames = await this.market.connect(accounts[5]).getNumOfUserFrames(accounts[5].address);
//     //console.log(Number(numOfFrames));
//     let frames = [];
//     /* for(let k=0; k<=Number(numOfFrames)-1; k++) frames[k] = await this.market.userFrames(accounts[5].address, k);
//     console.log(colors.cyan(accounts[5].address + ' frames: ' + frames)); */
//     await this.market.getUserFrames(accounts[5].address);
//     console.log(colors.cyan(accounts[5].address + ' frames: ' + frames)); 

// });
it('Accounts buy non-winning lots', async function() {
    for (i=0; i<4; i++) {
        let priceRange = 6346134345+i*dPrice;
        const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address,frameKey, priceRange, ethers.utils.parseEther('100')));
        await this.accountingToken.connect(accounts[i]).approve(this.market.address, lotPrice);
        await this.market.connect(accounts[i]).buyLot(frameKey, priceRange, ethers.utils.parseEther('100'));
    }

    let reward = ethers.utils.formatEther(await this.marketGetter.getRewardAmount(this.market.address, frameKey));
    console.log(colors.bgYellow('Current reward fund is equal to: ' + reward + ' DAI'));
});
it('Get user lots', async function() { 

    await this.accountingToken.connect(accounts[2]).loadMore();
    let priceRange = 634613433453545+i*dPrice;
    const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address,frameKey, priceRange, ethers.utils.parseEther('10')));
    await this.accountingToken.connect(accounts[2]).approve(this.market.address, lotPrice);
    await this.market.connect(accounts[2]).buyLot(frameKey, priceRange, ethers.utils.parseEther('10'));

    let blockNum = await ethers.provider.getBlockNumber();
    let blockInfo = await ethers.provider.getBlock(blockNum);
    let currentFrame = await this.market.clcFrameTimestamp(blockInfo.timestamp);
    
    let lots = await this.marketGetter.getLotsUser(this.market.address, accounts[2].address, 0, currentFrame, frameKey, 0, 2);

    console.log(lots);
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

      //MANUAL
      //await this.market.connect(accounts[0]).updateFramePrices(priceAccu);
      //UNISWAP PRICES
      await this.market.connect(accounts[0]).updateFramePrices();

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
// it('should close frame', async function() {
//     await this.market.connect(accounts[0]).closeFrame(frameKey);
//     let frame = await this.market.frames(frameKey);
//     console.log(colors.bgWhite("Average price is: " + frame.priceAverage));
//     assert.equal(frame.state, 2);
// });
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
    let reward = ethers.utils.formatEther(frame.rewardFund);
    console.log(colors.bgYellow('Current reward fund is equal to: ' + reward + ' DAI'));

    //console.log("Time it took to run all test:" + (timeEnd - timeStart));

    console.log(colors.bgWhite("Average price is: " + frame.priceAverage));
    //assert.equal(frame.state, 2);
    
    assert.equal(frame.rewardFund.toString(), userBDiff.toString());
  
});
// it('Get frame prices', async function() {
//     let price = await this.market.getFramePrice(frameKey);
//     console.log("prices: " + price);
// });
it('Get frame average price', async function() {
    let frame = await this.market.frames(frameKey);
    console.log(colors.bgWhite("Average price is: " + frame.priceAverage));
});
it('Get lot owner', async function() {
    let lotKey = await this.market.clcLotKey(winningPairPrice);
    let lot = await this.market.lots(frameKey, lotKey);
    console.log(colors.bgGreen("Owner of " + lot.lotKey + " lot is: " + lot.lotOwner));

    let avgPrice = await this.marketGetter.clcPrice(this.market.address, frameKey);
    let lotKey2 = await this.market.clcLotKey(avgPrice);
    console.log(colors.bgGreen("Lot key from average price: " + lotKey2));

});
it('Call calculate price', async function() {
    console.log("FrameKey: " + frameKey);
    let frame = await this.market.frames(frameKey);
    console.log(colors.bgWhite("Average price is: " + frame.priceAverage));
    let avgPrice = await this.marketGetter.clcPrice(this.market.address, frameKey);
    console.log(avgPrice.toString());

    assert.equal(frame.priceAverage.toString(), avgPrice.toString());
});
it('Change avg price function', async function() {
    let frame = await this.market.frames(frameKey);
    console.log(colors.gray("Average before price is: " + frame.priceAverage));
    await this.market.UpdateAvgPrice(frameKey, 123456789);
    frame = await this.market.frames(frameKey);
    console.log(colors.white("Average price after is: " + frame.priceAverage));
}); 
it('Get frames ', async function() {
    let blockNum = await ethers.provider.getBlockNumber();
    let blockInfo = await ethers.provider.getBlock(blockNum);
    let currentFrame = await this.market.clcFrameTimestamp(blockInfo.timestamp);
    let frames = [];
    frames = await this.marketGetter.getFrames(this.market.address, startframe,currentFrame, 0, 3);
    console.log(frames);
}); 
it('Get frames User ', async function() {
    let blockNum = await ethers.provider.getBlockNumber();
    let blockInfo = await ethers.provider.getBlock(blockNum);
    let currentFrame = await this.market.clcFrameTimestamp(blockInfo.timestamp);
    let frames = [];
    frames = await this.marketGetter.getFramesUser(this.market.address, accounts[2].address, startframe,currentFrame, 0, 2);
    console.log(frames);
}); 
it('Get Lots ', async function() {
    let blockNum = await ethers.provider.getBlockNumber();
    let blockInfo = await ethers.provider.getBlock(blockNum);
    let currentFrame = await this.market.clcFrameTimestamp(blockInfo.timestamp);
    let lots = [];
    lots = await this.marketGetter.getLots(this.market.address, startframe,currentFrame, 0, 5);
    console.log(lots);
}); 
  

});