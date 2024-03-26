const {expect} = require("chai");
const {ethers} = require("hardhat");
const {Route, Trade, TokenAmount, TradeType} = require('@uniswap/sdk');
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');

describe("Several rate test calculations", function () {
    let swapRouter, owner, daiContract, wMaticContract;
    const uniswapPoolAddressWETHDai = "0x67a9FE12fa6082D9D0203c84C6c56D3c4B269F28"; // Uniswap pool address
    const uniswapPoolAddressWMaticDai = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
    const uniswapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap router address
    const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
    const wMaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"// Correct DAI address needed
    let contractMarket={};

    before(async function () {
        [owner] = await ethers.getSigners();
        accounts = await ethers.getSigners();
        // Setup or get existing contracts here, if necessary
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
        wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);

        const TokenContract = await ethers.getContractFactory("Token");
        accountingToken = await TokenContract.connect(accounts[0]).deploy();

    });


    it("Deploy Market contract", async function () {
        const Market = await ethers.getContractFactory("Market");
        contractMarket = await Market.deploy(accountingToken.address);
        //Log contract address in green with tab before
        expect(await contractMarket.owner()).to.equal(owner.address);
        //Get current block number

    });

    // it("Get current price at block 54098710+1(deploy Market)", async function () {
    //     //Log timestamp in blue with tab before
    //     const price = await contractMarket.clcRate();
    //     //Log price in blue with tab before

    //     console.log("\x1b[36m%s\x1b[0m", "   Current rate: ", price);
    //     //Log current block number in blue with tab before
    //     // console.log("\x1b[36m%s\x1b[0m", "   Current block number: ", await ethers.provider.getBlockNumber());
    //     expect(price).to.be.eq(3472003290074320435545n);
    // });

    it("Get average price from 2024-02-29 00:00:00 to 2024-02-29 00:10:00 (1709161800)", async function () {
        //Fork Date 1709207880 is 2024-02-29 11:58:00
        //End Date 1709165400 is 2024-02-29 00:10:00
        const timestamp = 1709165400;
        const rateAvg = await contractMarket.clcRateAvg(timestamp);
        //Log price in blue with tab before
        console.log("\x1b[36m%s\x1b[0m", "   Average rate: ", rateAvg);
        expect(rateAvg).to.be.eq(3375145782133435994687n);
    });


});
