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
    }

    await this.MarketFactory.connect(accounts[0]).addMarket(this.accountingToken.address, addressUniswapV2Pair, period*3600, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax);
    var marketKey = await this.MarketFactory.marketsKeys(0);
    let address = await this.MarketFactory.markets(marketKey);
    const MarketContract = await ethers.getContractFactory("Market");
    this.market = await MarketContract.attach(address);

    frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
    lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[1]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('10')));
    await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);
    await this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'));
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");
    await this.market.connect(accounts[1]).updateLotPrice(frameKey, winningPairPrice, ethers.utils.parseEther('7'));
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");
    lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[2]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('15')));
    await this.accountingToken.connect(accounts[2]).approve(this.market.address, lotPrice);
    await this.market.connect(accounts[2]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('15'));
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");
    for (i=0; i<4; i++) {
        let priceRange = 6346134345+i*dPrice;
        let loP = ethers.BigNumber.from(await this.market.connect(accounts[2]).clcAmountToApprove(frameKey, priceRange, ethers.utils.parseEther('100')));
        await this.accountingToken.connect(accounts[i]).approve(this.market.address, lotPrice);
        await this.market.connect(accounts[i]).buyLot(frameKey, priceRange, ethers.utils.parseEther('100'));
    }
  });
it('Cant create/open a frame in the past', async function() {
    await expect(this.market.connect(accounts[1]).getOrCreateFrame( (Date.now() / 1000 | 0) - 3600  )).to.be.revertedWith(
        "CAN'T CREATE FRAME IN PAST"
      );
});
it('Cant calculate frame price before reporting phase starts', async function() {
    await expect(this.market.connect(accounts[1]).clcPrice(frameKey)).to.be.revertedWith(
        "INVALID FRAME PRICE"
      );
});
it('User is not able to buy a lot he already owns', async function() {
    let approveAmount = ethers.BigNumber.from(await this.market.connect(accounts[2]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('10')));
    await this.accountingToken.connect(accounts[2]).approve(this.market.address, approveAmount);
    await expect(this.market.connect(accounts[2]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'))).to.be.revertedWith(
        "ADDRESS ALREADY OWNS THE PARCEL"
      );
});
it('User is not able to change price of a lot he doesnt own', async function() {
    await expect(this.market.connect(accounts[1]).updateLotPrice(frameKey, winningPairPrice, ethers.utils.parseEther('7'))).to.be.revertedWith(
        "MUST BE LOT OWNER"
      );
});
it('User is not able to buy a lot if he doesnt have enough funds approved for transfer', async function() {
    let approveAmount = ethers.BigNumber.from(await this.market.connect(accounts[1]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('5')));
    await this.accountingToken.connect(accounts[1]).approve(this.market.address, approveAmount);
    await expect(this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'))).to.be.revertedWith(
        "APPROVED AMOUNT IS TOO SMALL"
      );
});
it('Cant close frame bofore end time is reached', async function() {
    let secToSKip = (period * 3600 * 2) + (3600*20);
        await ethers.provider.send("evm_increaseTime", [secToSKip]);
        await ethers.provider.send("evm_mine");

        let tts= 4;
        for(let i=0;i<tts;i++){
        await ethers.provider.send("evm_increaseTime", [1800]);
        await ethers.provider.send("evm_mine");
        let startPirceAccu = ethers.BigNumber.from("351376658422403395211142728202634126243");
        let priceAccu = startPirceAccu.add(ethers.BigNumber.from("10000000")).mul(i+1);
        await this.market.connect(accounts[0]).updateFramePrices(priceAccu);
    }   

    await expect(this.market.connect(accounts[1]).claimReward(frameKey)).to.be.revertedWith(
        "FRAME END TIME NOT REACHED"
    );
});
describe("Frame reaches end time", function() {
    before(async function() {

        let tts= 1;
        for(let i=0;i<tts;i++){
        await ethers.provider.send("evm_increaseTime", [1800]);
        await ethers.provider.send("evm_mine");
        let startPirceAccu = ethers.BigNumber.from("351376658422403395211142728202634126243");
        let priceAccu = startPirceAccu.add(ethers.BigNumber.from("10000000")).mul(i+1);
        await this.market.connect(accounts[0]).updateFramePrices(priceAccu);
    }        
    });

    it('Only winner should be able to claim the reward', async function() {
        await expect(this.market.connect(accounts[1]).claimReward(frameKey)).to.be.revertedWith(
            "YOU DO NOT OWN THE WINNING LOT!"
        );
    });
    it('Its not possible to calculate price of a lot in the past', async function() {
        await expect(this.market.connect(accounts[1]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('10'))).to.be.revertedWith(
            "THIS LOT IS IN A PAST FRAME"
        );
    });
    it('Its not possible to buy a lot from a closed frame', async function() {
        // lotPrice = ethers.BigNumber.from(await this.market.connect(accounts[1]).clcAmountToApprove(frameKey, winningPairPrice, ethers.utils.parseEther('10')));
        // await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);
        await expect(this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'))).to.be.revertedWith(
            "CAN'T BUY A LOT FROM THE PAST"
        );
    });
    it('Its not possible to change lot price from a closed frame', async function() {
        await expect(this.market.connect(accounts[2]).updateLotPrice(frameKey, winningPairPrice, ethers.utils.parseEther('7'))).to.be.revertedWith(
            "THIS LOT IS IN A TIME FRAME FROM THE PAST"
        );
    });

});


});