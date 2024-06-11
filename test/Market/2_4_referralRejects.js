const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress  } = require('../Helpers/imports');
const {swapTokenForUsers} = require("../Helpers/functions.js");
const { BigNumber } = require("ethers")
const {time} = require("@nomicfoundation/hardhat-network-helpers");

describe("Refferal rejects", function () {
    let accounts, owner, addr1, addr2, daiContract, wMaticContract, contractMarket, swapRouter, frameKey, dPrice ,acqPrice, tax;
    let pairPrice = ethers.BigNumber.from("0");

    before(async function () {
        accounts = await ethers.getSigners();
        owner = accounts[0];

        //Get current block number and print it
        const block = await ethers.provider.getBlock('latest');
        console.log("\x1b[33m%s\x1b[0m", "   Current block: ", block.number);

        //Contracts are loaded from addresses
        daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
        wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564", owner);

        //Swap tokens for users, get DAI
        await swapTokenForUsers(accounts.slice(0,5),wMaticContract, daiContract, 50, contractSwapRouter);
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

        dPrice = await contractMarket.dPrice();
        console.log("\x1b[33m%s\x1b[0m", "   dPrice: ", ethers.utils.formatUnits(dPrice, 18), " DAI");
        //Expect dPrice to be 1e20
        expect(dPrice).to.equal(ethers.utils.parseUnits("1", 20));
    });
    it("Approve DAI to spend", async function () {
        //Select random account
        addr1 = accounts[0];
        addr2 = accounts[1];
        //Get current block timestamp
        const block = await ethers.provider.getBlock('latest');

        frameKey = await contractMarket.clcFrameKey((block.timestamp)+270000);

        // Get the current date and time in UTC
        const now = new Date();

        // Get the timestamp of today at 16:00 GMT (neki je narobe z mojim časom na kompu....)
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0));

        // Convert to seconds
        const timestamp = Math.floor(today.getTime() / 1000);

        // Perform the assertion
        //expect(frameKey).to.equal(timestamp + 270000);

        //Select random pair price in range of 1 to 100 times dPrice
        pairPrice = ethers.BigNumber.from(Math.floor(Math.random() * 100) + 1);
        pairPrice = pairPrice.mul(dPrice);

        //Acqusition price in DAI:
        acqPrice = ethers.utils.parseUnits("15", 18);
        //Calculate approval amount
        tax = await contractMarket.clcTax(frameKey, acqPrice);
        //Print tax in blue
        console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(tax, 18), " DAI");

        //Approve DAI to spend
        await daiContract.connect(addr1).approve(contractMarket.address, tax + 10000);
        await daiContract.connect(addr2).approve(contractMarket.address, tax + 10000);
    });

    it("Purchase lot user 1 but referrer does not exist", async function () {
        //Mine 30 blocks with hardhat
        await time.increase(30);

        let timestamp = (Date.now() / 1000 | 0)+270000;
        let acquisitionPrice = ethers.utils.parseUnits("1", 18); // DAI
        let rate = ethers.utils.parseUnits("3400", 18);

        await expect(contractMarket.connect(addr1).tradeLot(timestamp, rate, acquisitionPrice, addr2.address)).to.be.revertedWith("Referrer does not exist");
        await expect(contractMarket.connect(addr1).tradeLot(timestamp, rate, acquisitionPrice, addr1.address)).to.be.revertedWith("Referrer does not exist");
    });

    it("Purchase lot user 1", async function () {
        //Mine 30 blocks with hardhat
        await time.increase(30);

        let timestamp = (Date.now() / 1000 | 0)+270000;
        let acquisitionPrice = ethers.utils.parseUnits("10", 18); // DAI
        let rate = ethers.utils.parseUnits("3400", 18);

        await contractMarket.connect(addr1).tradeLot(timestamp, rate, acquisitionPrice, ethers.constants.AddressZero);
        let frameKey = await contractMarket.clcFrameKey(timestamp);
        let lotKey = await contractMarket.clcLotKey(rate);

        let lot = await contractMarket.getLot(frameKey, lotKey);

        expect(lot.states[0].owner).to.be.eq(addr1.address);

        // user should be created with zero address as referrer address
        let user = await contractMarket.userExists(addr1.address);
        expect(user).to.be.eq(true);
        let referredBy = await contractMarket.referredBy(addr1.address);
        expect(referredBy).to.be.eq(ethers.constants.AddressZero);
    });

    it("Resale lot to user 2 with referral of user 1", async function () {
        //Mine multiple blocks with hardhat
        await time.increase(36000);
        let timestamp = (Date.now() / 1000 | 0)+270000;
        let frameKey = await contractMarket.clcFrameKey(timestamp);
        let acquisitionPriceNew = ethers.utils.parseUnits("15", 18); // DAI
        let rate = ethers.utils.parseUnits("3400", 18); // ETH/DAI
        let lotKey = await contractMarket.clcLotKey(rate);
        let lot = await contractMarket.getLot(frameKey, lotKey);
        //***tax-new-left
        let taxNew = await contractMarket.clcTax(frameKey, acquisitionPriceNew);
        let cost = taxNew + lot.states[0].acquisitionPrice;

        // Pass one minute
        await time.increase(60);

        await contractMarket.connect(addr2).tradeLot(frameKey, rate, acquisitionPriceNew, addr1.address);

        console.log("Claim referral should fail");
        // User1 should not be able to collect any of the referral reward because there is no frame settled
        await expect(contractMarket.connect(addr1).getUncollectedRewards()).to.be.revertedWith("No settled frames");
    });

    it("Fast forward time", async function () {
        let frameKey = await contractMarket.framesKeys(0);
        await time.increaseTo(frameKey);
        await time.increase(86400);
    });
    it("After frame is sttled several claim reward calls are failing", async function () {
        let frameKey = await contractMarket.framesKeys(0);
        //Get user's balance before settlement
        await contractMarket.connect(addr2).setFrameRate(frameKey);
        await contractMarket.connect(addr2).settleFrame(frameKey);
        //get frame struct
        let frame = await contractMarket.connect(addr2).getFrame(frameKey);

        console.log("Claim referral for user 1 succesful");
        // User1 should be able to collect referral reward for frameKey
        let uncollectedRewards = await contractMarket.connect(addr1).getUncollectedRewards();
        await expect(uncollectedRewards).to.be.eq(frame.feeReferral);
        await contractMarket.connect(addr1).claimReferralRewards();

        console.log("Another claim referral for user 1 fails and claim for user 2 fails");
        // User 1 should not collect reward again
        await expect(contractMarket.connect(addr1).claimReferralRewards()).to.be.revertedWith("No rewards to claim");
        // User 2 should not be able to collect any rewards
        await expect(contractMarket.connect(addr2).claimReferralRewards()).to.be.revertedWith("No rewards to claim");

        console.log("Random address should not be able to claim rewards");
        await expect(contractMarket.connect(accounts[2]).claimReferralRewards()).to.be.revertedWith("User does not exist");
    });
});