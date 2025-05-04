const { expect, ethers, IERC20, ISwapRouter, daiAddress, wMaticAddress, uniswapRouterAddress } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

/*
Random user buys a random lot in the range of 1 to 100 times dPrice (Q96)
*/
describe('Purchase one random empty lot', function () {
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
    expect(taxCharged).closeTo(diff, 1);
    expect(lotStates[0].taxRefunded).to.equal(0);
    expect(lotStates.length).to.equal(1);
  });
  it('Update price of lot to a higher number', async function () {
    const newAcquisitionPrice = ethers.utils.parseUnits('20', tokenDecimals); // 20 USDC raw
    const newAcquisitionPriceQ96 = toQ96(newAcquisitionPrice, tokenDecimals);

    const oldTaxQ96 = await contractMarket.clcTax(frameKey, acqPriceQ96);
    const newTaxQ96 = await contractMarket.clcTax(frameKey, newAcquisitionPriceQ96);

    const taxDifferenceQ96 = newTaxQ96.sub(oldTaxQ96);
    const taxDifferenceTokenUnits = fromQ96(taxDifferenceQ96, tokenDecimals);

    // Set allowance for the new tax amount
    await token.connect(user).approve(contractMarket.address, taxDifferenceTokenUnits);

    const balanceBefore = await token.balanceOf(user.address);

    await contractMarket.connect(user).tradeLot(frameKey, lotKey, newAcquisitionPriceQ96);

    const balanceAfter = await token.balanceOf(user.address);
    const balanceDifference = balanceBefore.sub(balanceAfter);

    console.log('   Tax difference (Q96):', taxDifferenceQ96.toString());
    console.log('   Tax difference (token):', ethers.utils.formatUnits(taxDifferenceTokenUnits, tokenDecimals));
    console.log('   Actual token diff:', ethers.utils.formatUnits(balanceDifference, tokenDecimals));

    const delta = taxDifferenceTokenUnits.sub(balanceDifference).abs();
    expect(delta).to.be.lte(5); // allow 1 unit difference, e.g., 0.000001 USDC

    // Get lot states after update
    let lotStates = await contractMarket.getLotStates(frameKey, lotKey);
    let taxCharged = fromQ96(lotStates[1].taxCharged, tokenDecimals);
    expect(lotStates[1].owner).to.equal(user.address);
    expect(taxCharged).closeTo(balanceDifference, 1);
    expect(lotStates[1].acquisitionPrice).to.equal(newAcquisitionPriceQ96);
  });
});
