const { expect, ethers, IERC20, ISwapRouter, fs } = require('../Helpers/imports');
const {swapTokenForUsers} = require("../Helpers/functions.js");

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe("Resale lot", function () {
    let accounts, owner, user, user2, daiContract, wMaticContract, contractMarket, swapRouter, frameKey, dPrice ,acqPrice, tax;
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
        
        //users, tokenIn, tokenOut, amountInEther, contractSwapRouter
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
    it("Approve DAI to spend", async function () {
        //Select random account
        user = accounts[Math.floor(Math.random() * 4) + 1];

        frameKey = await contractMarket.clcFrameKey((Date.now() / 1000 | 0)+270000);

        //Get timestamp of today at 17 h
        const now = new Date();  
        //summer time, fix so it's always gmt time
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0);
        //Convert to seconds
        const timestamp = today.getTime() / 1000 | 0;

        expect(frameKey).to.be.gt(timestamp);
        expect(frameKey).to.be.lt(timestamp+270000);

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
        await contractMarket.connect(user).tradeLot(frameKey, pairPrice, acqPrice, "0x0000000000000000000000000000000000000000", 
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
        await daiContract.connect(user2).approve(contractMarket.address, tax.add(acquisitionPrice));
        //Check allowance
        let allowance = await daiContract.allowance(user2.address, contractMarket.address);
        console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, 18), " DAI");
        expect(allowance).to.equal(tax.add(acquisitionPrice));
    });
    it('second user buys lot', async function () {
//get users current DAI balance
        let balanceBefore = await daiContract.balanceOf(user2.address);
        //get current block
        const block = await ethers.provider.getBlock('latest');

        //Purchase lot 
        await contractMarket.connect(user2).tradeLot(frameKey, pairPrice, acqPrice, "0x0000000000000000000000000000000000000000", 
            {maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas))}
        );

        //get users new DAI balance
        let balanceAfter = await daiContract.balanceOf(user2.address);
        //expect statement to check if balance is same as tax
        console.log("\x1b[33m%s\x1b[0m", "   DAI Difference: ", ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), 18), " DAI");

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

