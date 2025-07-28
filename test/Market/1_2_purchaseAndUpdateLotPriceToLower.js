const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

/*
User purchases a lot at a high price and then updates it to a lower price
*/
describe('Purchase lot and update to lower price', function () {
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
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Current rate: ',
      ethers.utils.formatUnits(fromQ96(rateAtStart, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    expect(rateAtStart).to.be.gt(0);
  });

  it('Purchase lot at high price (50 USDC)', async function () {
    user = accounts[1];
    const block = await ethers.provider.getBlock('latest');

    // Frame 3 days in the future
    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);
    console.log('\x1b[33m%s\x1b[0m', '   Frame key: ', frameKey);

    // Initial high acquisition price: 50 USDC
    const acqRaw = ethers.utils.parseUnits('50', tokenDecimals);
    acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

    // Calculate tax
    const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   Initial acquisition price: ', ethers.utils.formatUnits(acqRaw, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Tax for high price: ', ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');

    await token.connect(user).approve(contractMarket.address, taxToken);

    lotKey = await contractMarket.clcLotKey(rateAtStart);
    console.log('\x1b[33m%s\x1b[0m', '   Lot key: ', fromQ96(lotKey, tokenDecimals).toString());

    const balanceBefore = await token.balanceOf(user.address);

    // Get initial total taxes paid
    const initialGlobalPool = await contractMarket.getGlobalRewardPool();

    await contractMarket.connect(user).tradeLot(frameKey, lotKey, acqPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const diff = balanceBefore.sub(balanceAfter);

    console.log('\x1b[33m%s\x1b[0m', '   USDC paid for initial purchase: ', ethers.utils.formatUnits(diff, tokenDecimals), ' USDC');

    // Verify initial purchase
    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    expect(lotStates.length).to.equal(1);
    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPriceQ96);

    // Track total paid so far
    const totalPaidInitial = diff;
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Total paid after initial purchase: ',
      ethers.utils.formatUnits(totalPaidInitial, tokenDecimals),
      ' USDC'
    );

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Lot successfully purchased at high price');
  });

  it('Update lot to lower price (10 USDC)', async function () {
    // New lower acquisition price: 10 USDC
    const newAcquisitionPrice = ethers.utils.parseUnits('10', tokenDecimals);
    const newAcquisitionPriceQ96 = toQ96(newAcquisitionPrice, tokenDecimals);

    console.log(
      '\x1b[36m%s\x1b[0m',
      '   New (lower) acquisition price: ',
      ethers.utils.formatUnits(newAcquisitionPrice, tokenDecimals),
      ' USDC'
    );

    // Calculate new tax for lower price
    const newTaxQ96 = await contractMarket.clcTax(frameKey, newAcquisitionPriceQ96);
    const newTaxToken = fromQ96(newTaxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   Tax for lower price: ', ethers.utils.formatUnits(newTaxToken, tokenDecimals), ' USDC');

    // Get previous tax for comparison
    const lotStatesBefore = await contractMarket.getLotStates(frameKey, lotKey);
    const previousTaxCharged = fromQ96(lotStatesBefore[0].taxCharged, tokenDecimals);
    console.log('\x1b[33m%s\x1b[0m', '   Previous tax paid: ', ethers.utils.formatUnits(previousTaxCharged, tokenDecimals), ' USDC');
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Tax difference: ',
      ethers.utils.formatUnits(previousTaxCharged.sub(newTaxToken), tokenDecimals),
      ' USDC (no refund)'
    );

    // Set allowance for the new tax amount (user still pays full new tax, no refund)
    await token.connect(user).approve(contractMarket.address, newTaxToken);

    const balanceBefore = await token.balanceOf(user.address);

    // Verify reward pool increased by the new tax amount
    const currentActiveFrame = await contractMarket.clcFrameKey((await ethers.provider.getBlock('latest')).timestamp);

    // Calculate the increase in taxes collected in the current frame
    const taxesCollectedBefore = await contractMarket.taxesCollectedInFrame(currentActiveFrame);

    // Get frame reward pool before update
    const frameBeforeUpdate = await contractMarket.frames(frameKey);
    const rewardPoolBeforeUpdate = frameBeforeUpdate.rewardPool;
    console.log('\x1b[33m%s\x1b[0m', '   Frame reward pool before update: ', fromQ96(rewardPoolBeforeUpdate, tokenDecimals).toString());

    // Execute the price update to lower value
    await contractMarket.connect(user).tradeLot(frameKey, lotKey, newAcquisitionPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const balanceDifference = balanceBefore.sub(balanceAfter);

    console.log(
      '\x1b[33m%s\x1b[0m',
      '   USDC paid for update to lower price: ',
      ethers.utils.formatUnits(balanceDifference, tokenDecimals),
      ' USDC'
    );

    // Check frame reward pool after update
    const frameAfterUpdate = await contractMarket.frames(frameKey);
    const rewardPoolAfterUpdate = frameAfterUpdate.rewardPool;

    console.log('\x1b[33m%s\x1b[0m', '   Frame reward pool after update: ', fromQ96(rewardPoolAfterUpdate, tokenDecimals).toString());

    // Execute the price update to lower value (already done above)
    const taxesCollectedAfter = await contractMarket.taxesCollectedInFrame(currentActiveFrame);
    const taxesCollected = taxesCollectedAfter.sub(taxesCollectedBefore);
    const expectedIncrease = toQ96(newTaxToken, tokenDecimals);
    expect(taxesCollected).to.be.closeTo(expectedIncrease, 1000);

    // Verify the user paid the full new tax amount (no refund for lower price)
    expect(balanceDifference).to.be.closeTo(newTaxToken, 1);

    // Get lot states after update
    const lotStatesAfter = await contractMarket.getLotStates(frameKey, lotKey);

    // Should have 2 states now
    expect(lotStatesAfter.length).to.equal(2);

    // Check second state (the update to lower price)
    const secondState = lotStatesAfter[1];
    const taxChargedInUpdate = fromQ96(secondState.taxCharged, tokenDecimals);

    expect(secondState.owner).to.equal(user.address);
    expect(secondState.acquisitionPrice).to.equal(newAcquisitionPriceQ96);
    expect(taxChargedInUpdate).to.be.closeTo(newTaxToken, 1);

    // Calculate total paid by user
    const totalTaxesPaid = previousTaxCharged.add(newTaxToken);
    console.log('\x1b[33m%s\x1b[0m', '   Total taxes paid by user: ', ethers.utils.formatUnits(totalTaxesPaid, tokenDecimals), ' USDC');
    console.log('\x1b[31m%s\x1b[0m', '   Note: No refund given for updating to lower price!');

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Lot price successfully updated to lower value');
  });

  it('Verify lot can be sold at the new lower price', async function () {
    const buyer = accounts[2];

    // Buyer needs to pay: new tax + last acquisition price (10 USDC)
    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const lastAcquisitionPrice = lotStates[lotStates.length - 1].acquisitionPrice;
    const lastAcquisitionPriceToken = fromQ96(lastAcquisitionPrice, tokenDecimals);

    // Buyer sets their own new acquisition price
    const buyerAcqPrice = ethers.utils.parseUnits('15', tokenDecimals);
    const buyerAcqPriceQ96 = toQ96(buyerAcqPrice, tokenDecimals);

    const buyerTaxQ96 = await contractMarket.clcTax(frameKey, buyerAcqPriceQ96);
    const buyerTaxToken = fromQ96(buyerTaxQ96, tokenDecimals);

    const totalBuyerPayment = buyerTaxToken.add(lastAcquisitionPriceToken);

    console.log('\x1b[36m%s\x1b[0m', '   Buyer acquisition price: ', ethers.utils.formatUnits(buyerAcqPrice, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Buyer tax: ', ethers.utils.formatUnits(buyerTaxToken, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Payment to seller: ', ethers.utils.formatUnits(lastAcquisitionPriceToken, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Total buyer payment: ', ethers.utils.formatUnits(totalBuyerPayment, tokenDecimals), ' USDC');

    await token.connect(buyer).approve(contractMarket.address, totalBuyerPayment);

    const sellerBalanceBefore = await token.balanceOf(user.address);

    // Execute the sale
    await contractMarket.connect(buyer).tradeLot(frameKey, lotKey, buyerAcqPriceQ96);

    const sellerBalanceAfter = await token.balanceOf(user.address);
    const sellerReceived = sellerBalanceAfter.sub(sellerBalanceBefore);

    console.log('\x1b[33m%s\x1b[0m', '   Seller received: ', ethers.utils.formatUnits(sellerReceived, tokenDecimals), ' USDC');

    // Verify seller received their last acquisition price (10 USDC, not the original 50 USDC)
    expect(sellerReceived).to.equal(lastAcquisitionPriceToken);

    // Verify ownership changed
    const finalLotStates = await contractMarket.getLotStates(frameKey, lotKey);
    expect(finalLotStates.length).to.equal(3);
    expect(finalLotStates[2].owner).to.equal(buyer.address);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Lot successfully sold at the lower price point');
  });

  it('Display final statistics', async function () {
    const globalPool = await contractMarket.getGlobalRewardPool();
    const frame = await contractMarket.frames(frameKey);

    console.log('\n\x1b[35m%s\x1b[0m', '   === Final Statistics ===');
    console.log('\x1b[35m%s\x1b[0m', '   Global reward pool: ', fromQ96(globalPool, tokenDecimals).toString(), ' USDC');

    // Get active frame to check taxes collected
    const blockFinal = await ethers.provider.getBlock('latest');
    const currentActiveFrameFinal = await contractMarket.clcFrameKey(blockFinal.timestamp);
    const taxesCollected = await contractMarket.taxesCollectedInFrame(currentActiveFrameFinal);
    console.log('\x1b[35m%s\x1b[0m', '   Taxes collected in active frame: ', fromQ96(taxesCollected, tokenDecimals).toString(), ' USDC');
    console.log('\x1b[35m%s\x1b[0m', '   Total lot states: ', (await contractMarket.getLotStates(frameKey, lotKey)).length);
    console.log('\x1b[35m%s\x1b[0m', '   50% will be distributed on settlement, 50% rolls to next frame');
  });
});
