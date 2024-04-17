import { expect } from "chai";
import pkg from 'hardhat';
const { ethers } = pkg;
import IERC20 from '@openzeppelin/contracts/build/contracts/ERC20.json' assert { type: 'json' };
import ISwapRouter from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json' assert { type: 'json' };
import { time } from "@nomicfoundation/hardhat-network-helpers";


describe("Testing market contract", function () {
    let swapRouter, owner , frameKey, startframe;
    let accounts = [];
    const uniswapPoolAddressWETHDai = "0x67a9FE12fa6082D9D0203c84C6c56D3c4B269F28"; // Uniswap pool address
    const uniswapPoolAddressWMaticDai = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
    const uniswapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap router address
    const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
    const wMaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"// Correct DAI address needed
    let contractMarket={};
    let contractMarketGetter={};
    let contractSwapRouter={};
    let contractTokenDai={};
    let contractTokenWMatic={};
    var winningPairPrice;
    //Define dPrice as an emty big number
    let dPrice = ethers.BigNumber.from('0');

    before(async function () {
        [owner] = await ethers.getSigners();
        accounts = await ethers.getSigners();
        // Setup or get existing contracts here, if necessary
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564", owner);
        contractTokenDai = await ethers.getContractAt(IERC20.abi, "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", owner);
        contractTokenWMatic = await ethers.getContractAt(IERC20.abi, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", owner);

        const MarketGetterContract = await ethers.getContractFactory("MarketGetter");
        contractMarketGetter = await MarketGetterContract.deploy();
    });


    it("Deploy Market contract", async function () {
        const Market = await ethers.getContractFactory("Market");
        contractMarket = await Market.deploy();
        //Log contract address in green with tab before
        expect(await contractMarket.owner()).to.equal(owner.address);
        //Get current block number

        //load await contractMarket.dPrice(); in to dPrice as a big number
        dPrice = await contractMarket.dPrice();
        console.log("dPrice is: ", dPrice.toString());

        winningPairPrice = await contractMarket.clcRate();
    });
       
    it('calculate rate of frame 1712678400', async function() {
        let frameKey = 1712678400;
        await contractMarket.setFrameRate(frameKey);
        
        //Get frame struct
        let frame = await contractMarketGetter.getFrameStruct(contractMarket.address, frameKey);
        console.log("Frame rate is: ", frame[1].toString());
    });

});
