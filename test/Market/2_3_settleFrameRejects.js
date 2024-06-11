const { expect, ethers, IERC20, ISwapRouter, fs, time } = require('../Helpers/imports');
const {swapTokenForUsers} = require("../Helpers/functions.js");

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe("Settle frame but fails", function () {
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
    it('Settle frame but frame does not exists', async function () {
        console.log("\x1b[36m%s\x1b[0m", "   Trying to settle frame that does not exists.");
        user = accounts[0];
        await expect(contractMarket.connect(user).settleFrame(1)).to.be.revertedWith("Frame doesn't exist");
    });
    it('calculate current rate', async function () {
        //Get current rate
        rateAtStart = await contractMarket.clcRate();
        console.log("\x1b[33m%s\x1b[0m", "   Current rate of ETH/DAI: ", ethers.utils.formatUnits(rateAtStart, 18), " DAI");
        expect(rateAtStart).to.be.gt(0);
    });

    it("Approve DAI to spend", async function () {
        //Select random account
        user = accounts[Math.floor(Math.random() * 4) + 1];
        //get current block timestamp
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
        expect(frameKey).to.equal(timestamp + 270000);

        //Acqusition price in DAI:
        acqPrice = ethers.utils.parseUnits("15", 18);
        //Calculate approval amount
        tax = await contractMarket.clcTax(frameKey, acqPrice);
        //Print tax in blue
        console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(tax, 18), " DAI");

        //Approve DAI to spend
        await daiContract.connect(user).approve(contractMarket.address, tax);
        //Check allowance
        let allowance = await daiContract.allowance(user.address, contractMarket.address);
        console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, 18), " DAI");
        expect(allowance).to.equal(tax);
    });
    it("Purchase lot", async function () {
        //get users current DAI balance
        let balanceBefore = await daiContract.balanceOf(user.address);
        //get current block
        const block = await ethers.provider.getBlock('latest');
        //Purchase lot
        await contractMarket.connect(user).tradeLot(frameKey, rateAtStart, acqPrice, ethers.constants.AddressZero,
            {maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas))}
        );
        //get users new DAI balance
        let balanceAfter = await daiContract.balanceOf(user.address);
        //expect statement to check if balance is same as tax
        console.log("\x1b[33m%s\x1b[0m", "   DAI Difference: ", ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), 18), " DAI");

        //calculate lotKey
        let lotKey = await contractMarket.clcLotKey(rateAtStart);

        //Get Lot and check if it exists
        let lot = await contractMarket.getLot(frameKey, lotKey);
        expect(lot.frameKey).to.equal(frameKey);

        //get lotState
        let lotState = await contractMarket.getStateLot(frameKey, lotKey);

        //get frame
        let frame = await contractMarket.getFrame(frameKey);

        //Get lot states and check if they are correct
        let lotStates = await contractMarket.getLotStates(frameKey, lot.lotKey);

        expect(lotStates[0].owner).to.equal(user.address);
        expect(lotStates[0].acquisitionPrice).to.equal(acqPrice);
        expect(lotStates[0].taxCharged).to.equal(balanceBefore.sub(balanceAfter));
        expect(lotStates[0].taxRefunded).to.equal(0);
        expect(lotStates.length).to.equal(1);
    });
    it('5 users buy 5 random lots', async function () {
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
    });
    it('Settle frame is called but frame does not have close rate set', async function () {
        //Calculate lotKey from winningPairPrice
        let lotKey = await contractMarket.clcLotKey(rateAtStart);
        //Get lotState
        let lotState = await contractMarket.getStateLot(frameKey, lotKey);
        expect(lotState).to.equal(1);


        //Get state frame
        let frameState = await contractMarket.getStateFrame(frameKey);
        expect(frameState).to.equal(2);

        await expect(contractMarket.settleFrame(frameKey)).to.be.revertedWith("Frame does not have a close rate set");

    });

})

