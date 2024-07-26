const { expect, ethers, IERC20, ISwapRouter, fs, time } = require('../Helpers/imports');
const {swapTokenForUsers} = require("../Helpers/functions.js");

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe("Resale lot", function () {
    let accounts, owner, user, user2, daiContract, wMaticContract, contractMarket, swapRouter, frameKey, dPrice ,acqPrice, tax, rateAtStart;
    const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
    const wMaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"// Correct DAI address needed
    const uniswapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap router address
    let pairPrice = ethers.BigNumber.from("0")

    before(async function () {
        accounts = await ethers.getSigners();
        owner = accounts[0];

        //Get current block number
        const block = await ethers.provider.getBlock('latest');
        console.log("\x1b[33m%s\x1b[0m", "   Current block: ", block.number);

        //Contracts are loaded from addresses
        daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
        wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);    
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564", owner);
        
        //users, tokenIn, tokenOut, amountInEther(matic), contractSwapRouter
        await swapTokenForUsers(accounts.slice(0,5),wMaticContract, daiContract, 100, contractSwapRouter);
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

        //get dPrice
        dPrice = await contractMarket.dPrice();
        console.log("\x1b[33m%s\x1b[0m", "   dPrice: ", ethers.utils.formatUnits(dPrice, 18), " DAI");
        expect(dPrice).to.be.gt(0);
    });
    it('calculate current rate', async function () {
        //Get current rate
        rateAtStart = await contractMarket.clcRate();
        console.log("\x1b[33m%s\x1b[0m", "   Current rate of ETH/DAI: ", ethers.utils.formatUnits(rateAtStart, 18), " DAI");
        expect(rateAtStart).to.be.gt(0);
    });
    it('5 users buy 5 random lots', async function () {
        const block = await ethers.provider.getBlock('latest');
        frameKey = await contractMarket.clcFrameKey((block.timestamp)+270000);
        console.log("\x1b[33m%s\x1b[0m", "   Frame key: ", frameKey)

        // Get the current date and time in UTC
        const now = new Date();

        // Get the timestamp of today at 16:00 GMT (neki je narobe z mojim časom na kompu....)
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0));

        // Convert to seconds
        const timestamp = Math.floor(today.getTime() / 1000);

        // Perform the assertion
        // expect(frameKey).to.equal(timestamp + 270000);
        //for loop for approval and purchase
        for (let i = 1; i < 5; i++) {
            //Select random account
            let loserUser = accounts[i];

            pairPrice = rateAtStart.add(dPrice.mul(i+1))
            //Acqusition price in DAI:
            acqPrice = ethers.utils.parseUnits("15", 18);
            //Calculate approval amount
            tax = await contractMarket.clcTax(frameKey, acqPrice);
            //Print tax in blue
            console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(tax, 18), " DAI");
            //get users current DAI balance
            let balanceBefore = await daiContract.balanceOf(loserUser.address);
            //Approve DAI to spend
            await daiContract.connect(loserUser).approve(contractMarket.address, tax);
            //Purchase lot 
            await contractMarket.connect(loserUser).tradeLot(frameKey, pairPrice, acqPrice, ethers.constants.AddressZero);
            console.log("\x1b[33m%s\x1b[0m", "   Lot purchased by user: ", loserUser.address);
            //get users new DAI balance
            let balanceAfter = await daiContract.balanceOf(loserUser.address);
            //expect statement to check if balance difference is same as tax
            console.log("\x1b[33m%s\x1b[0m", "   DAI Difference: ", ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), 18), " DAI");

        }
    });
    it('Skip time to end of frame', async function () {
        
        const block = await ethers.provider.getBlock('latest');
        console.log("\x1b[33m%s\x1b[0m", "   Block timestamp: ", block.timestamp);
        console.log("\x1b[35m%s\x1b[0m", "   Skip time to end of frame");
        //Skip time to next day of frameKey
        await time.increaseTo(frameKey.add(86400));
        
        const block2 = await ethers.provider.getBlock('latest');
        console.log("\x1b[33m%s\x1b[0m", "   Current block timestamp: ", block2.timestamp);
        console.log("\x1b[33m%s\x1b[0m", "   Time difference: ", (block2.timestamp - block.timestamp)/86400, " days");

        await contractMarket.setFrameRate(frameKey);
    });
    it('Settle frame with no winner', async function () {
        //Calculate lotKey from winningPairPrice
        let lotKey = await contractMarket.clcLotKey(rateAtStart);
        //Get lotState
        let lotState = await contractMarket.getStateLot(frameKey, lotKey);
        expect(lotState).to.equal(0);
        

        //Get state frame
        let frameState = await contractMarket.getStateFrame(frameKey);
        expect(frameState).to.equal(3);


        let balanceBeforeOwner = await daiContract.balanceOf(owner.address);
        
        await contractMarket.settleFrame(frameKey);

        let balanceAfterOwner = await daiContract.balanceOf(owner.address);

        let frame = await contractMarket.getFrame(frameKey);

        let lotKeyWon = await contractMarket.clcLotKey(frame[4]);

        expect(frame[3]).to.equal(owner.address);
        //user balance should be greater than before
        expect(balanceAfterOwner).to.be.gt(balanceBeforeOwner);
        //and it should equal reward amount - fee
        expect(balanceAfterOwner).to.equal(balanceBeforeOwner.add(frame[6]).add(frame[5])); 
        //Expect owner balance to be greater than before
        expect(balanceAfterOwner).to.be.gt(balanceBeforeOwner);

        
    });

})

