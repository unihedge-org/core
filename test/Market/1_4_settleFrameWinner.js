const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

describe('Winner Scenario - Complete Flow', function () {
  let accounts,
    owner,
    winnerUser,
    loserUsers,
    token,
    wPOLContract,
    contractMarket,
    contractSwapRouter,
    frameKey,
    winningLotKey,
    startRate,
    finalRate,
    dPrice,
    tokenDecimals,
    baseUnit,
    Q96;

  before(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    winnerUser = accounts[1];
    loserUsers = accounts.slice(2, 6); // accounts 2-5 as losers

    const block = await ethers.provider.getBlock('latest');
    console.log('\x1b[33m%s\x1b[0m', '   Starting at block: ', block.number);

    // Setup contracts
    token = await ethers.getContractAt('IERC20Metadata', process.env.FUNDING_TOKEN, owner);
    wPOLContract = await ethers.getContractAt(IERC20.abi, process.env.WPOL_POLYGON, owner);
    contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, process.env.UNISWAP_ROUTER, owner);

    tokenDecimals = await token.decimals();
    baseUnit = ethers.BigNumber.from(10).pow(tokenDecimals);
    Q96 = ethers.BigNumber.from(2).pow(96);

    // Fund all users with tokens
    await swapTokenForUsers([winnerUser, ...loserUsers], wPOLContract, token, 9000, contractSwapRouter);

    // Verify winner has sufficient balance
    const winnerBalance = await token.balanceOf(winnerUser.address);
    console.log('\x1b[36m%s\x1b[0m', '   Winner USDC balance: ', ethers.utils.formatUnits(winnerBalance, tokenDecimals), ' $');
    expect(winnerBalance).to.be.gt(ethers.utils.parseUnits('100', tokenDecimals));
  });

  it('Deploy Market contract and setup frame', async function () {
    const Market = await ethers.getContractFactory('Market');
    const feeProtocol = 3; // 3%
    const feeMarket = 1; // 1%
    dPrice = 100; // 100 USDC price increment

    contractMarket = await Market.deploy(process.env.FUNDING_TOKEN, feeProtocol, feeMarket, dPrice, process.env.POOL);

    expect(await contractMarket.owner()).to.equal(owner.address);

    // Get the current rate which will be our baseline
    startRate = await contractMarket.clcRate();
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Start rate: ',
      ethers.utils.formatUnits(fromQ96(startRate, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // Create frame key for future settlement (3 days from now)
    const block = await ethers.provider.getBlock('latest');
    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);
    console.log('\x1b[33m%s\x1b[0m', '   Frame key: ', frameKey);
  });

  it('Winner buys lot at current rate (will be winning lot)', async function () {
    // Winner buys at the current rate - this will be the winning lot
    winningLotKey = await contractMarket.clcLotKey(startRate);

    console.log('\n\x1b[36m%s\x1b[0m', '   === Winner Purchase ===');
    console.log(
      '\x1b[36m%s\x1b[0m',
      '   Winner lot key: ',
      ethers.utils.formatUnits(fromQ96(winningLotKey, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    const acqRaw = ethers.utils.parseUnits('25', tokenDecimals); // 25 USDC acquisition
    const acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

    const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   Winner tax: ', ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');
    console.log('\x1b[36m%s\x1b[0m', '   Winner acquisition: ', ethers.utils.formatUnits(acqRaw, tokenDecimals), ' USDC');

    const winnerBalanceBefore = await token.balanceOf(winnerUser.address);

    await token.connect(winnerUser).approve(contractMarket.address, taxToken);
    await contractMarket.connect(winnerUser).tradeLot(frameKey, winningLotKey, acqPriceQ96);

    const winnerBalanceAfter = await token.balanceOf(winnerUser.address);
    const winnerSpent = winnerBalanceBefore.sub(winnerBalanceAfter);

    console.log('\x1b[36m%s\x1b[0m', '   Winner spent: ', ethers.utils.formatUnits(winnerSpent, tokenDecimals), ' USDC');

    // Verify the lot was created correctly
    const lot = await contractMarket.getLot(frameKey, winningLotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(winningLotKey);

    const lotStates = await contractMarket.getLotStates(frameKey, winningLotKey);
    expect(lotStates[0].owner).to.equal(winnerUser.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPriceQ96);
    expect(lotStates.length).to.equal(1);
  });

  it('Losers buy lots at different rates (far from winning rate)', async function () {
    console.log('\n\x1b[35m%s\x1b[0m', '   === Loser Purchases ===');

    let totalTaxesFromLosers = ethers.BigNumber.from(0);

    for (let i = 0; i < loserUsers.length; i++) {
      const loserUser = loserUsers[i];

      // Create lots far away from the current rate
      const offsetInTokens = ethers.utils.parseUnits((200 * (i + 1)).toString(), tokenDecimals);
      const offsetQ96 = toQ96(offsetInTokens, tokenDecimals);
      const farAwayRate = startRate.add(offsetQ96);

      const loserLotKey = await contractMarket.clcLotKey(farAwayRate);

      console.log(
        `   Loser ${i + 1} buying at rate: `,
        ethers.utils.formatUnits(fromQ96(loserLotKey, tokenDecimals), tokenDecimals),
        ' USDC'
      );

      const acqRaw = ethers.utils.parseUnits('15', tokenDecimals);
      const acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

      const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
      const taxToken = fromQ96(taxQ96, tokenDecimals);

      console.log(`   Loser ${i + 1} tax: `, ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');

      const balanceBefore = await token.balanceOf(loserUser.address);

      await token.connect(loserUser).approve(contractMarket.address, taxToken);
      await contractMarket.connect(loserUser).tradeLot(frameKey, loserLotKey, acqPriceQ96);

      const balanceAfter = await token.balanceOf(loserUser.address);
      const spent = balanceBefore.sub(balanceAfter);

      totalTaxesFromLosers = totalTaxesFromLosers.add(taxToken);

      expect(spent).to.be.closeTo(taxToken, 50);
    }

    console.log(
      '\x1b[35m%s\x1b[0m',
      '   Total taxes from losers: ',
      ethers.utils.formatUnits(totalTaxesFromLosers, tokenDecimals),
      ' USDC'
    );

    // Verify frame reward pool
    const frame = await contractMarket.frames(frameKey);
    const rewardPoolInTokens = fromQ96(frame.rewardPool, tokenDecimals);
    console.log('\x1b[35m%s\x1b[0m', '   Frame reward pool: ', ethers.utils.formatUnits(rewardPoolInTokens, tokenDecimals), ' USDC');
  });

  it('Wait and set frame rate (rate should match winner lot)', async function () {
    // Fast forward time by 4 days
    await ethers.provider.send('evm_increaseTime', [86400 * 4]);
    await ethers.provider.send('evm_mine');

    // Set the frame rate - this should be close to the start rate
    await contractMarket.connect(owner).setFrameRate(frameKey);

    const frame = await contractMarket.getFrame(frameKey);
    finalRate = frame.rate;

    console.log('\n\x1b[33m%s\x1b[0m', '   === Frame Settlement ===');
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Frame settled at rate: ',
      ethers.utils.formatUnits(fromQ96(finalRate, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Original start rate: ',
      ethers.utils.formatUnits(fromQ96(startRate, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // Calculate what the winning lot key should be
    const calculatedWinningLotKey = await contractMarket.clcLotKey(finalRate);
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Calculated winning lot: ',
      ethers.utils.formatUnits(fromQ96(calculatedWinningLotKey, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Our winner bought at: ',
      ethers.utils.formatUnits(fromQ96(winningLotKey, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // The winner should have the lot at or very close to the final rate
    expect(calculatedWinningLotKey).to.be.closeTo(winningLotKey, ethers.utils.parseUnits('10', tokenDecimals));
  });

  it('Settle frame WITH WINNER - payout to winner', async function () {
    const frameBefore = await contractMarket.getFrame(frameKey);
    const rewardPoolBefore = frameBefore.rewardPool;
    const rewardPoolBeforeInTokens = fromQ96(rewardPoolBefore, tokenDecimals);

    console.log('\n\x1b[32m%s\x1b[0m', '   === Winner Settlement ===');
    console.log('\x1b[32m%s\x1b[0m', '   Total reward pool: ', ethers.utils.formatUnits(rewardPoolBeforeInTokens, tokenDecimals), ' USDC');

    // Calculate expected amounts for winner scenario
    const halfPool = rewardPoolBefore.div(2);
    const feeProtocolQ96 = await contractMarket.feeProtocol();
    const feeQ96 = halfPool.mul(feeProtocolQ96).div(Q96);
    const payoutQ96 = halfPool.sub(feeQ96);

    console.log(
      '\x1b[32m%s\x1b[0m',
      '   50% for settlement: ',
      ethers.utils.formatUnits(fromQ96(halfPool, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[32m%s\x1b[0m',
      '   Protocol fee (3%): ',
      ethers.utils.formatUnits(fromQ96(feeQ96, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[32m%s\x1b[0m',
      '   Winner payout: ',
      ethers.utils.formatUnits(fromQ96(payoutQ96, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[32m%s\x1b[0m',
      '   50% rollover: ',
      ethers.utils.formatUnits(fromQ96(halfPool, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    const winnerBalanceBefore = await token.balanceOf(winnerUser.address);
    const ownerBalanceBefore = await token.balanceOf(owner.address);

    // Check next frame before settlement
    const nextFrameKey = frameKey.add(await contractMarket.period());
    let nextFrameRewardBefore = ethers.BigNumber.from(0);
    try {
      const nextFrame = await contractMarket.frames(nextFrameKey);
      nextFrameRewardBefore = nextFrame.rewardPool;
    } catch (e) {
      console.log('\x1b[33m%s\x1b[0m', '   Next frame will be created during settlement');
    }

    // Settle the frame
    const tx = await contractMarket.connect(owner).settleFrame();
    const receipt = await tx.wait();
    console.log('\x1b[33m%s\x1b[0m', '   Gas used for settlement: ', receipt.gasUsed.toString());

    const winnerBalanceAfter = await token.balanceOf(winnerUser.address);
    const ownerBalanceAfter = await token.balanceOf(owner.address);

    const winnerReceived = winnerBalanceAfter.sub(winnerBalanceBefore);
    const ownerReceived = ownerBalanceAfter.sub(ownerBalanceBefore);

    console.log('\x1b[32m%s\x1b[0m', '   Winner received: ', ethers.utils.formatUnits(winnerReceived, tokenDecimals), ' USDC');
    console.log('\x1b[33m%s\x1b[0m', '   Owner received (fee): ', ethers.utils.formatUnits(ownerReceived, tokenDecimals), ' USDC');

    // Verify amounts
    const expectedPayoutInTokens = fromQ96(payoutQ96, tokenDecimals);
    const expectedFeeInTokens = fromQ96(feeQ96, tokenDecimals);

    expect(winnerReceived).to.be.closeTo(expectedPayoutInTokens, 10);
    expect(ownerReceived).to.be.closeTo(expectedFeeInTokens, 10);

    // Check frame after settlement
    const frameAfter = await contractMarket.getFrame(frameKey);
    expect(frameAfter.claimedBy).to.equal(winnerUser.address);
    console.log('\x1b[32m%s\x1b[0m', '   Frame claimed by: ', frameAfter.claimedBy);

    // Check next frame got the rollover
    const nextFrame = await contractMarket.frames(nextFrameKey);
    const nextFrameRewardAfter = nextFrame.rewardPool;
    const rolloverReceived = nextFrameRewardAfter.sub(nextFrameRewardBefore);

    console.log('\n\x1b[35m%s\x1b[0m', '   === Flywheel Effect ===');
    console.log(
      '\x1b[35m%s\x1b[0m',
      '   Next frame reward after rollover: ',
      ethers.utils.formatUnits(fromQ96(nextFrameRewardAfter, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[35m%s\x1b[0m',
      '   Amount rolled over: ',
      ethers.utils.formatUnits(fromQ96(rolloverReceived, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // For winner scenario: only 50% base rolls over (no payout rollover)
    expect(rolloverReceived).to.be.closeTo(halfPool, 10000);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ Winner found and paid! 🎉');
  });

  it('Verify last settled frame updated', async function () {
    const lastSettled = await contractMarket.lastSettledFrameIndex();
    console.log('\x1b[33m%s\x1b[0m', '   Last settled frame index: ', lastSettled.toString());
    expect(lastSettled).to.equal(1);
  });

  it('Verify winner lot ownership and final state', async function () {
    console.log('\n\x1b[36m%s\x1b[0m', '   === Final Winner Verification ===');

    // Get the winning lot details
    const finalWinningLotKey = await contractMarket.clcLotKey(finalRate);
    const lotStates = await contractMarket.getLotStates(frameKey, finalWinningLotKey);

    expect(lotStates.length).to.be.gt(0);
    expect(lotStates[0].owner).to.equal(winnerUser.address);

    console.log('\x1b[36m%s\x1b[0m', '   Winning lot owner: ', lotStates[0].owner);
    console.log(
      '\x1b[36m%s\x1b[0m',
      '   Winning lot acquisition: ',
      ethers.utils.formatUnits(fromQ96(lotStates[0].acquisitionPrice, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[36m%s\x1b[0m',
      '   Winning lot tax paid: ',
      ethers.utils.formatUnits(fromQ96(lotStates[0].taxCharged, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    // Final frame state
    const finalFrame = await contractMarket.getFrame(frameKey);
    console.log('\x1b[36m%s\x1b[0m', '   Final frame claimedBy: ', finalFrame.claimedBy);
    console.log(
      '\x1b[36m%s\x1b[0m',
      '   Final frame rate: ',
      ethers.utils.formatUnits(fromQ96(finalFrame.rate, tokenDecimals), tokenDecimals),
      ' USDC'
    );
  });

  it('Display final winner statistics', async function () {
    const globalPool = await contractMarket.getGlobalRewardPool();
    const lastSettled = await contractMarket.lastSettledFrameIndex();
    const pendingReward = await contractMarket.getPendingRewardForNextSettlement();

    // Check the next frame's actual reward pool (the rollover amount)
    const nextFrameKey = frameKey.add(await contractMarket.period());
    const nextFrame = await contractMarket.frames(nextFrameKey);
    const actualRollover = fromQ96(nextFrame.rewardPool, tokenDecimals);

    console.log('\n\x1b[36m%s\x1b[0m', '   === Final Winner Statistics ===');
    console.log(
      '\x1b[36m%s\x1b[0m',
      '   Global reward pool: ',
      ethers.utils.formatUnits(fromQ96(globalPool, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log('\x1b[36m%s\x1b[0m', '   Frames settled: ', lastSettled.toString());
    console.log(
      '\x1b[36m%s\x1b[0m',
      '   Pending reward for next: ',
      ethers.utils.formatUnits(fromQ96(pendingReward, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log('\x1b[35m%s\x1b[0m', '   Next frame reward pool: ', ethers.utils.formatUnits(actualRollover, tokenDecimals), ' USDC');
    console.log('\x1b[33m%s\x1b[0m', '   Note: Pending=0 because next frame is OPENED (not RATED)');
    console.log('\x1b[33m%s\x1b[0m', '   The rollover went to the next frame which is accumulating rewards!');
    console.log('\x1b[32m%s\x1b[0m', '   Winner takes the prize! 🏆');
  });
});
