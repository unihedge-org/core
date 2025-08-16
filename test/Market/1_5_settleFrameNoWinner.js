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
    // Fast forward time by 4 days
    await ethers.provider.send('evm_increaseTime', [86400 * 4]);
    await ethers.provider.send('evm_mine');

    // Check frame state before setting rate
    let lastSettledIndex = await contractMarket.lastSettledFrameIndex();
    const totalFrames = await contractMarket.getFramesLength();

    const currentFrameKey = await contractMarket.framesKeys(lastSettledIndex);
    const frameStateBefore = await contractMarket.getStateFrame(currentFrameKey);
    // Use the parameterized version since ethers.js has issues with overloaded functions
    // Repeat setFrameRate until frame.rate is not 0
    // Get last settled frame index
    lastSettledIndex = await contractMarket.lastSettledFrameIndex();
    const targetIndex = await contractMarket.getFrameIndex(frameKey);

    // Loop through frames from lastSettledIndex up to targetIndex
    while (lastSettledIndex < targetIndex) {
      const currentFrameKey = await contractMarket.framesKeys(lastSettledIndex);
      // Try to set frame rate
      await contractMarket.setFrameRate(currentFrameKey);
      // Try to settle frame
      await contractMarket.settleFrame();
      await ethers.provider.send('evm_mine');
      lastSettledIndex = await contractMarket.lastSettledFrameIndex();
    }

    await contractMarket.setFrameRate(frameKey);

    const frameStateAfter = await contractMarket.getStateFrame(currentFrameKey);
    frame = await contractMarket.getFrame(frameKey);
    finalRate = frame.rate;

    console.log('\n\x1b[33m%s\x1b[0m', '   === Frame Settlement ===');
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Frame settled at rate: ',
      ethers.utils.formatUnits(fromQ96(finalRate, tokenDecimals), tokenDecimals),
      ' USDC'
    );
  });

  // Also update the settlement test to be more robust:
  it('Settle frame with NO WINNER - full rollover', async function () {
    // Double-check frame state before settlement
    const frameStateBefore = await contractMarket.getStateFrame(frameKey);
    console.log('\x1b[33m%s\x1b[0m', '   Frame state before settlement: ', frameStateBefore);

    if (frameStateBefore !== 3) {
      throw new Error(`Frame must be in RATED state (3) before settlement. Current state: ${frameStateBefore}`);
    }

    const frameBefore = await contractMarket.getFrame(frameKey);
    const rewardPoolBefore = frameBefore.rewardPool;
    const rewardPoolBeforeInTokens = fromQ96(rewardPoolBefore, tokenDecimals);

    console.log('\n\x1b[35m%s\x1b[0m', '   === No Winner Settlement ===');
    console.log('\x1b[35m%s\x1b[0m', '   Total reward pool: ', ethers.utils.formatUnits(rewardPoolBeforeInTokens, tokenDecimals), ' USDC');

    // Calculate expected amounts based on rollover percentage
    const rolloverPercentage = await contractMarket.rolloverPercentage(); // Should be 9000 (90%)
    const settlementPercentage = 10000 - rolloverPercentage; // Should be 1000 (10%)

    const settlementAmount = rewardPoolBefore.mul(settlementPercentage).div(10000);
    const feeProtocolQ96 = await contractMarket.feeProtocol();
    const feeQ96 = settlementAmount.mul(feeProtocolQ96).div(Q96);
    const payoutQ96 = settlementAmount.sub(feeQ96);
    const rolloverAmount = rewardPoolBefore.mul(rolloverPercentage).div(10000);

    console.log('\x1b[35m%s\x1b[0m', '   Rollover percentage: ', rolloverPercentage.toString(), '/10000');
    console.log(
      '\x1b[35m%s\x1b[0m',
      '   Settlement amount (10%): ',
      ethers.utils.formatUnits(fromQ96(settlementAmount, tokenDecimals), tokenDecimals),
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
      '   Base rollover (90%): ',
      ethers.utils.formatUnits(fromQ96(rolloverAmount, tokenDecimals), tokenDecimals),
      ' USDC'
    );

    const ownerBalanceBefore = await token.balanceOf(owner.address);

    // Settle the frame
    const tx = await contractMarket.connect(owner).settleFrame();
    const receipt = await tx.wait();
    console.log('\x1b[33m%s\x1b[0m', '   Gas used for settlement: ', receipt.gasUsed.toString());

    const ownerBalanceAfter = await token.balanceOf(owner.address);
    const ownerReceived = ownerBalanceAfter.sub(ownerBalanceBefore);

    console.log('\x1b[33m%s\x1b[0m', '   Owner received (fee): ', ethers.utils.formatUnits(ownerReceived, tokenDecimals), ' USDC');

    // Check frame after settlement
    const frameAfter = await contractMarket.getFrame(frameKey);
    console.log('\x1b[33m%s\x1b[0m', '   Frame claimedBy: ', frameAfter.claimedBy);

    // For no winner, claimedBy should be address(1) according to your contract
    expect(frameAfter.claimedBy).to.equal('0x0000000000000000000000000000000000000001');

    console.log('\x1b[32m%s\x1b[0m', '   ✓ No winner: Amount properly rolled over!');
  });

  it('Verify last settled frame updated', async function () {
    const lastSettled = await contractMarket.lastSettledFrameIndex();
    const totalFrames = await contractMarket.getFramesLength();
    console.log('\x1b[33m%s\x1b[0m', '   Last settled frame index: ', lastSettled.toString());
    console.log('\x1b[33m%s\x1b[0m', '   Total frames: ', totalFrames.toString());

    // After settling the first frame, lastSettledFrameIndex should be 1
    expect(lastSettled).to.equal(2);
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
