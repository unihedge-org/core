const {expect} = require("chai");
const {ethers} = require("hardhat");
const colors = require('colors');
const {Route, Trade, TokenAmount, TradeType} = require('@uniswap/sdk');
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');
const { time } =  require("@nomicfoundation/hardhat-network-helpers");

describe("Testing getter contract", function () {
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
    let startframe;

    before(async function () {
        [owner] = await ethers.getSigners();
        accounts = await ethers.getSigners();
        // Setup or get existing contracts here, if necessary
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
        wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);

        const TokenContract = await ethers.getContractFactory("Token");
        accountingToken = await TokenContract.connect(accounts[0]).deploy();

        const MarketGetterContract = await ethers.getContractFactory("MarketGetter");
        contractMarketGetter = await MarketGetterContract.deploy();

        

        

        //Connect to the accounting token daiContract


        //Fund users with DAI
        for (let i = 0; i < 15; i++) {
            await accountingToken.connect(accounts[i]).loadMore();
            const balance = await accountingToken.balanceOf(accounts[i].address);
            console.log("Balance of " + accounts[i].address + " is " + balance)
          }

    });


    it("Deploy Market contract", async function () {
        const Market = await ethers.getContractFactory("Market");
        contractMarket = await Market.deploy(accountingToken.address);
        //Log contract address in green with tab before
        expect(await contractMarket.owner()).to.equal(owner.address);
        //Get current block number

        //load await contractMarket.dPrice(); in to dPrice as a big number
        dPrice = await contractMarket.dPrice();
        console.log("dPrice is: ", dPrice.toString());

        //get block number
        let block = await ethers.provider.getBlock('latest');
        //Get start frame from current block.timestamp
        startframe = await contractMarket.clcFrameKey(block.timestamp);
    });
    it('Approve lot purchase for 1st user', async function() { 
        frameKey = await contractMarket.clcFrameKey((Date.now() / 1000 | 0)+270000);
        startframe = await contractMarket.clcFrameKey((Date.now() / 1000 | 0));
    
        let allowance1 = await accountingToken.allowance(accounts[1].address, contractMarket.address);
        console.log(colors.green("Allowance before is: " + allowance1.toString())); 
    
        const lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[1]).clcAmountToApprove(contractMarket.address, frameKey, winningPairPrice, ethers.utils.parseEther('1')));
    
        console.info("Amount to approve is: " + lotPrice);
    
        await accountingToken.connect(accounts[1]).approve(contractMarket.address, lotPrice);
    
        let allowance2 = await accountingToken.allowance(accounts[1].address, contractMarket.address);
        console.log(colors.green("Allowance after is: " + allowance2));
    });
    it('1st user buys a lot', async function() {
        let startingBalance = await accountingToken.balanceOf(accounts[1].address);
        let allowance = await accountingToken.allowance(accounts[1].address, contractMarket.address);
        let lotKey = await contractMarket.clcLotKey(winningPairPrice);
        
        //print difference between starting balance and allowance and current balance
        console.log("Difference between starting balance and allowance: ", startingBalance.sub(allowance).toString());
        console.log("Starting balance: ", startingBalance.toString());
        console.log("Allowance: ", allowance.toString());
        //Current balance
        let currentBalance = await accountingToken.balanceOf(accounts[1].address);
        console.log("Current balance: ", currentBalance.toString());
        //Convert current balance to ether
        console.log("Current balance in ether: ", ethers.utils.formatEther(currentBalance));
        //Difference between starting balance and current balance
        console.log("Difference between starting balance and current balance: ", startingBalance.sub(currentBalance).toString());

        await contractMarket.connect(accounts[1]).purchaseLot(frameKey, lotKey, ethers.utils.parseEther('1'));
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
        let [timestamp, owner, acquisitionPrice, taxCharged, taxRefunded] = states[0];
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
        await accountingToken.connect(accounts[2]).approve(contractMarket.address, lotPrice);
        //Purchase lot
        await contractMarket.connect(accounts[2]).purchaseLot(frameKey, lotKey, ethers.utils.parseEther('1'));

        let lot = await contractMarketGetter.connect(accounts[2]).getLotStruct(contractMarket.address, frameKey, lotKey);

        // console.log(lot.toString());

        let [, , states] = lot;
        console.log(states.toString());
        //Length of states
        console.log(states.length);
        let [timestamp, owner, acquisitionPrice, taxCharged, taxRefunded] = states[states.length-1];
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
    it('First account buys multiple lots in different frames', async function() {
        for (let i = 1; i < 30; i++) {
            console.log(i, " lot");
            let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[1]).clcAmountToApprove(contractMarket.address, frameKey, winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(i))), ethers.utils.parseEther('1')));
            await accountingToken.connect(accounts[1]).approve(contractMarket.address, lotPrice);
            let lotKey = await contractMarket.clcLotKey(winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(i))));
            console.log("LotKey is: ", lotKey.toString());
            await contractMarket.connect(accounts[1]).purchaseLot(frameKey, lotKey, ethers.utils.parseEther('1'));
        }
    });
    it('Get users lots - getLotsUser', async function(){
        let startframe = await contractMarket.clcFrameKey((Date.now() / 1000 | 0));
        //Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage -- inputs to getLotsUser
        let lots = await contractMarketGetter.getLotsUser(contractMarket.address, accounts[1].address, 0, startframe, frameKey, 0, 50);
        console.log("User lots ", lots);
        console.log("User has ", lots[0].length, " lots");
        //filter out non zero lots, first element shuld not be zero
        nonEmptyLots = [];
        for (let i = 0; i < lots[0].length-1; i++) {
            if (lots[0][i][0] != 0) {
                nonEmptyLots.push(lots[0][i]);
            }
        }
        expect(nonEmptyLots.length).to.equal(29);
        console.log("Lot 4 is: ", nonEmptyLots[4].toString());
        console.log("Lot 4 state: ", nonEmptyLots[4][2].toString());
        //expect lot 5 price to equal 1 ether
        expect(nonEmptyLots[4][2][0][2]).to.equal(ethers.utils.parseEther('1'));

        let lotsOpen = await contractMarketGetter.getLotsUser(contractMarket.address, accounts[1].address, 1, startframe, frameKey, 0, 50);
        let lotsClosed = await contractMarketGetter.getLotsUser(contractMarket.address, accounts[1].address, 2, startframe, frameKey, 0, 50);
        console.log("Open lots length: ", lotsOpen[0].length);
    });
    it('Random users buy lots in the same frame', async function() {
        for (let i = 3; i < 15; i++) {
            console.log("User ", i, " buys lot");
            let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[i]).clcAmountToApprove(contractMarket.address, frameKey, winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(i))), ethers.utils.parseEther('1')));
            await accountingToken.connect(accounts[i]).approve(contractMarket.address, lotPrice);
            let lotKey = await contractMarket.clcLotKey(winningPairPrice.add(dPrice.mul(ethers.BigNumber.from(i))));
            console.log("LotKey is: ", lotKey.toString());
            await contractMarket.connect(accounts[i]).purchaseLot(frameKey, lotKey, ethers.utils.parseEther('1'));
            
        }
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
        expect(frame[3]).to.equal(accounts[2].address);
    });
    it('Get users lots after frame closed - getLotsUser', async function(){
        //Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage -- inputs to getLotsUser
        let lotsOpen = await contractMarketGetter.getLotsUser(contractMarket.address, accounts[1].address, 1, startframe, frameKey, 0, 50);
        let lotsClosed = await contractMarketGetter.getLotsUser(contractMarket.address, accounts[1].address, 2, startframe, frameKey, 0, 50);
        //Get only non zero lots
        nonEmptyLotsOpen = [];
        nonEmptyLotsClosed = [];
        for (let i = 0; i < lotsOpen[0].length-1; i++) {
            if (lotsOpen[0][i][0] != 0) {
                nonEmptyLotsOpen.push(lotsOpen[0][i]);
            }
        }
        for (let i = 0; i < lotsClosed[0].length-1; i++) {
            if (lotsClosed[0][i][0] != 0) {
                nonEmptyLotsClosed.push(lotsClosed[0][i]);
            }
        }
        
        expect(nonEmptyLotsOpen.length).to.equal(0);
        expect(nonEmptyLotsClosed.length).to.equal(17);
    });
    it('Test get frames function in getter contract', async function() {
        //Market market, uint frameKey_start,uint frameKey_end, uint page, uint perPage -- inputs to getFrames
        let frames = await contractMarketGetter.getFrames(contractMarket.address, startframe, frameKey, 0, 10);
        //Filter non zero frames
        nonEmptyFrames = [];
        for (let i = 0; i < frames[0].length-1; i++) {
            if (frames[0][i][0] != 0) {
                console.log("Frame ", i, " is not zero");
                nonEmptyFrames.push(frames[0][i]);
            }
        }
        console.log("Frames length is: ", nonEmptyFrames.length);
        expect(nonEmptyFrames.length).to.equal(1);
    });
    it('Get frames user, closed and open', async function() {
        //First user buys a lot in rhw future frame by 1 day from current block.timestamp
        let currentTimestamp = Date.now() / 1000 | 0;
        let block = await ethers.provider.getBlock('latest');
        let futureFrameKey = await contractMarket.clcFrameKey(block.timestamp+86401);
        let lotPrice = ethers.BigNumber.from(await contractMarketGetter.connect(accounts[1]).clcAmountToApprove(contractMarket.address, futureFrameKey, winningPairPrice, ethers.utils.parseEther('1')));
        await accountingToken.connect(accounts[1]).approve(contractMarket.address, lotPrice);
        await contractMarket.connect(accounts[1]).purchaseLot(futureFrameKey, winningPairPrice, ethers.utils.parseEther('1'));

        let frames = await contractMarketGetter.getFramesUser(contractMarket.address, accounts[1].address, startframe, futureFrameKey, 0, 10);
        //Filter non zero frames
        nonEmptyFrames = [];
        for (let i = 0; i < frames[0].length-1; i++) {
            if (frames[0][i][0] != 0) {
                console.log("Frame ", i, " is not zero");
                nonEmptyFrames.push(frames[0][i]);
            }
        }
        console.log("Frames length is: ", nonEmptyFrames.length);
        expect(nonEmptyFrames.length).to.equal(2);
    });

});
