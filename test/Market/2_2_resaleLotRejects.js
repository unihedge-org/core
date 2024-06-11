const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress  } = require('../Helpers/imports');
const {swapTokenForUsers} = require("../Helpers/functions.js");

/*
Random user tries to resale a lot but fails due to tax <= 0 or allowance is set too low
*/

describe("Resale lot but fails", function () {
    let accounts, owner, user, newUser, daiContract, wMaticContract, contractMarket, swapRouter, frameKey, dPrice ,acqPrice, tax;
    let pairPrice = ethers.BigNumber.from("0");

    before(async function () {
        accounts = await ethers.getSigners();
        owner = accounts[0];
        let newOwner = accounts[1];

        //Get current block number and print it
        const block = await ethers.provider.getBlock('latest');
        console.log("\x1b[33m%s\x1b[0m", "   Current block: ", block.number);

        //Contracts are loaded from addresses
        daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
        wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);
        swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564", owner);

        //Swap tokens for users, get DAI
        await swapTokenForUsers(accounts.slice(0,5),wMaticContract, daiContract, 10, contractSwapRouter);
        //Check if DAI balance is greater than 0
        let balance = await daiContract.balanceOf(owner.address);
        console.log("\x1b[33m%s\x1b[0m", "   DAI balance: ", ethers.utils.formatUnits(balance, 18), " DAI");
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
        user = accounts[1];
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
        await contractMarket.connect(user).tradeLot(frameKey, pairPrice, acqPrice, ethers.constants.AddressZero,
            {maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas))}
        );
        //get users new DAI balance
        let balanceAfter = await daiContract.balanceOf(user.address);
        //expect statement to check if balance is same as tax
        console.log("\x1b[33m%s\x1b[0m", "   DAI Difference: ", ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), 18), " DAI");

        //Get Lot and check if it exists
        let lot = await contractMarket.getLot(frameKey, pairPrice);
        expect(lot.frameKey).to.equal(frameKey);
        expect(lot.lotKey).to.equal(pairPrice);
    });

    it("Approve DAI to spend", async function () {
        //Select random account
        newUser = accounts[2];
        tax = await contractMarket.clcTax(frameKey, acqPrice);
        //Print tax in blue
        console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(tax, 18), " DAI");
        //Approve DAI to spend
        await daiContract.connect(newUser).approve(contractMarket.address, tax);
        //Check allowance
        let allowance = await daiContract.allowance(newUser.address, contractMarket.address);
        console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, 18), " DAI");
        expect(allowance).to.equal(tax);
    });

    it("Revaluate lot but fails", async function () {
        //get users current DAI balance
        let balanceBefore = await daiContract.balanceOf(newUser.address);
        //get current block
        const block = await ethers.provider.getBlock('latest');
        //Purchase lot
        console.log("\x1b[36m%s\x1b[0m", "   Purchase lot with acqPrice set to 0");
        await expect(contractMarket.connect(newUser).tradeLot(frameKey, pairPrice, 0, ethers.constants.AddressZero,
            {maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas))}
        )).to.be.revertedWith("Tax has to be greater than 0. Increase the acquisition price");

        //get users new DAI balance
        let balanceAfter = await daiContract.balanceOf(user.address);
        //expect statement to check if balance is the same
        console.log("\x1b[33m%s\x1b[0m", "   DAI Difference: ", ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), 18), " DAI");

        console.log("\x1b[36m%s\x1b[0m", "   Purchase lot with acqPrice set higher than allowance");
        await expect(contractMarket.connect(newUser).tradeLot(frameKey, pairPrice, acqPrice+100, ethers.constants.AddressZero,
            {maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas))}
        )).to.be.revertedWith("Allowance to spend set too low");

    });
});
