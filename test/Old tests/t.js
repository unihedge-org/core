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
                 
//----------------------------------------------------------------------

//TODO: add assert,expect... statements to each test parcel

contract("UniHedge", async accounts => {

    describe("Testing functionality of Unihedge protocol", function() {
        before(async function() {


            this.token = await Token.new("UniHedgeToken", "UNH", new BigN('100e18'), {from: accounts[0]});
            for (let i = 0; i < n; i++) {
                await this.token.loadMore({from: accounts[i]})
            }
            

        });
});
});