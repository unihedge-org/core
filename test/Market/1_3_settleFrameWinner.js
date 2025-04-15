const { expect, ethers, IERC20, ISwapRouter, fs, time } = require('../Helpers/imports');
const { swapTokenForUsers, convertToTokenUnits } = require('../Helpers/functions.js');

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe('Resale lot', function () {
  let accounts,
    owner,
    user,
    token,
    wPOLContract,
    contractMarket,
    user2,
    frameKey,
    dPrice,
    acqPrice,
    tax,
    tokenDecimals,
    mathDecimals,
    rateAtStart;
  rateAtStart = ethers.BigNumber.from('0');

  before(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];

    //Get current block number and print it
    const block = await ethers.provider.getBlock('latest');
    console.log('\x1b[33m%s\x1b[0m', '   Current block: ', block.number);

    //Contracts are loaded from addresses
    token = await ethers.getContractAt('IERC20Metadata', process.env.FUNDING_TOKEN, owner);
    wPOLContract = await ethers.getContractAt(IERC20.abi, process.env.WPOL_POLYGON, owner);
    contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, process.env.UNISWAP_ROUTER, owner);

    // Get token decimals
    tokenDecimals = await token.decimals();

    //Swap tokens for users, get DAI
    await swapTokenForUsers(accounts.slice(0, 5), wPOLContract, token, 9000, contractSwapRouter);
    //Check if DAI balance is greater than 0
    let balance = await token.balanceOf(owner.address);
    console.log('\x1b[33m%s\x1b[0m', ' USDC balance: ', ethers.utils.formatUnits(balance, tokenDecimals), ' $');
    expect(balance).to.be.gt(0);
  });
  it('Deploy Market contract', async function () {
    const Market = await ethers.getContractFactory('Market');
    dPrice = ethers.utils.parseUnits('100', mathDecimals);
    let feeProtocol = ethers.utils.parseUnits('0.03', mathDecimals);
    let feeMarket = ethers.utils.parseUnits('0.01', mathDecimals);
    contractMarket = await Market.deploy(process.env.FUNDING_TOKEN, feeProtocol, feeMarket, dPrice, process.env.POOL);
    //Expect owner to be first account
    expect(await contractMarket.owner()).to.equal(accounts[0].address);
    //Expect period to be 1 day in seconds
    expect(await contractMarket.period()).to.equal(86400);

    //get dPrice
    dPrice = await contractMarket.dPrice();

    dPrice_in_token_units = convertToTokenUnits(ethers.utils.formatUnits(dPrice, mathDecimals), tokenDecimals);

    console.log('\x1b[33m%s\x1b[0m', '   dPrice: ', ethers.utils.formatUnits(dPrice_in_token_units, tokenDecimals), ' USDC');
    expect(dPrice).to.be.gt(0);

    // Get current rate
    rateAtStart = await contractMarket.clcRate();
  });
  it('Approve USDC to spend', async function () {
    //Select random account
    user = accounts[Math.floor(Math.random() * 4) + 1];
    //Get current block timestamp
    const block = await ethers.provider.getBlock('latest');

    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);

    // Get the current date and time in UTC
    const now = new Date();

    // Get the timestamp of today at 16:00 GMT
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));
    // Convert to seconds
    const timestamp = Math.floor(today.getTime() / 1000);

    //Acqusition price in DAI:
    acqPrice = ethers.utils.parseUnits('15', mathDecimals);
    //Calculate approval amount
    tax = await contractMarket.clcTax(frameKey, acqPrice);

    tokenTax = convertToTokenUnits(ethers.utils.formatUnits(tax, mathDecimals), tokenDecimals);

    //Print tax in blue
    console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(tokenTax, tokenDecimals), ' USDC');

    //Approve DAI to spend
    await token.connect(user).approve(contractMarket.address, tokenTax);
    //Check allowance
    let allowance = await token.allowance(user.address, contractMarket.address);
    console.log('\x1b[33m%s\x1b[0m', '   Allowance: ', ethers.utils.formatUnits(allowance, tokenDecimals), ' USDC');
    expect(allowance).to.equal(tokenTax);
  });
  it('Purchase lot', async function () {
    //get users current DAI balance
    let balanceBefore = await token.balanceOf(user.address);
    //get current block
    const block = await ethers.provider.getBlock('latest');
    //Purchase lot
    await contractMarket
      .connect(user)
      .tradeLot(frameKey, rateAtStart, acqPrice, { maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas)) });
    //get users new DAI balance
    let balanceAfter = await token.balanceOf(user.address);
    //expect statement to check if balance is same as tax
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   USDC Difference: ',
      ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals),
      '  USDC'
    );

    //Get Lot and check if it exists
    let lotKey = await contractMarket.clcLotKey(rateAtStart);
    let lot = await contractMarket.getLot(frameKey, lotKey);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(lotKey);

    //Get lot states and check if they are correct
    let lotStates = await contractMarket.getLotStates(frameKey, lotKey);

    // Convert tax charged to token units
    let taxChargedTokenUnits = convertToTokenUnits(ethers.utils.formatUnits(lotStates[0].taxCharged, mathDecimals), tokenDecimals);

    //Check if lot states are correct
    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPrice);
    expect(taxChargedTokenUnits).to.equal(balanceBefore.sub(balanceAfter));
    expect(lotStates[0].taxRefunded).to.equal(0);
    expect(lotStates.length).to.equal(1);
  });
  it('5 users buy 5 random lots', async function () {
    //for loop for approval and purchase
    for (let i = 1; i < 5; i++) {
      //Select random account
      let loserUser = accounts[i];

      let pairPrice = rateAtStart.add(dPrice.mul(i + 1));
      //Acqusition price in DAI:
      acqPrice = ethers.utils.parseUnits('15', mathDecimals);
      //Calculate approval amount
      tax = await contractMarket.clcTax(frameKey, acqPrice);

      //Convert tax to token units
      let token_tax = convertToTokenUnits(ethers.utils.formatUnits(tax, mathDecimals), tokenDecimals);
      //Print tax in blue
      console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(token_tax, tokenDecimals), ' USDC');
      //get users current DAI balance
      let balanceBefore = await token.balanceOf(loserUser.address);
      //Approve DAI to spend
      await token.connect(loserUser).approve(contractMarket.address, token_tax);
      //Purchase lot
      await contractMarket.connect(loserUser).tradeLot(frameKey, pairPrice, acqPrice);
      console.log('\x1b[33m%s\x1b[0m', '   Lot purchased by user: ', loserUser.address);
      //get users new DAI balance
      let balanceAfter = await token.balanceOf(loserUser.address);
      //expect statement to check if balance difference is same as tax
      console.log(
        '\x1b[33m%s\x1b[0m',
        '   DAI Difference: ',
        ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals),
        ' DAI'
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

    let frameState = await contractMarket.getStateFrame(frameKey);
    let frame = await contractMarket.getFrame(frameKey);
    let lotKey = await contractMarket.clcLotKey(rateAtStart);
    let frameLotKey = await contractMarket.clcLotKey(frame[1]);

    expect(frameState).to.equal(3);

    expect(frame[0]).to.equal(frameKey);
    expect(frameLotKey).to.equal(lotKey);
  });
  it('Settle frame winner', async function () {
    //Calculate lotKey from winningrateAtStart
    let lotKey = await contractMarket.clcLotKey(rateAtStart);
    //Get lotState
    let lotState = await contractMarket.getStateLot(frameKey, lotKey);
    expect(lotState).to.equal(2);

    //Get state frame
    let frameState = await contractMarket.getStateFrame(frameKey);
    expect(frameState).to.equal(3);

    //get users balance before settlement
    let balanceBefore = await token.balanceOf(user.address);
    let balanceBeforeOwner = await token.balanceOf(owner.address);

    // Get contract balance before settlement
    let contractBalanceBefore = await token.balanceOf(contractMarket.address);
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Contract balance before settlement: ',
      ethers.utils.formatUnits(contractBalanceBefore, tokenDecimals),
      ' USDC'
    );

    await contractMarket.settleFrame(frameKey);
    //get users balance after settlement
    let balanceAfter = await token.balanceOf(user.address);
    let balanceAfterOwner = await token.balanceOf(owner.address);

    // Get contract balance after settlement
    let contractBalanceAfter = await token.balanceOf(contractMarket.address);
    console.log(
      '\x1b[33m%s\x1b[0m',
      '   Contract balance after settlement: ',
      ethers.utils.formatUnits(contractBalanceAfter, tokenDecimals),
      ' USDC'
    );

    let frame = await contractMarket.getFrame(frameKey);

    let lotKeyWon = await contractMarket.clcLotKey(frame[4]);

    // Connvert reward fund to token units
    let rewardFund = convertToTokenUnits(ethers.utils.formatUnits(frame[6], mathDecimals), tokenDecimals);

    expect(frame[3]).to.equal(user.address);
    //user balance should be greater than before
    expect(balanceAfter).to.be.gt(balanceBefore);
    //and it should equal reward amount - fee (no referral here)
    expect(balanceAfter).to.equal(balanceBefore.add(rewardFund));
    //Expect owner balance to be greater than before
    expect(balanceAfterOwner).to.be.gt(balanceBeforeOwner);
  });
});
