const { expect, ethers, IERC20, ISwapRouter, fs, time } = require('../Helpers/imports');
const { swapTokenForUsers } = require('../Helpers/functions.js');

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
    swapRouter,
    frameKey,
    dPrice,
    acqPrice,
    tax,
    rateAtStart,
    tokenDecimals;
  let pairPrice = ethers.BigNumber.from('0');

  before(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];

    //Get current block number
    const block = await ethers.provider.getBlock('latest');
    console.log('\x1b[33m%s\x1b[0m', '   Current block: ', block.number);

    //Contracts are loaded from addresses
    token = await ethers.getContractAt(IERC20.abi, process.env.FUNDING_TOKEN, owner);
    wPOLContract = await ethers.getContractAt(IERC20.abi, process.env.WPOL_POLYGON, owner);
    contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, process.env.UNISWAP_ROUTER, owner);

    // GET ETH Balance of the first account
    let balanceMain = await ethers.provider.getBalance(owner.address);
    console.log('\x1b[33m%s\x1b[0m', ' POL balance: ', ethers.utils.formatUnits(balanceMain, 18), ' ETH');

    //users, tokenIn, tokenOut, amountInEther(matic), contractSwapRouter
    await swapTokenForUsers(accounts.slice(0, 5), wPOLContract, token, 9000, contractSwapRouter);
    //Check if USDC balance is greater than 0
    let balance = await token.balanceOf(owner.address);
    tokenDecimals = await token.decimals();
    console.log('\x1b[33m%s\x1b[0m', '   USDC balance: ', ethers.utils.formatUnits(balance, tokenDecimals), ' USDC');
    expect(balance).to.be.gt(0);
  });
  it('Deploy Market contract', async function () {
    const Market = await ethers.getContractFactory('Market');
    contractMarket = await Market.deploy(process.env.FUNDING_TOKEN, 30000, 10000);
    //Expect owner to be first account
    expect(await contractMarket.owner()).to.equal(accounts[0].address);
    //Expect period to be 1 day in seconds
    expect(await contractMarket.period()).to.equal(86400);

    //get dPrice
    dPrice = await contractMarket.dPrice();
    console.log('\x1b[33m%s\x1b[0m', '   dPrice: ', ethers.utils.formatUnits(dPrice, tokenDecimals), ' USDC');
    expect(dPrice).to.be.gt(0);
  });
  it('calculate current rate', async function () {
    //Get current rate
    rateAtStart = await contractMarket.clcRate();
    console.log('\x1b[33m%s\x1b[0m', '   Current rate of ETH/USDC: ', ethers.utils.formatUnits(rateAtStart, tokenDecimals), ' USDC');
    expect(rateAtStart).to.be.gt(0);
  });

  it('Approve tokens to spend', async function () {
    //Select random account
    user = accounts[Math.floor(Math.random() * 4) + 1];
    //get current block timestamp
    const block = await ethers.provider.getBlock('latest');

    frameKey = await contractMarket.clcFrameKey(block.timestamp + 270000);
    console.log('\x1b[33m%s\x1b[0m', '   Frame key: ', frameKey);

    // Get the current date and time in UTC
    const now = new Date();

    // Get the timestamp of today at 16:00 GMT (neki je narobe z mojim časom na kompu....)
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0));

    // Convert to seconds
    const timestamp = Math.floor(today.getTime() / 1000);

    // Perform the assertion
    // // expect(frameKey).to.equal(timestamp + 270000);

    //Acqusition price in USDC:
    acqPrice = ethers.utils.parseUnits('15', tokenDecimals);
    //Calculate approval amount
    tax = await contractMarket.clcTax(frameKey, acqPrice);
    //Print tax in blue
    console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(tax, tokenDecimals), ' USDC');

    //Approve USDC to spend
    await token.connect(user).approve(contractMarket.address, tax);
    //Check allowance
    let allowance = await token.allowance(user.address, contractMarket.address);
    console.log('\x1b[33m%s\x1b[0m', '   Allowance: ', ethers.utils.formatUnits(allowance, tokenDecimals), ' USDC');
    expect(allowance).to.equal(tax);
  });
  it('Purchase lot', async function () {
    //get users current USDC balance
    let balanceBefore = await token.balanceOf(user.address);
    // Print starting balance in blue
    console.log('\x1b[36m%s\x1b[0m', '   Starting USDC balance: ', ethers.utils.formatUnits(balanceBefore, tokenDecimals), ' USDC');
    //get current block
    const block = await ethers.provider.getBlock('latest');
    //Purchase lot
    await contractMarket
      .connect(user)
      .tradeLot(frameKey, rateAtStart, acqPrice, { maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas)) });
    //get users new USDC balance
    let balanceAfter = await token.balanceOf(user.address);
    //expect statement to check if balance is same as tax
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   USDC Difference: ',
      ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals),
      ' USDC'
    );

    //calculate lotKey
    let lotKey = await contractMarket.clcLotKey(rateAtStart);

    //Get Lot and check if it exists
    let lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);

    //get lotState
    let lotState = await contractMarket.getStateLot(frameKey, lotKey);

    //get frame
    let frame = await contractMarket.getFrame(frameKey);

    //Get lot states and check if they are correct
    let lotStates = await contractMarket.getLotStates(frameKey, lot.lotKey);

    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPrice);
    expect(lotStates[0].taxCharged).to.equal(balanceBefore.sub(balanceAfter));
    expect(lotStates[0].taxRefunded).to.equal(0);
    expect(lotStates.length).to.equal(1);
  });
  it('5 users buy 5 random lots', async function () {
    //for loop for approval and purchase
    for (let i = 1; i < 5; i++) {
      //Select random account
      let loserUser = accounts[i];

      pairPrice = rateAtStart.add(dPrice.mul(i + 1));
      //Acqusition price in USDC:
      acqPrice = ethers.utils.parseUnits('15', 6);
      //Calculate approval amount
      tax = await contractMarket.clcTax(frameKey, acqPrice);
      //Print tax in blue
      console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(tax, tokenDecimals), ' USDC');
      //get users current USDC balance
      let balanceBefore = await token.balanceOf(loserUser.address);
      //Approve USDC to spend
      await token.connect(loserUser).approve(contractMarket.address, tax);
      //Purchase lot
      await contractMarket.connect(loserUser).tradeLot(frameKey, pairPrice, acqPrice);
      console.log('\x1b[33m%s\x1b[0m', '   Lot purchased by user: ', loserUser.address);
      //get users new USDC balance
      let balanceAfter = await token.balanceOf(loserUser.address);
      //expect statement to check if balance difference is same as tax
      console.log(
        '\x1b[33m%s\x1b[0m',
        '   USDC Difference: ',
        ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals),
        ' USDC'
      );
    }
  });
  it('Skip time to end of frame', async function () {
    const block = await ethers.provider.getBlock('latest');
    console.log('\x1b[33m%s\x1b[0m', '   Block timestamp: ', block.timestamp);
    console.log('\x1b[35m%s\x1b[0m', '   Skip time to end of frame');
    //Skip time to next day of frameKey
    await time.increaseTo(frameKey.add(86400));

    const block2 = await ethers.provider.getBlock('latest');
    console.log('\x1b[33m%s\x1b[0m', '   Current block timestamp: ', block2.timestamp);
    console.log('\x1b[33m%s\x1b[0m', '   Time difference: ', (block2.timestamp - block.timestamp) / 86400, ' days');

    await contractMarket.setFrameRate(frameKey);
  });
  it('Change frame price', async function () {
    //Change frame price with overrideFrameRate(Frame memory frame, uint avgPrice)
    await contractMarket.overrideFrameRate(frameKey, 123456789);
    let frameNew = await contractMarket.getFrame(frameKey);

    expect(frameNew.rate).to.equal(123456789);
  });
  it('It should revert if not owner', async function () {
    //Change frame price with overrideFrameRate(Frame memory frame, uint avgPrice)
    await expect(contractMarket.connect(accounts[1]).overrideFrameRate(frameKey, 123456789)).to.be.revertedWith(
      'Only owner can update frame close price'
    );
  });
});
