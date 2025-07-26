const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

/*
User purchases a lot and then updates it to a higher price
*/
describe('Purchase lot and update to higher price', function () {
  let accounts,
    owner,
    user,
    token,
    wPOLContract,
    contractMarket,
    contractSwapRouter,
    frameKey,
    lotKey,
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
    const feeMarket = 1; // percent (not used in current implementation)
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
    console.log('\x1b[33m%s\x1b[0m', '   Q96 rate: ', rateAtStart.toString());
    expect(rateAtStart).to.be.gt(0);
  });

  it('Approve USDC to spend and Purchase Lot', async function () {
    user = accounts[Math.floor(Math.random() * 4) + 1];
    const block = await ethers.provider.getBlock('latest');

    // Frame 3 days in the future
    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);
    console.log('\x1b[33m%s\x1b[0m', '   Frame key: ', frameKey);

    // Acquisition price: 15 USDC in Q96
    const acqRaw = ethers.utils.parseUnits('15', tokenDecimals);
    acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

    // Calculate tax with dynamic inverse root formula
    const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   Initial acquisition price: ', ethers.utils.formatUnits(acqRaw, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');

    await token.connect(user).approve(contractMarket.address, taxToken);
    const allowance = await token.allowance(user.address, contractMarket.address);
    expect(allowance).to.equal(taxToken);

    lotKey = await contractMarket.clcLotKey(rateAtStart);
    console.log('\x1b[33m%s\x1b[0m', '   Lot key: ', fromQ96(lotKey, tokenDecimals).toString());

    const balanceBefore = await token.balanceOf(user.address);

    // Get frame reward pool before purchase
    const frameBeforePurchase = await contractMarket.frames(frameKey);
    const rewardPoolBefore = frameBeforePurchase.rewardPool;
    console.log('\x1b[33m%s\x1b[0m', '   Frame reward pool before: ', fromQ96(rewardPoolBefore, tokenDecimals).toString());

    await contractMarket.connect(user).tradeLot(frameKey, lotKey, acqPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const diff = balanceBefore.sub(balanceAfter);

    console.log('\x1b[33m%s\x1b[0m', '   USDC paid: ', ethers.utils.formatUnits(diff, tokenDecimals), ' USDC');

    // Check frame reward pool after purchase
    const frameAfterPurchase = await contractMarket.frames(frameKey);
    const rewardPoolAfter = frameAfterPurchase.rewardPool;
    console.log('\x1b[33m%s\x1b[0m', '   Frame reward pool after: ', fromQ96(rewardPoolAfter, tokenDecimals).toString());

    // Verify reward pool increased by tax amount in Q96
    const expectedIncrease = toQ96(taxToken, tokenDecimals);
    expect(rewardPoolAfter.sub(rewardPoolBefore)).to.equal(expectedIncrease);

    const lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(lotKey);

    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const taxCharged = fromQ96(lotStates[0].taxCharged, tokenDecimals);

    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPriceQ96);
    expect(taxCharged).to.be.closeTo(diff, 1);
    expect(lotStates.length).to.equal(1);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Lot successfully purchased');
  });

  it('Update price of lot to a higher number', async function () {
    const newAcquisitionPrice = ethers.utils.parseUnits('20', tokenDecimals); // 20 USDC raw
    const newAcquisitionPriceQ96 = toQ96(newAcquisitionPrice, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   New acquisition price: ', ethers.utils.formatUnits(newAcquisitionPrice, tokenDecimals), ' USDC');

    // Calculate new tax
    const newTaxQ96 = await contractMarket.clcTax(frameKey, newAcquisitionPriceQ96);
    const newTaxToken = fromQ96(newTaxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   New tax amount: ', ethers.utils.formatUnits(newTaxToken, tokenDecimals), ' USDC');

    // Set allowance for the new tax amount (full amount, not difference)
    await token.connect(user).approve(contractMarket.address, newTaxToken);

    const balanceBefore = await token.balanceOf(user.address);

    // Get frame reward pool before update
    const frameBeforeUpdate = await contractMarket.frames(frameKey);
    const rewardPoolBeforeUpdate = frameBeforeUpdate.rewardPool;

    // Execute the price update (revaluateLot will be called internally)
    await contractMarket.connect(user).tradeLot(frameKey, lotKey, newAcquisitionPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const balanceDifference = balanceBefore.sub(balanceAfter);

    console.log('\x1b[33m%s\x1b[0m', '   USDC paid for update: ', ethers.utils.formatUnits(balanceDifference, tokenDecimals), ' USDC');

    // Check frame reward pool after update
    const frameAfterUpdate = await contractMarket.frames(frameKey);
    const rewardPoolAfterUpdate = frameAfterUpdate.rewardPool;

    console.log('\x1b[33m%s\x1b[0m', '   Frame reward pool after update: ', fromQ96(rewardPoolAfterUpdate, tokenDecimals).toString());

    // Verify reward pool increased by the new tax amount
    const expectedRewardIncrease = toQ96(balanceDifference, tokenDecimals);
    expect(rewardPoolAfterUpdate.sub(rewardPoolBeforeUpdate)).to.be.closeTo(expectedRewardIncrease, 1000);

    // Verify the user paid the full new tax amount
    expect(balanceDifference).to.be.closeTo(newTaxToken, 1);

    // Get lot states after update
    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);

    // Should have 2 states now
    expect(lotStates.length).to.equal(2);

    // Check second state (the update)
    const secondState = lotStates[1];
    const taxChargedInUpdate = fromQ96(secondState.taxCharged, tokenDecimals);

    expect(secondState.owner).to.equal(user.address);
    expect(secondState.acquisitionPrice).to.equal(newAcquisitionPriceQ96);
    expect(taxChargedInUpdate).to.be.closeTo(balanceDifference, 1);

    // Verify total reward pool
    const globalPool = await contractMarket.getGlobalRewardPool();
    console.log('\x1b[33m%s\x1b[0m', '   Global reward pool: ', fromQ96(globalPool, tokenDecimals).toString());

    // Global pool should equal the frame's reward pool since we only have one frame
    expect(globalPool).to.equal(rewardPoolAfterUpdate);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Lot price successfully updated');
  });

  it('Verify lot history and states', async function () {
    const lot = await contractMarket.getLot(frameKey, lotKey);
    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);

    console.log('\x1b[33m%s\x1b[0m', '   Total lot states: ', lotStates.length);

    // First state - initial purchase
    const firstState = lotStates[0];
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   First state acquisition price: ',
      ethers.utils.formatUnits(fromQ96(firstState.acquisitionPrice, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   First state tax: ',
      ethers.utils.formatUnits(fromQ96(firstState.taxCharged, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // Second state - price update
    const secondState = lotStates[1];
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Second state acquisition price: ',
      ethers.utils.formatUnits(fromQ96(secondState.acquisitionPrice, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Second state tax: ',
      ethers.utils.formatUnits(fromQ96(secondState.taxCharged, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // Both states should have the same owner
    expect(firstState.owner).to.equal(user.address);
    expect(secondState.owner).to.equal(user.address);

    // Acquisition price should have increased
    expect(secondState.acquisitionPrice).to.be.gt(firstState.acquisitionPrice);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Lot history correctly maintained');
  });
});
