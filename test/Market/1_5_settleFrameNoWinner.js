const { expect, ethers, IERC20, ISwapRouter, time } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

describe('Settle frame and reward winning lot', function () {
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
    const feeMarket = 1; // percent
    dPrice = Number(100); // 100 USDC
    contractMarket = await Market.deploy(process.env.FUNDING_TOKEN, feeProtocol, feeMarket, dPrice, process.env.POOL);

    expect(await contractMarket.owner()).to.equal(accounts[0].address);
    expect(await contractMarket.period()).to.equal(86400);

    const _dPrice = await contractMarket.dPrice();
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   dPrice (formatted): ',
      ethers.utils.formatUnits(fromQ96(_dPrice, tokenDecimals), tokenDecimals),
      ' USDC'
    );
    // expect(dPrice).to.be.equal(Number(ethers.utils.formatUnits(fromQ96(_dPrice, tokenDecimals), tokenDecimals)).toFixed(0));

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
  it('5 users buy 5 random lots', async function () {
    const block = await ethers.provider.getBlock('latest');
    frameKey = await contractMarket.clcFrameKey(block.timestamp + 270000);
    console.log('   Frame key: ', frameKey);

    for (let i = 1; i < 5; i++) {
      const loserUser = accounts[i];
      const pairPrice = rateAtStart.add(await contractMarket.dPrice()).mul(i + 2);
      const acqRaw = ethers.utils.parseUnits('15', tokenDecimals);
      const acqPriceQ96 = toQ96(acqRaw, tokenDecimals);
      const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
      const taxToken = fromQ96(taxQ96, tokenDecimals);

      const balanceBefore = await token.balanceOf(loserUser.address);
      await token.connect(loserUser).approve(contractMarket.address, taxToken);
      await contractMarket.connect(loserUser).tradeLot(frameKey, pairPrice, acqPriceQ96);
      const balanceAfter = await token.balanceOf(loserUser.address);

      const diff = balanceBefore.sub(balanceAfter);
      console.log('   USDC Difference:', ethers.utils.formatUnits(diff, tokenDecimals), 'USDC');
      expect(diff).to.be.closeTo(taxToken, 50);
    }
  });

  it('Skip time to end of frame', async function () {
    const block = await ethers.provider.getBlock('latest');
    console.log('   Block timestamp: ', block.timestamp);
    await time.increaseTo(frameKey.add(86400 * 3));
    const block2 = await ethers.provider.getBlock('latest');
    console.log('   Current block timestamp: ', block2.timestamp);
    await contractMarket.setFrameRate(frameKey);
  });

  it('Settle frame with no winner', async function () {
    const lotKey = await contractMarket.clcLotKey(rateAtStart);
    const lotState = await contractMarket.getStateLot(frameKey, lotKey);
    expect(lotState).to.equal(0);

    const frameState = await contractMarket.getStateFrame(frameKey);
    expect(frameState).to.equal(3);

    const balanceBeforeOwner = await token.balanceOf(owner.address);
    await contractMarket.settleFrame();
    const balanceAfterOwner = await token.balanceOf(owner.address);

    const frame = await contractMarket.getFrame(frameKey);
    // const expectedTotal = fromQ96(frame[5].add(frame[6]), tokenDecimals);

    expect(frame[3]).to.equal(owner.address);
    // expect(balanceAfterOwner).to.be.closeTo(balanceBeforeOwner.add(expectedTotal), 5);

    // Get balance of the contract
    const contractBalance = await token.balanceOf(contractMarket.address);
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Contract balance after settlement: ',
      ethers.utils.formatUnits(contractBalance, tokenDecimals),
      ' USDC'
    );
  });
});
