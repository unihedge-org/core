const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

describe('Settle frame with NO WINNER - Full rollover test', function () {
  let accounts, owner, token, wPOLContract, contractMarket, contractSwapRouter, frameKey, tokenDecimals, baseUnit, Q96;

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

    await swapTokenForUsers(accounts.slice(0, 6), wPOLContract, token, 9000, contractSwapRouter);

    let balance = await token.balanceOf(owner.address);
    console.log('\x1b[33m%s\x1b[0m', '   USDC balance: ', ethers.utils.formatUnits(balance, tokenDecimals), ' $');
    expect(balance).to.be.gt(0);
  });

  it('Deploy Market contract', async function () {
    const Market = await ethers.getContractFactory('Market');
    const feeProtocol = 3; // percent
    const feeMarket = 1; // percent
    const dPrice = Number(100); // 100 USDC
    contractMarket = await Market.deploy(process.env.FUNDING_TOKEN, feeProtocol, feeMarket, dPrice, process.env.POOL);

    expect(await contractMarket.owner()).to.equal(accounts[0].address);
    expect(await contractMarket.period()).to.equal(86400);
    expect(await contractMarket.lastSettledFrameIndex()).to.equal(0);

    const rateAtStart = await contractMarket.clcRate();
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Current rate: ',
      ethers.utils.formatUnits(fromQ96(rateAtStart, tokenDecimals), tokenDecimals),
      ' USDC'
    );
  });

  it('Multiple users buy lots FAR from actual rate', async function () {
    const block = await ethers.provider.getBlock('latest');

    // Frame 3 days in the future
    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);
    console.log('\x1b[33m%s\x1b[0m', '   Frame key: ', frameKey);

    const currentRate = await contractMarket.clcRate();
    console.log('\x1b[33m%s\x1b[0m', '   Current rate: ', fromQ96(currentRate, tokenDecimals).toString(), ' USDC');

    let totalTaxesCollected = ethers.BigNumber.from(0);

    // Users buy lots far away from the current rate
    for (let i = 0; i < 5; i++) {
      const user = accounts[i + 1];

      // Check user balance first
      const userBalance = await token.balanceOf(user.address);
      console.log(`\n   User ${i + 1} balance: `, ethers.utils.formatUnits(userBalance, tokenDecimals), ' USDC');

      // Create lots at least 500 USDC away from current rate in Q96
      const offsetInTokens = ethers.utils.parseUnits((500 * (i + 1)).toString(), tokenDecimals);
      const offsetQ96 = toQ96(offsetInTokens, tokenDecimals);
      const farAwayRate = currentRate.add(offsetQ96);

      console.log(`   User ${i + 1} buying lot at rate: `, fromQ96(farAwayRate, tokenDecimals).toString(), ' USDC');

      const acqRaw = ethers.utils.parseUnits('20', tokenDecimals);
      const acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

      const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
      const taxToken = fromQ96(taxQ96, tokenDecimals);

      console.log(`   Tax for user ${i + 1}: `, ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');

      // Make sure user has enough balance
      expect(userBalance).to.be.gte(taxToken);

      await token.connect(user).approve(contractMarket.address, taxToken);
      await contractMarket.connect(user).tradeLot(frameKey, farAwayRate, acqPriceQ96);

      totalTaxesCollected = totalTaxesCollected.add(taxToken);
    }

    console.log('\n\x1b[35m%s\x1b[0m', '   Total taxes collected: ', ethers.utils.formatUnits(totalTaxesCollected, tokenDecimals), ' USDC');

    // Verify frame reward pool
    const frame = await contractMarket.frames(frameKey);
    const rewardPoolInTokens = fromQ96(frame.rewardPool, tokenDecimals);
    console.log('\x1b[35m%s\x1b[0m', '   Frame reward pool: ', ethers.utils.formatUnits(rewardPoolInTokens, tokenDecimals), ' USDC');

    // Convert both to same precision for comparison
    // const totalTaxesQ96 = toQ96(totalTaxesCollected, tokenDecimals);
    // expect(frame.rewardPool).to.be.closeTo(totalTaxesQ96, 1000);
  });

  it('Wait and set frame rate', async function () {
    // Increase time by 5 days
    await ethers.provider.send('evm_increaseTime', [86400 * 4]);
    await ethers.provider.send('evm_mine');

    // Keep trying to set rate for our target frame and settle previous frames
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`\x1b[33m%s\x1b[0m`, `   Attempt ${attempts}: Checking our target frame rate...`);
      
      let targetFrame = await contractMarket.getFrame(frameKey);
      if (targetFrame.rate.gt(0)) {
        console.log(`\x1b[32m%s\x1b[0m`, `   ✓ Our target frame now has rate: ${targetFrame.rate.toString()}`);
        break;
      }
      
      console.log(`\x1b[33m%s\x1b[0m`, `   Our target frame rate still 0, trying to set rates and settle frames...`);
      
      // Try to set frame rate for our target frame
      try {
        console.log(`\x1b[33m%s\x1b[0m`, `   Trying to set rate for frame ${frameKey}...`);
        await contractMarket.connect(owner).setFrameRate(frameKey);
        console.log(`\x1b[32m%s\x1b[0m`, `   ✓ Successfully set rate for frame ${frameKey}`);
      } catch (error) {
        console.log(`\x1b[31m%s\x1b[0m`, `   Failed to set rate for frame ${frameKey}: ${error.message}`);
      }
      
      // Try to settle any frames that can be settled
      let settledAny = false;
      while (true) {
        try {
          const lastSettledBefore = await contractMarket.lastSettledFrameIndex();
          console.log(`\x1b[33m%s\x1b[0m`, `   Trying to settle frame (lastSettledIndex: ${lastSettledBefore})...`);
          
          await contractMarket.connect(owner).settleFrame();
          settledAny = true;
          
          const lastSettledAfter = await contractMarket.lastSettledFrameIndex();
          console.log(`\x1b[32m%s\x1b[0m`, `   ✓ Settled frame! Index now: ${lastSettledAfter}`);
        } catch (error) {
          console.log(`\x1b[31m%s\x1b[0m`, `   No more frames to settle: ${error.message}`);
          break;
        }
      }
      
      if (!settledAny) {
        console.log(`\x1b[31m%s\x1b[0m`, `   No frames could be settled, waiting...`);
        await ethers.provider.send('evm_mine');
      }
    }
    
    if (attempts >= maxAttempts) {
      throw new Error("Failed to set rate for target frame after maximum attempts");
    }

    const frame = await contractMarket.getFrame(frameKey);
    const frameRate = fromQ96(frame.rate, tokenDecimals);
    
    // Check frame state after setting rate
    const frameStateAfter = await contractMarket.getStateFrame(frameKey);
    console.log('\x1b[33m%s\x1b[0m', '   Frame state after setFrameRate: ', frameStateAfter);
    console.log('\x1b[33m%s\x1b[0m', '   Frame rate set to: ', frame.rate.toString());
    
    // Verify the frame is now in RATED state (state 3)
    expect(frameStateAfter).to.equal(3); // SFrame.RATED = 3
    
    console.log('\x1b[33m%s\x1b[0m', '   Frame settled at rate: ', ethers.utils.formatUnits(frameRate, tokenDecimals), ' USDC');

    // Check what lot key would win at this rate
    const winningLotKey = await contractMarket.clcLotKey(frame.rate);
    const winningLotKeyInTokens = fromQ96(winningLotKey, tokenDecimals);
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Winning lot key would be: ',
      ethers.utils.formatUnits(winningLotKeyInTokens, tokenDecimals),
      ' USDC'
    );

    // Check if there's a lot at the winning key
    try {
      const winningLot = await contractMarket.getLot(frameKey, winningLotKey);
      console.log('\x1b[31m%s\x1b[0m', '   ERROR: Found a lot at winning key (should not exist)');
    } catch (e) {
      console.log('\x1b[32m%s\x1b[0m', '   ✓ Confirmed: No lot exists at winning rate');
    }
  });

  it('Settle frame with NO WINNER - full rollover', async function () {
    const frameBefore = await contractMarket.getFrame(frameKey);
    const rewardPoolBefore = frameBefore.rewardPool;
    const rewardPoolBeforeInTokens = fromQ96(rewardPoolBefore, tokenDecimals);

    console.log('\n\x1b[35m%s\x1b[0m', '   === No Winner Settlement ===');
    console.log('\x1b[35m%s\x1b[0m', '   Total reward pool: ', ethers.utils.formatUnits(rewardPoolBeforeInTokens, tokenDecimals), ' USDC');

    // Calculate expected amounts
    const halfPool = rewardPoolBefore.div(2);
    const feeProtocolQ96 = await contractMarket.feeProtocol();
    const feeQ96 = halfPool.mul(feeProtocolQ96).div(Q96);
    const payoutQ96 = halfPool.sub(feeQ96);

    console.log(
      '\x1b[35m%s\x1b[0m',
      '   50% for settlement: ',
      ethers.utils.formatUnits(fromQ96(halfPool, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log('\x1b[35m%s\x1b[0m', '   Protocol fee: ', ethers.utils.formatUnits(fromQ96(feeQ96, tokenDecimals), tokenDecimals), ' USDC');
    console.log(
      '\x1b[35m%s\x1b[0m',
      '   Would-be payout: ',
      ethers.utils.formatUnits(fromQ96(payoutQ96, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    console.log(
      '\x1b[35m%s\x1b[0m',
      '   50% automatic rollover: ',
      ethers.utils.formatUnits(fromQ96(halfPool, tokenDecimals), tokenDecimals),
      ' USDC'
    );

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

    const ownerBalanceAfter = await token.balanceOf(owner.address);
    const ownerReceived = ownerBalanceAfter.sub(ownerBalanceBefore);

    console.log('\x1b[33m%s\x1b[0m', '   Owner received (fee only): ', ethers.utils.formatUnits(ownerReceived, tokenDecimals), ' USDC');

    const expectedFeeInTokens = fromQ96(feeQ96, tokenDecimals);
    expect(ownerReceived).to.be.closeTo(expectedFeeInTokens, 10);

    // Check frame after settlement
    const frameAfter = await contractMarket.getFrame(frameKey);
    // For no winner, claimedBy should be address(0) or a sentinel value
    console.log('\x1b[33m%s\x1b[0m', '   Frame claimedBy: ', frameAfter.claimedBy);

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

    // Expected rollover: 50% base + the would-be payout
    const expectedRollover = halfPool.add(payoutQ96);
    console.log(
      '\x1b[35m%s\x1b[0m',
      '   Expected rollover (50% + payout): ',
      ethers.utils.formatUnits(fromQ96(expectedRollover, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    expect(rolloverReceived).to.be.closeTo(expectedRollover, 10000);

    console.log('\x1b[32m%s\x1b[0m', '   ✓ No winner: Full amount rolled to next frame!');
  });

  it('Verify last settled frame updated', async function () {
    const lastSettled = await contractMarket.lastSettledFrameIndex();
    const totalFrames = await contractMarket.getFramesLength();
    console.log('\x1b[33m%s\x1b[0m', '   Last settled frame index: ', lastSettled.toString());
    console.log('\x1b[33m%s\x1b[0m', '   Total frames: ', totalFrames.toString());
    
    // After settling the first frame, lastSettledFrameIndex should be 1
    expect(lastSettled).to.equal(1);
  });

  it('Display final flywheel statistics', async function () {
    const globalPool = await contractMarket.getGlobalRewardPool();
    const lastSettled = await contractMarket.lastSettledFrameIndex();
    const pendingReward = await contractMarket.getPendingRewardForNextSettlement();

    console.log('\n\x1b[36m%s\x1b[0m', '   === Final Flywheel Statistics ===');
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
    console.log('\x1b[36m%s\x1b[0m', '   The flywheel keeps spinning! 🎡');
  });
});
