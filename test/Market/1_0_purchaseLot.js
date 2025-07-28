const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

/*
Random user buys a random lot in the range of 1 to 100 times dPrice (Q96)
*/
describe('Purchase one random empty lot with Liquidity Flywheel', function () {
  let accounts,
    owner,
    user,
    token,
    wPOLContract,
    contractMarket,
    contractSwapRouter,
    frameKey,
    rateAtStart,
    dPrice,
    acqPriceQ96,
    tokenDecimals,
    baseUnit,
    Q96;

  before(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];

    const block = await ethers.provider.getBlock('latest');
    console.log('\x1b[33m%s\x1b[0m', '   Current block: ', block.number);

    token = await ethers.getContractAt('IERC20Metadata', process.env.FUNDING_TOKEN, owner);
    wPOLContract = await ethers.getContractAt(IERC20.abi, process.env.WPOL_POLYGON, owner);
    contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, process.env.UNISWAP_ROUTER, owner);

    tokenDecimals = await token.decimals();
    baseUnit = ethers.BigNumber.from(10).pow(tokenDecimals);
    Q96 = ethers.BigNumber.from(2).pow(96);

    await swapTokenForUsers(accounts.slice(0, 5), wPOLContract, token, 9000, contractSwapRouter);

    let balance = await token.balanceOf(owner.address);
    console.log('\x1b[33m%s\x1b[0m', '   USDC balance: ', ethers.utils.formatUnits(balance, tokenDecimals), ' $');
    expect(balance).to.be.gt(0);
  });

  it('Deploy Market contract', async function () {
    const Market = await ethers.getContractFactory('Market');
    const feeProtocol = 3; // percent
    const feeMarket = 1; // percent
    dPrice = Number(100); // 100 USDC
    contractMarket = await Market.deploy(process.env.FUNDING_TOKEN, feeProtocol, feeMarket, dPrice, process.env.POOL);

    expect(await contractMarket.owner()).to.equal(accounts[0].address);
    expect(await contractMarket.period()).to.equal(86400);

    // Check initial state
    expect(await contractMarket.lastSettledFrameIndex()).to.equal(0);
    expect(await contractMarket.getGlobalRewardPool()).to.equal(0);

    const _dPrice = await contractMarket.dPrice();
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   dPrice (formatted): ',
      ethers.utils.formatUnits(fromQ96(_dPrice, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // get current rate
    rateAtStart = await contractMarket.clcRate();
    const raw = fromQ96(rateAtStart, tokenDecimals);
    console.log('Raw token rate:', raw.toString());
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Current rate: ',
      ethers.utils.formatUnits(fromQ96(rateAtStart, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log('\x1b[33m%s\x1b[0m', '   Q96 rate: ', rateAtStart, ' USDC');
    expect(rateAtStart).to.be.gt(0);
  });

  it('Approve USDC to spend and Purchase a Lot', async function () {
    user = accounts[Math.floor(Math.random() * 4) + 1];
    const block = await ethers.provider.getBlock('latest');

    // Frame 3 days in the future
    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);

    // Acquisition price: 1 USDC in Q96
    const acqRaw = ethers.utils.parseUnits('1', tokenDecimals);
    acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

    // Calculate tax with dynamic inverse root formula
    const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
    console.log('\x1b[33m%s\x1b[0m', '   Tax Q96: ', taxQ96.toString(), ' USDC Q96');
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');

    await token.connect(user).approve(contractMarket.address, taxToken);
    const allowance = await token.allowance(user.address, contractMarket.address);
    expect(allowance).to.equal(taxToken);

    const lotKey = await contractMarket.clcLotKey(rateAtStart);
    const balanceBefore = await token.balanceOf(user.address);

    // Get current active frame (where taxes are collected)
    const currentActiveFrame = await contractMarket.clcFrameKey(block.timestamp);
    const taxesCollectedBefore = await contractMarket.taxesCollectedInFrame(currentActiveFrame);
    console.log('\x1b[33m%s\x1b[0m', '   Taxes collected in active frame before: ', fromQ96(taxesCollectedBefore, tokenDecimals).toString());

    await contractMarket.connect(user).tradeLot(frameKey, lotKey, acqPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const diff = balanceBefore.sub(balanceAfter);

    console.log('\x1b[33m%s\x1b[0m', '   USDC Difference: ', ethers.utils.formatUnits(diff, tokenDecimals), ' USDC');

    // Check taxes collected in active frame after purchase
    const taxesCollectedAfter = await contractMarket.taxesCollectedInFrame(currentActiveFrame);
    console.log('\x1b[33m%s\x1b[0m', '   Taxes collected in active frame after: ', fromQ96(taxesCollectedAfter, tokenDecimals).toString());

    // Verify taxes were collected in the active frame
    expect(taxesCollectedAfter.sub(taxesCollectedBefore)).to.equal(toQ96(taxToken, tokenDecimals));

    const lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(lotKey);

    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const taxCharged = fromQ96(lotStates[0].taxCharged, tokenDecimals);

    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPriceQ96);
    expect(taxCharged).closeTo(diff, 1);
    expect(lotStates.length).to.equal(1);

    // Check global reward pool
    const globalPool = await contractMarket.getGlobalRewardPool();
    console.log('\x1b[33m%s\x1b[0m', '   Global reward pool: ', fromQ96(globalPool, tokenDecimals).toString());
    expect(globalPool).to.be.gt(0);
  });

  it('Check pending rewards for next settlement', async function () {
    const pendingReward = await contractMarket.getPendingRewardForNextSettlement();
    console.log('\x1b[33m%s\x1b[0m', '   Pending reward for next settlement: ', fromQ96(pendingReward, tokenDecimals).toString());

    // Should be 0 since no frames are rated yet
    expect(pendingReward).to.equal(0);
  });

  it('Verify frame state transitions', async function () {
    // Check current frame state
    const frameState = await contractMarket.getStateFrame(frameKey);
    console.log('\x1b[33m%s\x1b[0m', '   Frame state: ', frameState);

    // Should be OPENED (1) since it's in the future
    expect(frameState).to.equal(1);
  });
});
