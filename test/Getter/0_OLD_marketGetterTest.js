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
    const winningPairPrice = ethers.BigNumber.from('3471674728396359164646');
    //Define dPrice as an emty big number
    let dPrice = ethers.BigNumber.from('0');
    const startTimestamp = new Date().getTime() / 1000;

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
        contractMarket = await Market.connect(owner).deploy();
        //Log contract address in green with tab before
        expect(await contractMarket.owner()).to.equal(owner.address);
        //Get current block number

        //load await contractMarket.dPrice(); in to dPrice as a big number
        dPrice = await contractMarket.dPrice();
        console.log("dPrice is: ", dPrice.toString());
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


    it('Approve lot purchase for 1st user', async function() { 
        frameKey = await contractMarket.clcFrameKey((Date.now() / 1000 | 0)+270000);
        startframe = await contractMarket.clcFrameKey((Date.now() / 1000 | 0));
    
        let allowance1 = await contractTokenDai.allowance(accounts[1].address, contractMarket.address);
        console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    
        const lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[1]).clcAmountToApprove(contractMarket.address, frameKey, winningPairPrice, ethers.utils.parseEther('1')));
    
        console.info("Amount to approve is: " + lotPrice);
    
        await contractTokenDai.connect(accounts[1]).approve(contractMarket.address, lotPrice);
    
        let allowance2 = await contractTokenDai.allowance(accounts[1].address, contractMarket.address);
        console.log(colors.green("Allowance after is: " + allowance2));
    });
    it('1st user buys a lot', async function() {
        let startingBalance = await contractTokenDai.balanceOf(accounts[1].address);
        let allowance = await contractTokenDai.allowance(accounts[1].address, contractMarket.address);
        let lotKey = await contractMarket.clcLotKey(winningPairPrice);
        
        //print difference between starting balance and allowance and current balance
        console.log("Difference between starting balance and allowance: ", startingBalance.sub(allowance).toString());
        console.log("Starting balance: ", startingBalance.toString());
        console.log("Allowance: ", allowance.toString());
        //Current balance
        let currentBalance = await contractTokenDai.balanceOf(accounts[1].address);
        console.log("Current balance: ", currentBalance.toString());
        //Convert current balance to ether
        console.log("Current balance in ether: ", ethers.utils.formatEther(currentBalance));
        //Difference between starting balance and current balance
        console.log("Difference between starting balance and current balance: ", startingBalance.sub(currentBalance).toString());

        await contractMarket.connect(accounts[1]).tradeLot(frameKey, lotKey, ethers.utils.parseEther('1'));
        // expect(await accountingToken.balanceOf(contractMarket.address)).to.equal(1000000000000);
        
        //Expect balance to be lower by allowance
        // expect(await accountingToken.balanceOf(accounts[1].address)).to.equal(startingBalance.sub(allowance));
    });
    it('get lot struct and check price', async function() {
        let lotKey = await contractMarket.clcLotKey(winningPairPrice);
        let lot = await contractMarket.getLot(frameKey, lotKey);
        console.log(lot.toString());
        //Console log type of lot
        console.log(typeof(lot));
        //Access individual numbers of lot
        let [, , states] = lot;
        let [blockNum, BlockTimestamp, owner, acquisitionPrice, taxCharged, taxRefunded] = states[0];
        console.log("States:", states[0]);
        console.log("Owner:", owner);
        console.log("Acquisition Price:", acquisitionPrice.toString());
        console.log("Tax Charged:", taxCharged.toString());
        console.log("Tax Refunded:", taxRefunded.toString());
        //expect acquisition price to be 1000000000000
        expect(acquisitionPrice).to.equal(ethers.utils.parseEther('1.0'));
        //expect owner to be accounts[1].address
        expect(owner).to.equal(accounts[1].address);
        //expect accounts[1].address to have balance equal to 1000000000000
        
    });
    it('2nd user buys the same lot', async function() {
        let lotKey = await contractMarket.clcLotKey(winningPairPrice);
        console.log("LotKey is: ", lotKey.toString());
        //Calculate approval amount
        let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[2]).clcAmountToApprove(contractMarket.address, frameKey, winningPairPrice, ethers.utils.parseEther('1')));
        //Approve lot purchase
        console.log("Lot price is: ", lotPrice.toString());
        await contractTokenDai.connect(accounts[2]).approve(contractMarket.address, lotPrice);
        //Purchase lot
        await contractMarket.connect(accounts[2]).tradeLot(frameKey, lotKey, ethers.utils.parseEther('1'));

        let lot = await contractMarketGetter.connect(accounts[2]).getLotStruct(contractMarket.address, frameKey, lotKey);

        // console.log(lot.toString());

        let [, , states] = lot;
        console.log(states.toString());
        //Length of states
        console.log(states.length);
        let [blockNum, blockTimestamp, owner, acquisitionPrice, taxCharged, taxRefunded] = states[states.length-1];
        console.log("States:", states[0].toString());
        console.log("Owner:", owner);
        console.log("Acquisition Price:", acquisitionPrice.toString());
        console.log("Tax Charged:", taxCharged.toString());
        console.log("Tax Refunded:", taxRefunded.toString());

        //Expect acquisition price to be 1000000000000 and owner to be accounts[2].address
        expect(acquisitionPrice).to.equal(ethers.utils.parseEther('1'));
        expect(owner).to.equal(accounts[2].address);
        expect(states.length).to.equal(2);
    });
    it('Calculate reward amount of the frame', async function() {   
        let rewardAmount = await contractMarketGetter.getRewardAmount(contractMarket.address, frameKey);
        console.log("Reward amount is: ", rewardAmount.toString());
        //Parse into ether
        console.log("Reward amount in ether is: ", ethers.utils.formatEther(rewardAmount));
    });
    it("Users buy multiple lots in a frame", async function () {
        //timestamp 3 days in the future
        let timestamp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3;
        frameKey = await contractMarket.clcFrameKey(timestamp);

        //6 users buy 6 different lots in the frame
        for (let i = 0; i < 6; i++) {
            let lotKey = await contractMarket.clcLotKey(winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(i))));
            let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[i]).clcAmountToApprove(contractMarket.address, frameKey, lotKey, ethers.utils.parseEther((i+1).toString())));
            await contractTokenDai.connect(accounts[i]).approve(contractMarket.address, lotPrice);            console.log("User ", i, " buys lot", lotKey.toString(), " in frame", frameKey.toString());
            await contractMarket.connect(accounts[i]).tradeLot(frameKey, lotKey, ethers.utils.parseEther((i+1).toString()));
            
        }

        //Users buy lots of from each other
        for (let i = 0; i < 6; i++) {
            let lotKey = await contractMarket.clcLotKey(winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(5-i))));
            let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[i]).clcAmountToApprove(contractMarket.address, frameKey, lotKey, ethers.utils.parseEther((i+1).toString())));
            await contractTokenDai.connect(accounts[i]).approve(contractMarket.address, lotPrice);
            
            console.log("User ", i, " buys lot", lotKey.toString(), " in frame", frameKey.toString());
            await contractMarket.connect(accounts[i]).tradeLot(frameKey, lotKey, ethers.utils.parseEther((i+1).toString()));
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

        expect(owner).to.equal(accounts[5].address);

    });
    it('Calculate reward amount of the frame', async function() {   
        let rewardAmount = await contractMarketGetter.getRewardAmount(contractMarket.address, frameKey);
        console.log("Reward amount is: ", rewardAmount.toString());
        //Parse into ether
        console.log("Reward amount in ether is: ", ethers.utils.formatEther(rewardAmount));
    });
    it('Fast forward to frameKey to calculate frame rate', async function() {
        //get difference between frameKey and and current block timestamp
        //get current block timestamp
        let block = await ethers.provider.getBlock('latest');
        let difference = frameKey - block.timestamp;
        await time.increaseTo(frameKey);
        //Get current block timestamp
        let currentBlockTimestamp = await ethers.provider.getBlock('latest');
        console.log("Current block timestamp is: ", currentBlockTimestamp.timestamp);
        //Calculate current frameKey
        let frameKeyCurrent = await contractMarket.clcFrameKey(currentBlockTimestamp.timestamp);
        console.log("Current frameKey is: ", frameKeyCurrent.toString());
        console.log("FrameKey is: ", frameKey.toString());
        await time.increase(86400);
        await contractMarket.setFrameRate(frameKey);
        //Get frame struct
        let frame = await contractMarketGetter.getFrameStruct(contractMarket.address, frameKey);
        console.log("Frame rate is: ", frame[1].toString());
        //frame rate divided by 10^18
        console.log("Frame rate in usd is: ", ethers.utils.formatEther(frame[1]));
    });
    it('Settle frame', async function() {
        await time.increase(86400);
        //Calculate lotKey from winningPairPrice
        let lotKey = await contractMarket.clcLotKey(winningPairPrice);
        //Get lotState
        let lotState = await contractMarket.getStateLot(frameKey, lotKey);
        console.log("Lot state is: ", lotState);
        //Get state frame
        let frameState = await contractMarket.getStateFrame(frameKey);
        console.log("Frame state is: ", frameState);
        await contractMarket.settleFrame(frameKey);
        let frame = await contractMarketGetter.getFrameStruct(contractMarket.address, frameKey);
        console.log("Frame rate is: ", frame[1].toString());
        //frame rate divided by 10^18
        console.log("Frame rate in usd is: ", ethers.utils.formatEther(frame[1]));
        //Get frame winner
        console.log("Frame winner is: ", frame[3]);
        //Winner address should be accounts[1].address
        // expect(frame[3]).to.equal(accounts[2].address);
    });
    it('Get lots in a frame', async function() {
        let frameKeyStart = await contractMarket.clcFrameKey(Math.floor(Date.now() / 1000));
        let frameKeyEnd = await contractMarket.clcFrameKey(frameKey.add(60 * 60 * 24 * 1));
        let lots = await contractMarketGetter.connect(accounts[0]).getLots(contractMarket.address, frameKeyStart, frameKeyEnd, 0, 30);
        // console.log(lots);
        //Filter out non empty lots
        lotsF = lots[0].filter(lot => lot[0].gt(0))

        console.log("Num of lots", lotsF.length);
        //Expect user0 to be last lots owner
        let lotStates = lotsF[lotsF.length - 1][2];
        let lotOwner = lotStates[lotStates.length - 1][2];
        expect(lotOwner).to.equal(accounts[0].address);
    });
    it('Get open frames', async function() {
        //First user buys lots in 3 frames in the future, 3 days apart
        for (let i = 0; i < 3; i++) {
            //get current block
            let block = await ethers.provider.getBlock('latest');
            let timestamp = block.timestamp + (60 * 60 * 24 * 3 * i);
            let frameKey = await contractMarket.clcFrameKey(timestamp);
            console.log("Frame key is: ", frameKey.toString());
            let lotKey = await contractMarket.clcLotKey(winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(i))));
            let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[1]).clcAmountToApprove(contractMarket.address, frameKey, lotKey, ethers.utils.parseEther('1')));
            await contractTokenDai.connect(accounts[0]).approve(contractMarket.address, lotPrice);
            console.log("User 1 buys lot", lotKey.toString(), " in frame", frameKey.toString());
            await contractMarket.connect(accounts[0]).tradeLot(frameKey, lotKey, ethers.utils.parseEther('1'));
        }

        //Get open frames
        let startFrame = await contractMarket.clcFrameKey(Math.floor(Date.now() / 1000));
        let openFrames = await contractMarketGetter.getOpenFrameKeys(contractMarket.address, startFrame, 100);
        //Filter out non empty frames
        openFramesF = openFrames.filter(frame => frame.gt(0))
        // lotsF = lots[0].filter(lot => lot[0].gt(0))
    });
    it('Get lots user getLotsUser', async function() {
        //Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage
        let frameKeyEnd = await contractMarket.clcFrameKey(frameKey.add(60 * 60 * 24 * 5));
        let lots = await contractMarketGetter.getLotsUser(contractMarket.address, accounts[0].address, 0, startTimestamp, frameKeyEnd, 0, 30);
        console.log(lots);
        //Filter out non empty lots
        lotsF = lots[0].filter(lot => lot[0].gt(0))
        console.log("Num of lots", lotsF.length);
    });

});
