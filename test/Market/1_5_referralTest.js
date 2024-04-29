const {expect} =  require("chai");
const {ethers} = require("hardhat");
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');
const { time } =  require("@nomicfoundation/hardhat-network-helpers");
const { BigNumber } = require("ethers")

describe("Referral test", function () {
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
    });

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
                amountIn: ethers.utils.parseEther("100"),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            let tx = await contractSwapRouter.connect(addr2).exactInputSingle(params, {value: params.amountIn});
            await tx.wait();
            const daiBalanceAfterSwap = await contractTokenDai.connect(addr2).balanceOf(addr2.address);
            expect(daiBalanceAfterSwap).to.be.gt(10);

        });
    });

    describe("Purchase lot", async () => {
        it("Set allowance to spend DAI user 1", async function () {
            //timestamp should be one day ahead of the current time, calculate with Date.
            let timestamp = (Date.now() / 1000 | 0)+270000;

            let acquisitionPrice = ethers.utils.parseUnits("1000", 18); // DAI
            let rate = ethers.utils.parseUnits("3400", 18); // ETH/DAI
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
            let rate = ethers.utils.parseUnits("3400", 18);

            await contractMarket.connect(addr1).tradeLotReferral(timestamp, rate, acquisitionPrice, ethers.constants.AddressZero);
            let frameKey = await contractMarket.clcFrameKey(timestamp);
            let lotKey = await contractMarket.clcLotKey(rate);

            let lot = await contractMarket.getLot(frameKey, lotKey);
            console.log(lotKey);

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

            //Set allowance to spend DAI
            await contractTokenDai.connect(addr2).approve(contractMarket.address, cost);
            let allowance = await contractTokenDai.allowance(addr2.address, contractMarket.address);
            // expect(allowance).to.be.eq(10353198784719961750n);

            // Pass one minute
            await time.increase(60);

            //Get balance of the user 1
            let balanceBefore = await contractTokenDai.balanceOf(addr1.address);
            //Get balance of the user 2
            let balanceBefore2 = await contractTokenDai.balanceOf(addr2.address);

            await contractMarket.connect(addr2).tradeLotReferral(frameKey, rate, acquisitionPriceNew, addr1.address);

            //Get balance of the user 1
            let balanceAfter = await contractTokenDai.balanceOf(addr1.address);
            //Get balance of the user 2
            let balanceAfter2 = await contractTokenDai.balanceOf(addr2.address);

            lot = await contractMarket.getLot(frameKey, lotKey);

            console.log("Ownership and balance test");
            // //Tax refunded to the owner for previous acquisition price
            expect(lot.states[2].owner).to.be.eq(addr2.address);
            // balance of the user 1 should be increased by the acquisition price + remaining tax
            expect(balanceAfter).to.be.eq(balanceBefore.add(lot.states[0].acquisitionPrice).add(lot.states[1].taxRefunded));
            // balance of the user 2 should be decreased by the acquisition price + tax
            taxNew = await contractMarket.clcTax(frameKey, acquisitionPriceNew);
            expect(balanceAfter2).to.be.eq(balanceBefore2.sub(lot.states[0].acquisitionPrice).sub(taxNew));

            console.log("User create and referral test");
            // User 2 should be created with user 1 as referrer
            let userExist = await contractMarket.userExists(addr2.address);
            expect(userExist).to.be.eq(true);
            let referredBy = await contractMarket.referredBy(addr2.address);
            expect(referredBy).to.be.eq(addr1.address);

            console.log("Referral reward and fee test");
            // User 1 should have increased referral reward and frame should have increased referral fee
            let userReward = await contractMarket.getUserReward(addr1.address, frameKey);
            let referralPct = ethers.BigNumber.from('5000000000000000');
            let feeReward =  referralPct.mul(taxNew).div(ethers.BigNumber.from('1000000000000000000'));
            expect(userReward).to.be.eq(feeReward);
            let frame = await contractMarket.getFrame(frameKey);
            expect(frame.feeReferral).to.be.eq(feeReward);

            console.log("Claim referral test");
            // User1 should not be able to collect any of the referral reward because there is no frame settled
            await expect(contractMarket.connect(addr1).getUncollectedRewards()).to.be.revertedWith("No settled frames");
        });

        it("Fast forward time", async function () {
            let frameKey = await contractMarket.framesKeys(0);
            await time.increaseTo(frameKey);
            await time.increase(86400);
        });
        it("Users settles frame", async function () {
            let frameKey = await contractMarket.framesKeys(0);
            //Get user's balance before settlement
            await contractMarket.connect(addr2).setFrameRate(frameKey);
            await contractMarket.connect(addr2).settleFrame(frameKey);
            //get frame struct
            let frame = await contractMarket.connect(addr2).getFrame(frameKey);
            // Loop over lot states and print taxCharged and taxRefunded
            /*let lot = await contractMarket.getLot(frameKey, frame.lotKeys[0]);
            for (let i = 0; i < lot.states.length; i++) {
                console.log("Lot states "+ i + ": ", lot.states[i].taxCharged, lot.states[i].taxRefunded);
            }*/

            console.log("Claim referral test");
            // User1 should be able to collect referral reward for frameKey
            let uncollectedRewards = await contractMarket.connect(addr1).getUncollectedRewards();
            await expect(uncollectedRewards).to.be.eq(frame.feeReferral);
            // User 1 balance should increase when collecting referral reward
            console.log("User claim referral reward");
            let balanceBefore = await contractTokenDai.balanceOf(addr1.address);
            await contractMarket.connect(addr1).claimReferralRewards();
            let balanceAfter = await contractTokenDai.balanceOf(addr1.address);
            expect(balanceAfter).to.be.eq(balanceBefore.add(frame.feeReferral));
            // User 1 should not collect reward again
            await expect(contractMarket.connect(addr1).claimReferralRewards()).to.be.revertedWith("No rewards to claim");
            // User 2 should not be able to collect any rewards
            await expect(contractMarket.connect(addr2).claimReferralRewards()).to.be.revertedWith("No rewards to claim");
        });
    });
});

