const {expect} = require("chai");
const {ethers} = require("hardhat");
const {Route, Trade, TokenAmount, TradeType} = require('@uniswap/sdk');
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');
const { time } =  require("@nomicfoundation/hardhat-network-helpers");
const { BigNumber } = require("ethers")

describe("Resale lot", function () {
    let contractMarket, contractSwapRouter, contractTokenDai, contractTokenWMatic, owner, addr1, addr2;

    before(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        const Market = await ethers.getContractFactory("Market");
        contractMarket = await Market.deploy();

        contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564", owner);
        contractTokenDai = await ethers.getContractAt(IERC20.abi, "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", owner);
        contractTokenWMatic = await ethers.getContractAt(IERC20.abi, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", owner);
    });

    describe("Deployment", function () {
        it("Deploy Market contract", async function () {
            expect(await contractMarket.owner()).to.equal(owner.address);
        });
    })

    describe("Swap for DAI", function () {

        it('Swap WMatic for DAI 1st user', async () => {
            const params = {
                tokenIn: contractTokenWMatic.address,
                tokenOut: contractTokenDai.address,
                fee: 3000,
                recipient: addr1.address,
                deadline: Math.floor(Date.now() / 1000) + 60 * 10,
                amountIn: ethers.utils.parseEther("10"),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            let tx = await contractSwapRouter.connect(addr1).exactInputSingle(params, {value: params.amountIn});
            await tx.wait();
            const daiBalanceAfterSwap = await contractTokenDai.connect(addr1).balanceOf(addr1.address);
            expect(daiBalanceAfterSwap).to.be.gt(1);

        });

        it('Swap WMatic for DAI 2nd user', async () => {
            const params = {
                tokenIn: contractTokenWMatic.address,
                tokenOut: contractTokenDai.address,
                fee: 3000,
                recipient: addr2.address,
                deadline: Math.floor(Date.now() / 1000) + 60 * 10,
                amountIn: ethers.utils.parseEther("10"),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            let tx = await contractSwapRouter.connect(addr2).exactInputSingle(params, {value: params.amountIn});
            await tx.wait();
            const daiBalanceAfterSwap = await contractTokenDai.connect(addr2).balanceOf(addr2.address);
            expect(daiBalanceAfterSwap).to.be.gt(1);

        });
    });

    describe("Purchase lot", async () => {
        it("Set allowance to spend DAI user 1", async function () {
            //timestamp should be one day ahead of the current time, calculate with Date.
            let timestamp = (Date.now() / 1000 | 0)+270000;
            
            let acquisitionPrice = ethers.utils.parseUnits("1000", 18); // DAI
            let rate = ethers.utils.parseUnits("1000", 18); // ETH/DAI

            let frameKey = await contractMarket.clcFrameKey(timestamp);
            // expect(frameKey).to.be.eq(1709568000);

            //Calculate tax for approve to spend DAI (it is higher than tax at payment because of time difference between approve and payment)
            //duration [second] = (frameKey + period)  - block.timestamp = 1709568000 [second] + 86400 - 1709211482 [second] = 442917 [second]
            //taxPerSecond [wei %]= taxMarket / period = 5000000000000000 [wei %] / (86400 [second]) = 57870370370 [wei % /second]
            //tax-approved = duration [seconds] * taxPerSecond [wei %] * acquisitionPrice [wei DAI] /1e18= 442917 * 57870370370 * 10000000000000000000 / 1000000000000000000= 256317708331692900

            let tax = await contractMarket.connect(addr1).clcTax(BigNumber.from(frameKey), BigNumber.from(acquisitionPrice));
            // console.log("\x1b[36m%s\x1b[0m", "    Tax: ", ethers.formatEther(tax.toString()), " DAI");
            // expect(tax).to.be.eq(256317708331692900n);

            await contractTokenDai.connect(addr1).approve(contractMarket.address, tax);
            let allowance = await contractTokenDai.allowance(addr1.address, contractMarket.address);
            expect(allowance).to.be.eq(tax);
        })

        it("Purchase lot user 1", async function () {
            //Mine 30 blocks with hardhat
            await time.increase(30);

            let timestamp = (Date.now() / 1000 | 0)+270000;
            let acquisitionPrice = ethers.utils.parseUnits("10", 18); // DAI
            let rate = ethers.utils.parseUnits("1000", 18);

            //Calculate tax for purchase of lot (it is higher than tax at payment because of time difference between approve and payment)
            //duration [second] = (frameKey + period)  - block.timestamp = 1709568000 [second] + 86400 - 1709211514 [second] = 442885 [second]
            //taxPerSecond [wei %]= taxMarket / period = 5000000000000000 [wei %] / (86400 [second]) = 57870370370 [wei % /second]
            //tax-charged = acquisitionPrice [wei DAI] * duration [seconds] * taxPerSecond [wei %]=  442885 * 57870370370 * 10000000000000000000 / 1000000000000000000= 256299189813174500// ETH/DAI

            await contractMarket.connect(addr1).tradeLot(timestamp, rate, acquisitionPrice);
            let frameKey = await contractMarket.clcFrameKey(timestamp);
            let lotKey = await contractMarket.clcLotKey(rate);

            let lot = await contractMarket.getLot(frameKey, lotKey);

            expect(lot.states[0].owner).to.be.eq(addr1.address);

            // expect(lot.states[0].taxCharged).to.be.eq(256299189813174500n);

        });

        it("Resale lot to user 2", async function () {
            //Mine multiple blocks with hardhat
            await time.increase(36000);
            console.log("Block timestamp: ", await time.latest());
            let frameKey = 1711555200;
            let acquisitionPriceNew = ethers.utils.parseUnits("15", 18); // DAI
            let rate = ethers.utils.parseUnits("1000", 18); // ETH/DAI
            let lotKey = await contractMarket.clcLotKey(rate);
            let lot = await contractMarket.getLot(frameKey, lotKey);
            // console.log(lot);

            //***tax-new-left
            let taxNew = await contractMarket.clcTax(frameKey, acquisitionPriceNew);
            //duration [second] = (frameKey + period)  - block.timestamp = 1709568000 [second] + 86400 - 1709283515 [second] =  406885 [second]
            //taxPerSecond [wei %]= taxMarket / period = 5000000000000000 [wei %] / (86400 [second]) = 57870370370 [wei % /second]
            //tax-new-left = duration [seconds] * taxPerSecond [wei %] * acquisitionPrice [wei DAI] /1e18  =  406885 * 57870370370 * 15000000000000000000 / 1000000000000000000 = 353198784719961750
            // expect(taxNew).to.be.eq(353198784719961750n);

            let cost = taxNew + lot.states[0].acquisitionPrice;

            //Set allowance to spend DAI
            await contractTokenDai.connect(addr2).approve(contractMarket.address, cost);
            let allowance = await contractTokenDai.allowance(addr2.address, contractMarket.address);
            // expect(allowance).to.be.eq(10353198784719961750n);


            // Pass one minute
            await time.increase(60);

            //New tax calculated at time of payment

            //***tax-new
            //duration [second] = (frameKey + period)  - block.timestamp = 1709568000 [second] + 86400 - 1709283577 [second] = 406823 [second]
            //taxPerSecond [wei %]= taxMarket / period = 5000000000000000 [wei %] / (86400 [second]) = 57870370370 [wei % /second]
            //tax-old = duration [seconds] * taxPerSecond [wei %] * acquisitionPrice [wei DAI] /1e18  = 406823 * 57870370370 * 15000000000000000000 / 1000000000000000000 = 353144965275517650

            cost = 353144965275517650n + lot.states[0].acquisitionPrice;

            //Get balance of the user 1
            let balanceBefore = await contractTokenDai.balanceOf(addr1.address);
            //Get balance of the user 2
            let balanceBefore2 = await contractTokenDai.balanceOf(addr2.address);

            await contractMarket.connect(addr2).tradeLot(frameKey, rate, acquisitionPriceNew);

            //Get balance of the user 1
            let balanceAfter = await contractTokenDai.balanceOf(addr1.address);
            //Get balance of the user 2
            let balanceAfter2 = await contractTokenDai.balanceOf(addr2.address);

            lot = await contractMarket.getLot(frameKey, lotKey);

            // //Tax refunded to the owner for previous acquisition price
            expect(lot.states[1].owner).to.be.eq(addr2.address);

            // expect(lot.states[1].taxCharged).to.be.eq(353144965275517650n);
        });
    })
});
