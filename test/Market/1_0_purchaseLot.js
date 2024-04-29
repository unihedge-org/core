const {expect} = require("chai");
const {ethers} = require("hardhat");
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');
const fs = require('fs');

const {swapTokenForUsers} = require("../Helpers/TokenFunctions.js");



describe("Purchase one random empty lot", function () {
    let accounts, owner, daiContract, wMaticContract, contractMarket, contractMarketGetter, swapRouter;
    const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
    const wMaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"// Correct DAI address needed
    const uniswapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap router address
    let dPrice;

    let winningPairPrice = 0;

    before(async function () {
        accounts = await ethers.getSigners();
        owner = accounts[0];

        //Contracts are loaded from addresses
        daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
        wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);    
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564", owner);
        
        //users, tokenIn, tokenOut, amountInEther, contractSwapRouter
        await swapTokenForUsers(accounts.slice(0,5),wMaticContract, daiContract, 10, contractSwapRouter);
        //Check if DAI balance is greater than 0
        let balance = await daiContract.balanceOf(owner.address);
        console.log("\x1b[33m%s\x1b[0m", "   DAI balance: ", ethers.utils.formatUnits(balance, 18), " DAI");
        expect(balance).to.be.gt(0);
    });
    it('Deploy Market contract', async function () {
        const Market = await ethers.getContractFactory("Market");
        contractMarket = await Market.deploy();
        //Expect owner to be first account
        expect(await contractMarket.owner()).to.equal(accounts[0].address);
        //Expect period to be 1 day in seconds
        expect(await contractMarket.period()).to.equal(86400);
    });
    it("Get current price of market", async function () {
        winningPairPrice = Number(await contractMarket.connect(accounts[0]).clcRate());
        expect(winningPairPrice).to.be.gt(0);
        //Console in blue with two tabs price in blue
        console.log("\x1b[36m%s\x1b[0m", "   Current rate: ", winningPairPrice);
    });

})

