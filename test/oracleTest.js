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
const contractPriceOracle = artifacts.require("./priceOracles.sol");
const contractToken = artifacts.require("@openzeppelin/contracts/token/ERC20/ERC20.sol");
const contractUniswapV2Factory = artifacts.require("@uniswap/v2-core/contracts/UniswapV2Factory.sol");
const conatractUniswapV2Pair = artifacts.require("@uniswap/v2-core/contracts/UniswapV2Pair.sol");
const contractUniswapV2Router02 = artifacts.require("@uniswap/v2-periphery/contracts/UniswapV2Router02.sol");

//xDai contract addresses
let addressUniswapV2Factory = "0xA818b4F111Ccac7AA31D0BCc0806d64F2E0737D7";
let addressUniswapV2Pair = "0xd12A728a25FCEbaa5c014952C147f613B8e1d409";
let addressTokenAGAVE = "0x3a97704a1b25F08aa230ae53B352e2e72ef52843";
let addressToken1INCH = "0x7f7440C5098462f833E123B44B8A03E1d9785BAb";
let addressUniswapV2Router02 = "0x1C232F01118CB8B424793ae03F870aa7D0ac7f77";


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
const winningPairPrice = 19211498376;
const minTax = 77677;
                 
//----------------------------------------------------------------------

//TODO: add assert,expect... statements to each test parcel

contract("UniHedge", async accounts => {

    describe("Testing functionality of Unihedge protocol", function() {
        before(async function() {
            //Deploy market factory

            //Import deployed contracts
            //this.MarketFactory = await contractMarketFactory.at(addressMarketFactory);
            //this.token = await contractToken.at(addressTokenDAI);
            this.UniswapV2Factory = await contractUniswapV2Factory.at(addressUniswapV2Factory);
            this.UniswapV2Pair = await conatractUniswapV2Pair.at(addressUniswapV2Pair);
            this.UniswapV2Router02 = await contractUniswapV2Router02.at(addressUniswapV2Router02);     
            this.priceOracle = await contractPriceOracle.new({from: accounts[0]});       

        });
    describe("Get values from the oracle", function() {
        it('Get prices', async function() {
            let data = [];
            data = await this.priceOracle.getOracleAccPrice(addressUniswapV2Pair);
            console.log(data);
        });

        /*
        p1:5546414966556586794191098779672655781969825
        t1:1630096980

        p2:5547466601513579839092797723255913917397500
        t2:1630099797

        p3:5578314933569386115046680863161973379518575
        t3:1630182430
        */
        it('Get average price', async function() {
            let price;
            data = await this.priceOracle.clcAveragePrice( new BigN('5546414966556586794191098779672655781969825'),  new BigN('1630096980'), new BigN('5578314933569386115046680863161973379518575'), new BigN('1630182430'));
            console.log(data.toString());
        });

    });
});
});