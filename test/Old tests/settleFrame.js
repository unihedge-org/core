const {expect} = require("chai");
const {ethers} = require("hardhat");
const colors = require('colors');
const {Route, Trade, TokenAmount, TradeType} = require('@uniswap/sdk');
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');
const { time } =  require("@nomicfoundation/hardhat-network-helpers");

describe("Testing market contract", function () {
    let swapRouter, owner, daiContract, wMaticContract;
    const uniswapPoolAddressWETHDai = "0x67a9FE12fa6082D9D0203c84C6c56D3c4B269F28"; // Uniswap pool address
    const uniswapPoolAddressWMaticDai = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
    const uniswapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap router address
    const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
    const wMaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"// Correct DAI address needed
    let contractMarket={};
    let contractMarketGetter={};
    let accountingToken={};
    const winningPairPrice = ethers.BigNumber.from('3471674728396359164646'); //IF block 54813088
    //Define dPrice as an emty big number
    var dPrice = ethers.BigNumber.from('0');
    var frameKey = 0;

    before(async function () {
        [owner] = await ethers.getSigners();
        accounts = await ethers.getSigners();
        // Setup or get existing contracts here, if necessary
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564", owner);
        contractTokenDai = await ethers.getContractAt(IERC20.abi, "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", owner);
        contractTokenWMatic = await ethers.getContractAt(IERC20.abi, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", owner);

        const TokenContract = await ethers.getContractFactory("Token");
        accountingToken = await TokenContract.connect(accounts[0]).deploy();

        const MarketGetterContract = await ethers.getContractFactory("MarketGetter");
        contractMarketGetter = await MarketGetterContract.deploy();
    });


    it("Deploy Market contract", async function () {
        const Market = await ethers.getContractFactory("Market");
        contractMarket = await Market.connect(accounts[0]).deploy();
        //Log contract address in green with tab before
        expect(await contractMarket.owner()).to.equal(owner.address);
        //Get current block number

        //load await contractMarket.dPrice(); in to dPrice as a big number
        dPrice = await contractMarket.dPrice();
        console.log("dPrice is: ", dPrice.toString());

        let addressOwner = await contractMarket.owner();
        console.log("Owner is: ", addressOwner.toString());
    });
        
    it('Swap WMatic for DAI for users', async () => {
        for (let i = 0; i < 6; i++) {
        const params = {
            tokenIn: contractTokenWMatic.address,
            tokenOut: contractTokenDai.address,
            fee: 3000,
            recipient: accounts[i].address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 10,
            amountIn: ethers.utils.parseEther("1000"),
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0,
        };
        let tx = await contractSwapRouter.connect(accounts[i]).exactInputSingle(params, {value: params.amountIn});
        await tx.wait();
        const daiBalanceAfterSwap = await contractTokenDai.connect(accounts[i]).balanceOf(accounts[i].address);
        console.log("User ", i, " DAI balance after swap: ", daiBalanceAfterSwap.toString());
        expect(daiBalanceAfterSwap).to.be.gt(1);
        }
    });

    it("Users buy multiple lots in a frame", async function () {
        //timestamp 3 days in the future
        let timestamp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3;
        frameKey = await contractMarket.clcFrameKey(timestamp);

        for (let i = 0; i < 3; i++) {
            let lotKey = await contractMarket.clcLotKey(winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(i))));
            let acquisitionPrice = ethers.utils.parseUnits("10", 18); // DAI
            let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[i]).clcAmountToApprove(contractMarket.address, frameKey, lotKey, acquisitionPrice));
            let block = await ethers.provider.getBlock('latest');
            await contractTokenDai.connect(accounts[i]).approve(contractMarket.address, lotPrice);           
            console.log("User ", i, " buys lot", lotKey.toString(), " in frame", frameKey.toString());
            await contractMarket.connect(accounts[i]).tradeLot(frameKey, lotKey, acquisitionPrice);
            
        }

        //Tax on first lot
        //57.870.370.370,37037037037037037037
        //1.025.469
        //593.442.708.333.333.333,33333333333333

        //Users buy lots of from each other
        for (let i = 0; i < 3; i++) {
            let lotKey = await contractMarket.clcLotKey(winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(2-i))));
            let acquisitionPrice = ethers.utils.parseUnits("10", 18); // DAI
            let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[i]).clcAmountToApprove(contractMarket.address, frameKey, lotKey, acquisitionPrice));
            
            await contractTokenDai.connect(accounts[i]).approve(contractMarket.address, lotPrice);           
            console.log("User ", i, " buys lot", lotKey.toString(), " in frame", frameKey.toString());
            await contractMarket.connect(accounts[i]).tradeLot(frameKey, lotKey, acquisitionPrice);
        }

        let lotKey = await contractMarket.clcLotKey(winningPairPrice);
        let lot = await contractMarketGetter.connect(accounts[2]).getLotStruct(contractMarket.address, frameKey, lotKey);
        //Get lots of the frame with getLots function in MarketGetter contract
        //Start timestamp is now
        // let frameKeyStart = await contractMarket.clcFrameKey(Math.floor(Date.now() / 1000));
        // let frameKeyEnd = await contractMarket.clcFrameKey(frameKey + 60 * 60 * 24 * 1);
        // let lots = await contractMarketGetter.connect(accounts[0]).getLots(contractMarket.address, frameKeyStart, frameKeyEnd, 0, 30);

        //filter out non empty lots
        // lots = lots.filter(lot => lot.amount.gt(0));

        //Expect user 6 to be the winner's lot owner
        let owner = lot[2][lot[2].length - 1][2];

        expect(owner).to.equal(accounts[2].address);

    });
    it("Fast forward time", async function () {
        await time.increaseTo(frameKey);
        await time.increase(86400);
    });
    it("Users settles frame", async function () {
        //Get user 5's balance before settlement
        let balanceBefore = await contractTokenDai.balanceOf(accounts[2].address);
        let balanceBeforeOwner = await contractTokenDai.balanceOf(owner.address);
        await contractMarket.connect(accounts[0]).setFrameRate(frameKey);
        await contractMarket.connect(accounts[1]).settleFrame(frameKey);
        //get frame struct
        let frame = await contractMarketGetter.connect(accounts[0]).getFrameStruct(contractMarket.address, frameKey);
        
        expect(frame[3]).to.equal(accounts[2].address);
        let awardAmount = ethers.BigNumber.from(frame[6]);
        //Convert award amount to ETH
        
        console.log("Award amount in DAI: ", ethers.utils.formatEther(awardAmount.toString()));
        let balanceAfter = await contractTokenDai.balanceOf(accounts[2].address);
        expect(balanceAfter).to.equal(balanceBefore.add(awardAmount));

        let balanceAfterOwner = await contractTokenDai.balanceOf(owner.address);
        let difference = balanceAfterOwner.sub(balanceBeforeOwner);
        console.log("Owner DAI: ", ethers.utils.formatEther(difference.toString()));
    }); 

});
