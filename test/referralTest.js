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
const dPrice = 10000000000000;
const tReporting = 3600;
const winningPairPrice = ethers.BigNumber.from('2108000000000000000000000000');
const minTax = 77677; 
let frameKey; 
let lotKey;          
let startframe;  
//----------------------------------------------------------------------

let timeStart = Date.now() / 1000 | 0;
let timeEnd = 0;


describe("Referral Test", function () {
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
it('Approve and buy for 1st user', async function() { 
    frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
    startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
    const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[1]).clcAmountToApprove(this.market.address, frameKey, winningPairPrice, ethers.utils.parseEther('10')));
    await this.accountingToken.connect(accounts[1]).approve(this.market.address, lotPrice);

    await this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'), ethers.constants.AddressZero);
    const balance = await this.accountingToken.balanceOf(accounts[1].address);

    // expect(balance).to.equal(ethers.utils.parseEther('yy'));
});
it('Shouldn\'t be able to add a referral key of a user that hasn\'t bought a lot', async function() {
  await expect(this.market.connect(accounts[1]).buyLot(frameKey, winningPairPrice, ethers.utils.parseEther('10'), accounts[2].address)).to.be.revertedWith("R4");
});
it('Second account buys a lot and adds 1st account as a referral', async function() {
  let pairPrice = dPrice*100;
  frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
  startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
  const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[2]).clcAmountToApprove(this.market.address, frameKey, pairPrice, ethers.utils.parseEther('10')));

  await this.accountingToken.connect(accounts[2]).approve(this.market.address, lotPrice);

  await this.market.connect(accounts[2]).buyLot(frameKey, pairPrice, ethers.utils.parseEther('10'), accounts[1].address);

  // console.log(users)
  //Find user with public address of accounts[1].address
  let user =  await this.marketGetter.getUserStruct(this.market.address, accounts[2].address)
  // console.log(user)
  expect(user.referredBy).to.equal(accounts[1].address);
});

it('First account should have second acc in referrals array', async function() {
  let user = await this.marketGetter.getUserStruct(this.market.address, accounts[1].address);
  // console.log(user)
  expect(user.referrals[0]).to.equal(accounts[2].address);
});
it('Shuoldn\'t be able to add a referral key of a user that has already been added', async function() {
  let pairPrice = dPrice*101;
  frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
  startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
  const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[2]).clcAmountToApprove(this.market.address, frameKey, pairPrice, ethers.utils.parseEther('10')));

  await this.accountingToken.connect(accounts[2]).approve(this.market.address, lotPrice);

  await this.market.connect(accounts[2]).buyLot(frameKey, pairPrice, ethers.utils.parseEther('10'), accounts[1].address);

  let user = await this.marketGetter.getUserStruct(this.market.address, accounts[1].address)
  
  expect(user.referrals.length).to.equal(1);

});
it('Shuoldn\'t be able to add yourself as a referral', async function() {
  let pairPrice = dPrice*101;
  frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
  startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
  const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[3]).clcAmountToApprove(this.market.address, frameKey, pairPrice, ethers.utils.parseEther('10')));

  await this.accountingToken.connect(accounts[3]).approve(this.market.address, lotPrice);

  await expect(this.market.connect(accounts[3]).buyLot(frameKey, pairPrice, ethers.utils.parseEther('10'), accounts[3].address)).to.be.revertedWith("R4");
});
it('Third account buys a lot and adds 1st account as a referral', async function() {
  let pairPrice = dPrice*103;
  frameKey = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0)+270000);
  startframe = await this.market.clcFrameTimestamp((Date.now() / 1000 | 0));
  const lotPrice = ethers.BigNumber.from(await this.marketGetter.connect(accounts[3]).clcAmountToApprove(this.market.address, frameKey, pairPrice, ethers.utils.parseEther('10')));

  await this.accountingToken.connect(accounts[3]).approve(this.market.address, lotPrice);

  await this.market.connect(accounts[3]).buyLot(frameKey, pairPrice, ethers.utils.parseEther('10'), accounts[1].address);

  let user = await this.marketGetter.getUserStruct(this.market.address, accounts[3].address)

  expect(user.referredBy).to.equal(accounts[1].address);

});
it('Third account shuold have two users in referrals array', async function() {
  // console.log(users)
  //Find user with public address of accounts[1].address
  let user = await this.marketGetter.getUserStruct(this.market.address, accounts[3].address)

  expect(user.referredBy).to.equal(accounts[1].address);

});
it('Get 2 of 3 usrs structs', async function() {
  // console.log(users)
  //Find user with public address of accounts[1].address
  let users = await this.marketGetter.getUserStructs(this.market.address, 2, 0)
  console.log(JSON.stringify(users, null, 2)); 

  expect(users.length).to.equal(2);

});

});