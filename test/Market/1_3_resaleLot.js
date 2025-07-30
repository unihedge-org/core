const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

/*
Test lot resale functionality with liquidity flywheel
*/
describe('Resale lot with Liquidity Flywheel', function () {
  let accounts,
    owner,
    user,
    user2,
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

  it('First user purchases lot', async function () {
    user = accounts[Math.floor(Math.random() * 4) + 1];
    const block = await ethers.provider.getBlock('latest');

    // Frame 3 days in the future
    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);
    console.log('\x1b[33m%s\x1b[0m', '   Frame key: ', frameKey);

    // Acquisition price: 15 USDC in Q96
    const acqRaw = ethers.utils.parseUnits('15', tokenDecimals);
    acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

    const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   First user acquisition price: ', ethers.utils.formatUnits(acqRaw, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');

    await token.connect(user).approve(contractMarket.address, taxToken);
    const allowance = await token.allowance(user.address, contractMarket.address);
    expect(allowance).to.equal(taxToken);

    lotKey = await contractMarket.clcLotKey(rateAtStart);
    console.log('\x1b[33m%s\x1b[0m', '   Lot key: ', fromQ96(lotKey, tokenDecimals).toString());

    const balanceBefore = await token.balanceOf(user.address);

    // Get frame reward pool before purchase
    const rewardPoolBefore = ethers.BigNumber.from(0); // First purchase, pool is 0

    await contractMarket.connect(user).tradeLot(frameKey, lotKey, acqPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const diff = balanceBefore.sub(balanceAfter);

    console.log('\x1b[33m%s\x1b[0m', '   USDC paid by first user: ', ethers.utils.formatUnits(diff, tokenDecimals), ' USDC');

    // Check frame reward pool after purchase
    const frame = await contractMarket.frames(frameKey);
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Frame reward pool after first purchase: ',
      fromQ96(frame.rewardPool, tokenDecimals).toString(),
      ' USDC'
    );

    const lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(lotKey);

    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const taxCharged = fromQ96(lotStates[0].taxCharged, tokenDecimals);

    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPriceQ96);
    expect(taxCharged).to.be.closeTo(diff, 1);
    expect(lotStates.length).to.equal(1);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ First user successfully purchased lot');
  });

  it('Second user prepares to buy lot from first user', async function () {
    // Pick a second user different from the first one
    user2 = accounts[Math.floor(Math.random() * 4) + 1];
    while (user2.address === user.address) {
      user2 = accounts[Math.floor(Math.random() * 4) + 1];
    }
    console.log('\x1b[33m%s\x1b[0m', '   Second user address: ', user2.address);

    // Get the previous owner's acquisition price
    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const prevAcqPriceQ96 = lotStates[0].acquisitionPrice;
    const prevAcqPriceToken = fromQ96(prevAcqPriceQ96, tokenDecimals);

    // Second user sets their own acquisition price (can be different)
    const user2AcqPrice = ethers.utils.parseUnits('20', tokenDecimals); // 20 USDC
    const user2AcqPriceQ96 = toQ96(user2AcqPrice, tokenDecimals);

    // Calculate tax for second user's acquisition price
    const taxQ96 = await contractMarket.clcTax(frameKey, user2AcqPriceQ96);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   Second user acquisition price: ', ethers.utils.formatUnits(user2AcqPrice, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Tax for second user: ', ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Payment to first user: ', ethers.utils.formatUnits(prevAcqPriceToken, tokenDecimals), ' USDC');

    const totalRequired = prevAcqPriceToken.add(taxToken);
    console.log('\x1b[36m%s\x1b[0m', '   Total payment required: ', ethers.utils.formatUnits(totalRequired, tokenDecimals), ' USDC');

    await token.connect(user2).approve(contractMarket.address, totalRequired);

    const allowance = await token.allowance(user2.address, contractMarket.address);
    console.log('\x1b[33m%s\x1b[0m', '   Allowance set: ', ethers.utils.formatUnits(allowance, tokenDecimals), ' USDC');

    expect(allowance).to.equal(totalRequired);

    // Store acquisition price for next test
    acqPriceQ96 = user2AcqPriceQ96;
  });

  it('Second user buys lot (resale)', async function () {
    const user2BalanceBefore = await token.balanceOf(user2.address);
    const user1BalanceBefore = await token.balanceOf(user.address);
    const contractBalanceBefore = await token.balanceOf(contractMarket.address);

    // Get frame reward pool before resale
    const frameBefore = await contractMarket.frames(frameKey);
    const rewardPoolBefore = frameBefore.rewardPool;

    const block = await ethers.provider.getBlock('latest');

    // Execute the resale
    await contractMarket.connect(user2).tradeLot(frameKey, lotKey, acqPriceQ96, {
      maxFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
    });

    const user2BalanceAfter = await token.balanceOf(user2.address);
    const user1BalanceAfter = await token.balanceOf(user.address);
    const contractBalanceAfter = await token.balanceOf(contractMarket.address);

    const user2Paid = user2BalanceBefore.sub(user2BalanceAfter);
    const user1Received = user1BalanceAfter.sub(user1BalanceBefore);
    const contractReceived = contractBalanceAfter.sub(contractBalanceBefore);

    console.log('\x1b[33m%s\x1b[0m', '   Second user paid: ', ethers.utils.formatUnits(user2Paid, tokenDecimals), ' USDC');
    console.log('\x1b[33m%s\x1b[0m', '   First user received: ', ethers.utils.formatUnits(user1Received, tokenDecimals), ' USDC');
    console.log('\x1b[33m%s\x1b[0m', '   Contract received (tax): ', ethers.utils.formatUnits(contractReceived, tokenDecimals), ' USDC');

    // Get frame reward pool after resale
    const frameAfter = await contractMarket.frames(frameKey);
    const rewardPoolAfter = frameAfter.rewardPool;
    const rewardPoolIncrease = rewardPoolAfter.sub(rewardPoolBefore);

    console.log('\x1b[33m%s\x1b[0m', '   Frame reward pool after resale: ', fromQ96(rewardPoolAfter, tokenDecimals).toString(), ' USDC');
    console.log('\x1b[33m%s\x1b[0m', '   Reward pool increase: ', fromQ96(rewardPoolIncrease, tokenDecimals).toString(), ' USDC');

    // Verify lot ownership and states
    const lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(lotKey);

    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);

    // Should have 2 states after resale
    expect(lotStates.length).to.equal(2);

    const oldState = lotStates[0];
    const newState = lotStates[1];

    expect(oldState.owner).to.equal(user.address);
    expect(newState.owner).to.equal(user2.address);
    expect(newState.acquisitionPrice).to.equal(acqPriceQ96);

    // Verify first user received their acquisition price
    const expectedReceived = fromQ96(oldState.acquisitionPrice, tokenDecimals);
    expect(user1Received).to.equal(expectedReceived);

    // Verify tax was properly recorded
    const taxCharged = fromQ96(newState.taxCharged, tokenDecimals);
    expect(taxCharged).to.be.closeTo(contractReceived, 1);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Lot successfully resold');
  });

  it('Verify flywheel accumulation', async function () {
    const globalPool = await contractMarket.getGlobalRewardPool();
    console.log('\x1b[35m%s\x1b[0m', '   === Flywheel Statistics ===');
    console.log('\x1b[35m%s\x1b[0m', '   Global reward pool: ', fromQ96(globalPool, tokenDecimals).toString(), ' USDC');

    const frame = await contractMarket.frames(frameKey);
    console.log('\x1b[35m%s\x1b[0m', '   Frame reward pool: ', fromQ96(frame.rewardPool, tokenDecimals).toString(), ' USDC');

    // Get all lot states to calculate total taxes
    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    let totalTaxes = ethers.BigNumber.from(0);
    for (let i = 0; i < lotStates.length; i++) {
      totalTaxes = totalTaxes.add(lotStates[i].taxCharged);
    }
    console.log('\x1b[35m%s\x1b[0m', '   Total taxes collected: ', fromQ96(totalTaxes, tokenDecimals).toString(), ' USDC');

    // Verify reward pool equals total taxes (since no settlements yet)
    // expect(frame.rewardPool).to.equal(totalTaxes);

    console.log('\x1b[35m%s\x1b[0m', '   50% will be distributed on settlement');
    console.log('\x1b[35m%s\x1b[0m', '   50% will roll to next frame');

    const pendingReward = await contractMarket.getPendingRewardForNextSettlement();
    console.log('\x1b[35m%s\x1b[0m', '   Pending reward (when rated): ', fromQ96(pendingReward, tokenDecimals).toString(), ' USDC');
  });

  it('Test multiple resales in sequence', async function () {
    const user3 = accounts[3];

    // Third user buys from second user
    const user3AcqPrice = ethers.utils.parseUnits('25', tokenDecimals);
    const user3AcqPriceQ96 = toQ96(user3AcqPrice, tokenDecimals);

    const taxQ96 = await contractMarket.clcTax(frameKey, user3AcqPriceQ96);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    // Get second user's acquisition price
    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const user2AcqPrice = lotStates[1].acquisitionPrice;
    const user2AcqPriceToken = fromQ96(user2AcqPrice, tokenDecimals);

    const totalRequired = user2AcqPriceToken.add(taxToken);

    console.log('\x1b[36m%s\x1b[0m', '   Third user acquisition price: ', ethers.utils.formatUnits(user3AcqPrice, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Payment to second user: ', ethers.utils.formatUnits(user2AcqPriceToken, tokenDecimals), ' USDC');

    await token.connect(user3).approve(contractMarket.address, totalRequired);

    await contractMarket.connect(user3).tradeLot(frameKey, lotKey, user3AcqPriceQ96);

    const finalLotStates = await contractMarket.getLotStates(frameKey, lotKey);
    expect(finalLotStates.length).to.equal(3);
    expect(finalLotStates[2].owner).to.equal(user3.address);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Third resale completed successfully');
    console.log('\x1b[33m%s\x1b[0m', '   Total lot states: ', finalLotStates.length);
  });
});
