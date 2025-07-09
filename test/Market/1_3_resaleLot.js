const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe('Resale lot', function () {
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

  it('Approve USDC to spend and Purchase Lot', async function () {
    user = accounts[Math.floor(Math.random() * 4) + 1];
    const block = await ethers.provider.getBlock('latest');

    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);

    // Acquisition price: 15 USDC in Q96
    const acqRaw = ethers.utils.parseUnits('15', tokenDecimals);
    acqPriceQ96 = toQ96(acqRaw, tokenDecimals);

    const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(taxToken, tokenDecimals), ' USDC');

    await token.connect(user).approve(contractMarket.address, taxToken);
    const allowance = await token.allowance(user.address, contractMarket.address);
    expect(allowance).to.equal(taxToken);

    lotKey = await contractMarket.clcLotKey(rateAtStart);
    const balanceBefore = await token.balanceOf(user.address);

    await contractMarket.connect(user).tradeLot(frameKey, lotKey, acqPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const diff = balanceBefore.sub(balanceAfter);

    console.log('\x1b[33m%s\x1b[0m', '   USDC Difference: ', ethers.utils.formatUnits(diff, tokenDecimals), ' USDC');

    const lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(lotKey);

    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const taxCharged = fromQ96(lotStates[0].taxCharged, tokenDecimals);

    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPriceQ96);
    expect(lotStates[0].taxCharged).to.equal(toQ96(diff, tokenDecimals));
    expect(lotStates.length).to.equal(1);
  });
  it('second user approves USDC for purchase', async function () {
    // Pick a second user different from the first one
    user2 = accounts[Math.floor(Math.random() * 4) + 1];
    while (user2.address === user.address) {
      user2 = accounts[Math.floor(Math.random() * 4) + 1];
    }

    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    const prevAcqPriceQ96 = lotStates[0].acquisitionPrice;

    const taxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);

    const prevAcqPriceToken = fromQ96(prevAcqPriceQ96, tokenDecimals);
    const taxToken = fromQ96(taxQ96, tokenDecimals);

    const totalRequired = prevAcqPriceToken.add(taxToken);
    await token.connect(user2).approve(contractMarket.address, totalRequired);

    const allowance = await token.allowance(user2.address, contractMarket.address);
    console.log('\x1b[33m%s\x1b[0m', '   Allowance: ', ethers.utils.formatUnits(allowance, tokenDecimals), ' USDC');

    expect(allowance).to.equal(totalRequired);
  });

  it('second user buys lot', async function () {
    const balanceBefore = await token.balanceOf(user2.address);
    const block = await ethers.provider.getBlock('latest');

    await contractMarket.connect(user2).tradeLot(frameKey, lotKey, acqPriceQ96, {
      maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas)),
    });

    const balanceAfter = await token.balanceOf(user2.address);
    const diff = balanceBefore.sub(balanceAfter);
    console.log('\x1b[33m%s\x1b[0m', '   USDC Difference: ', ethers.utils.formatUnits(diff, tokenDecimals), ' USDC');

    const lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(lotKey);

    const lotStates = await contractMarket.getLotStates(frameKey, lotKey);

    const oldState = lotStates[0];
    const newState = lotStates[1];

    expect(oldState.owner).to.equal(user.address);
    expect(newState.owner).to.equal(user2.address);
    expect(newState.acquisitionPrice).to.equal(acqPriceQ96);

    expect(lotStates.length).to.equal(3);
  });
});
