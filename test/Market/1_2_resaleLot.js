const { expect, ethers, IERC20, ISwapRouter, fs } = require('../Helpers/imports');
const {swapTokenForUsers} = require("../Helpers/functions.js");

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe("Resale lot", function () {
    let accounts, owner, user, token, wPOLContract, contractMarket, swapRouter, frameKey, dPrice ,acqPrice, tax, tokenDecimals;
    let pairPrice = ethers.BigNumber.from("0")

    before(async function () {
        accounts = await ethers.getSigners();
        owner = accounts[0];

        //Get current block number and print it
        const block = await ethers.provider.getBlock('latest');
        console.log("\x1b[33m%s\x1b[0m", "   Current block: ", block.number);

        //Contracts are loaded from addresses
        token = await ethers.getContractAt("IERC20Metadata", process.env.FUNDING_TOKEN, owner);
        wPOLContract = await ethers.getContractAt(IERC20.abi, process.env.WPOL_POLYGON, owner);
        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, process.env.UNISWAP_ROUTER, owner);

        // Get token decimals
        tokenDecimals = await token.decimals();

        //Swap tokens for users, get DAI
        await swapTokenForUsers(accounts.slice(0,5), wPOLContract, token, 9000, contractSwapRouter);
        //Check if DAI balance is greater than 0
        let balance = await token.balanceOf(owner.address);
        console.log("\x1b[33m%s\x1b[0m", "   USDC balance: ", ethers.utils.formatUnits(balance, tokenDecimals), " $");
        expect(balance).to.be.gt(0);
    });
    it('Deploy Market contract', async function () {
        const Market = await ethers.getContractFactory("Market");
        contractMarket = await Market.deploy(process.env.FUNDING_TOKEN);
        //Expect owner to be first account
        expect(await contractMarket.owner()).to.equal(accounts[0].address);
        //Expect period to be 1 day in seconds
        expect(await contractMarket.period()).to.equal(86400);

        //get dPrice
        dPrice = await contractMarket.dPrice();
        console.log("\x1b[33m%s\x1b[0m", "   dPrice: ", ethers.utils.formatUnits(dPrice, tokenDecimals), " USDC");
        expect(dPrice).to.be.gt(0);
    });
    it("Approve DAI to spend", async function () {
        //Select random account
        user = accounts[Math.floor(Math.random() * 4) + 1];

        const block = await ethers.provider.getBlock('latest');

        frameKey = await contractMarket.clcFrameKey((block.timestamp)+270000);

        // Get the current date and time in UTC
        const now = new Date();

        // Get the timestamp of today at 16:00 GMT (neki je narobe z mojim časom na kompu....)
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0));

        // Convert to seconds
        const timestamp = Math.floor(today.getTime() / 1000);

        // Perform the assertion
        // // expect(frameKey).to.equal(timestamp + 270000);

        //Select random pair price in range of 1 to 100 times dPrice
        pairPrice = ethers.BigNumber.from(Math.floor(Math.random() * 100) + 1);
        pairPrice = pairPrice.mul(dPrice);

        //Acqusition price in DAI:
        acqPrice = ethers.utils.parseUnits("15", tokenDecimals);
        //Calculate approval amount
        tax = await contractMarket.clcTax(frameKey, acqPrice);
        //Print tax in blue
        console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(tax, tokenDecimals), " DAI");

        //Approve DAI to spend
        await token.connect(user).approve(contractMarket.address, tax);
        //Check allowance
        let allowance = await token.allowance(user.address, contractMarket.address);
        console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, tokenDecimals), " DAI");
        expect(allowance).to.equal(tax);
    });
    it("Purchase lot", async function () {
        //get users current DAI balance
        let balanceBefore = await token.balanceOf(user.address);
        //get current block
        const block = await ethers.provider.getBlock('latest');
        //Purchase lot 
        await contractMarket.connect(user).tradeLot(frameKey, pairPrice, acqPrice, 
            {maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas))}
        );
        //get users new DAI balance
        let balanceAfter = await token.balanceOf(user.address);
        //expect statement to check if balance is same as tax
        console.log("\x1b[33m%s\x1b[0m", "   DAI Difference: ", ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals), " DAI");

        //Get Lot and check if it exists
        let lot = await contractMarket.getLot(frameKey, pairPrice);
        expect(lot.frameKey).to.equal(frameKey);
        expect(lot.lotKey).to.equal(pairPrice);

        //Get lot states and check if they are correct
        let lotStates = await contractMarket.getLotStates(frameKey, pairPrice);

        expect(lotStates[0].owner).to.equal(user.address);
        expect(lotStates[0].acquisitionPrice).to.equal(acqPrice);
        expect(lotStates[0].taxCharged).to.equal(balanceBefore.sub(balanceAfter));
        expect(lotStates[0].taxRefunded).to.equal(0);
        expect(lotStates.length).to.equal(1);
    });
    it('second user approves dai for purchase', async function () {
        //Select random account that is not user
        user2 = accounts[Math.floor(Math.random() * 4) + 1];
        while(user2.address == user.address){
            user2 = accounts[Math.floor(Math.random() * 4) + 1];
        }

        tax = await contractMarket.clcTax(frameKey, acqPrice);

        let lotStates = await contractMarket.getLotStates(frameKey, pairPrice);
        let acquisitionPrice = lotStates[0].acquisitionPrice
        //Convert to big
        

        //Approve DAI to spend
        await token.connect(user2).approve(contractMarket.address, tax.add(acquisitionPrice));
        //Check allowance
        let allowance = await token.allowance(user2.address, contractMarket.address);
        console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, tokenDecimals), " DAI");
        expect(allowance).to.equal(tax.add(acquisitionPrice));
    });
    it('second user buys lot', async function () {
//get users current DAI balance
        let balanceBefore = await token.balanceOf(user2.address);
        //get current block
        const block = await ethers.provider.getBlock('latest');

        //Purchase lot 
        await contractMarket.connect(user2).tradeLot(frameKey, pairPrice, acqPrice, 
            {maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas))}
        );

        //get users new DAI balance
        let balanceAfter = await token.balanceOf(user2.address);
        //expect statement to check if balance is same as tax
        console.log("\x1b[33m%s\x1b[0m", "   DAI Difference: ", ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals), " DAI");

        //Get Lot and check if it exists
        let lot = await contractMarket.getLot(frameKey, pairPrice);
        expect(lot.frameKey).to.equal(frameKey);
        expect(lot.lotKey).to.equal(pairPrice);

        //Get lot states and check if they are correct
        let lotStates = await contractMarket.getLotStates(frameKey, pairPrice);

        expect(lotStates[1].owner).to.equal(user.address);
        expect(lotStates[2].owner).to.equal(user2.address);
        expect(lotStates[2].acquisitionPrice).to.equal(acqPrice);
        expect(lotStates[2].taxCharged).to.equal(balanceBefore.sub(balanceAfter).sub(lotStates[1].acquisitionPrice));
        //TODO: Check if tax refunded is correct in lotStates[1] and lotStates[2]
        expect(lotStates.length).to.equal(3);
    });
})

