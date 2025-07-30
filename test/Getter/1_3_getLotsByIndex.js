const { expect, ethers, IERC20, ISwapRouter, time } = require('../Helpers/imports');
const { swapTokenForUsers, convertToTokenUnits } = require('../Helpers/functions.js');

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe("Get lots by index", function () {
  let accounts,
    owner,
    user,
    user2,
    user3,
    token,
    wPOLContract,
    contractMarket,
    contractMarketGetter,
    contractSwapRouter,
    frameKeyStart,
    frameKey,
    dPrice,
    acqPrice,
    acqPrice2,
    tax,
    tokenDecimals,
    mathDecimals,
    rateAtStart;

  let pairPrice = ethers.BigNumber.from("0");

  before(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];

    //Get current block number
    const block = await ethers.provider.getBlock("latest");
    console.log("\x1b[33m%s\x1b[0m", "   Current block: ", block.number);

    //Contracts are loaded from addresses
    token = await ethers.getContractAt('IERC20Metadata', process.env.FUNDING_TOKEN, owner);
    wPOLContract = await ethers.getContractAt(IERC20.abi, process.env.WPOL_POLYGON, owner);
    contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, process.env.UNISWAP_ROUTER, owner);

    // Get token decimals
    tokenDecimals = await token.decimals();
    mathDecimals = 18; //Math decimals are set to 18

    //Swap tokens for users, get USDC
    await swapTokenForUsers(accounts.slice(0, 5), wPOLContract, token, 9000, contractSwapRouter);
    //Check if USDC balance is greater than 0
    let balance = await token.balanceOf(owner.address);
    console.log("\x1b[33m%s\x1b[0m", "   USDC balance: ", ethers.utils.formatUnits(balance, tokenDecimals), " $");
    expect(balance).to.be.gt(0);
  });
  it('Deploy Market and Getter contract', async function () {
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

    const MarketGetter = await ethers.getContractFactory('MarketGetter');
    contractMarketGetter = await MarketGetter.deploy();

    //Confirm that contractMarketGetter is deployed
    expect(contractMarketGetter.address).to.not.equal(ethers.constants.AddressZero);

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

    //Acqusition price in USDC:
    acqPrice = ethers.utils.parseUnits('15', mathDecimals);
    //Calculate approval amount
    tax = await contractMarket.clcTax(frameKey, acqPrice);

    tokenTax = convertToTokenUnits(ethers.utils.formatUnits(tax, mathDecimals), tokenDecimals);

    //Print tax in blue
    console.log('\x1b[36m%s\x1b[0m', '   Tax: ', ethers.utils.formatUnits(tokenTax, tokenDecimals), ' USDC');

    //Approve USDC to spend
    await token.connect(user).approve(contractMarket.address, tokenTax);
    //Check allowance
    let allowance = await token.allowance(user.address, contractMarket.address);
    console.log('\x1b[33m%s\x1b[0m', '   Allowance: ', ethers.utils.formatUnits(allowance, tokenDecimals), ' USDC');
    expect(allowance).to.equal(tokenTax);
  });
  it("Purchase lot", async function () {
    //get users current USDC balance
    let balanceBefore = await token.balanceOf(user.address);
    //get current block
    const block = await ethers.provider.getBlock("latest");
    //Purchase lot
    console.log("\x1b[35m%s\x1b[0m", "   Purchasing lot " + pairPrice.toString());
    await contractMarket.connect(user).tradeLot(frameKey, pairPrice, acqPrice, {
      maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas)),
    });
    //get users new USDC balance
    let balanceAfter = await token.balanceOf(user.address);
    //expect statement to check if balance is same as tax
    console.log(
      "\x1b[33m%s\x1b[0m",
      "   USDC Difference: ",
      ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals),
      " USDC"
    );

    //Get Lot and check if it exists
    let lot = await contractMarket.getLot(frameKey, pairPrice);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(pairPrice);

    //Get lot states and check if they are correct
    let lotStates = await contractMarket.getLotStates(frameKey, pairPrice);

    expect(lotStates[0].owner).to.equal(user.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPrice);
    expect(lotStates[0].taxCharged).to.equal(balanceBefore.sub(balanceAfter));
    expect(lotStates[0].taxRefunded).to.equal(0);
    expect(lotStates.length).to.equal(1);
  });
  it("second user approves USDC for purchase", async function () {
    //Select random account that is not user
    user2 = accounts[Math.floor(Math.random() * 4) + 1];

    while (user2.address == user.address) {
      user2 = accounts[Math.floor(Math.random() * 4) + 1];
    }

    tax = await contractMarket.clcTax(frameKey, acqPrice);

    let lotStates = await contractMarket.getLotStates(frameKey, pairPrice);
    let acquisitionPrice = lotStates[0].acquisitionPrice;

    //Approve USDC to spend
    await token.connect(user2).approve(contractMarket.address, tax.add(acquisitionPrice));
    //Check allowance
    let allowance = await token.allowance(user2.address, contractMarket.address);
    console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, tokenDecimals), " USDC");
    expect(allowance).to.equal(tax.add(acquisitionPrice));
  });
  it("second user buys lot", async function () {
    //get users current USDC balance
    let balanceBefore = await token.balanceOf(user2.address);
    //get current block
    const block = await ethers.provider.getBlock("latest");

    //Purchase lot
    await contractMarket.connect(user2).tradeLot(frameKey, pairPrice, acqPrice, {
      maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas)),
    });

    //get users new USDC balance
    let balanceAfter = await token.balanceOf(user2.address);
    //expect statement to check if balance is same as tax
    console.log(
      "\x1b[33m%s\x1b[0m",
      "   USDC Difference: ",
      ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals),
      " USDC"
    );

    //Get Lot and check if it exists
    let lot = await contractMarket.getLot(frameKey, pairPrice);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(pairPrice);

    //Get lot states and check if they are correct
    let lotStates = await contractMarket.getLotStates(frameKey, pairPrice);

    expect(lotStates[1].owner).to.equal(user.address);
    expect(lotStates[2].owner).to.equal(user2.address);
    expect(lotStates[2].acquisitionPrice).to.equal(acqPrice);
    expect(lotStates[2].taxCharged).to.equal(balanceBefore.sub(balanceAfter).sub(lotStates[1].acquisitionPrice));
    //TODO: Check if tax refunded is correct in lotStates[1] and lotStates[2]
    expect(lotStates.length).to.equal(3);
  });
  it("Third user approves USDC for purchase", async function () {
    //Select random account that is not user
    user3 = accounts[Math.floor(Math.random() * 4) + 1];
    while (user3.address == user.address || user3.address == user2.address) {
      user3 = accounts[Math.floor(Math.random() * 4) + 1];
    }

    acqPrice2 = ethers.utils.parseUnits("35", tokenDecimals);
    tax = await contractMarket.clcTax(frameKey, acqPrice2);

    //Approve USDC to spend
    await token.connect(user3).approve(contractMarket.address, tax);
    //Check allowance
    let allowance = await token.allowance(user3.address, contractMarket.address);
    console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, tokenDecimals), " USDC");
    expect(allowance).to.equal(tax);
  });
  it("Third user buys lot", async function () {
    //get users current USDC balance
    let balanceBefore = await token.balanceOf(user3.address);
    //get current block
    const block = await ethers.provider.getBlock("latest");

    //Calculate new pair price, that is not equal to previous pair price
    let pairPrice2 = pairPrice;
    while (pairPrice2 == pairPrice) {
      pairPrice2 = ethers.BigNumber.from(Math.floor(Math.random() * 100) + 1);
      pairPrice2 = pairPrice2.mul(dPrice);
    }

    //Purchase lot
    await contractMarket.connect(user3).tradeLot(frameKey, pairPrice2, acqPrice2, {
      maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block.baseFeePerGas)),
    });

    //get users new USDC balance
    let balanceAfter = await token.balanceOf(user3.address);
    //expect statement to check if balance is same as tax
    console.log(
      "\x1b[33m%s\x1b[0m",
      "   USDC Difference: ",
      ethers.utils.formatUnits(balanceBefore.sub(balanceAfter), tokenDecimals),
      " USDC"
    );

    //Get Lot and check if it exists
    let lot = await contractMarket.getLot(frameKey, pairPrice2);
    expect(lot.frameKey).to.equal(frameKey);
    expect(lot.lotKey).to.equal(pairPrice2);

    //Get lot states and check if they are correct
    let lotStates = await contractMarket.getLotStates(frameKey, pairPrice2);

    expect(lotStates[0].owner).to.equal(user3.address);
    expect(lotStates[0].acquisitionPrice).to.equal(acqPrice2);
  });
  it("Skip time to end of frame", async function () {
    const block = await ethers.provider.getBlock("latest");
    console.log("\x1b[33m%s\x1b[0m", "   Block timestamp: ", block.timestamp);
    console.log("\x1b[35m%s\x1b[0m", "   Skip time to end of frame");
    //Skip time to next day of frameKey
    await time.increaseTo(frameKey.add(86400));

    const block2 = await ethers.provider.getBlock("latest");
    console.log("\x1b[33m%s\x1b[0m", "   Current block timestamp: ", block2.timestamp);
    console.log("\x1b[33m%s\x1b[0m", "   Time difference: ", (block2.timestamp - block.timestamp) / 86400, " days");

    await contractMarket.setFrameRate(frameKey);
  });
  it("Settle frame winner", async function () {
    await contractMarket.settleFrame(frameKey);
  });
  it("Get lots array", async function () {
    let userLots = await contractMarket.getLotsArray();
    console.log("\x1b[33m%s\x1b[0m", "   User lots array: ", userLots);
  });
  it("get lots with an index bigger than length", async function () {
    //Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage
    let lots = await contractMarketGetter.getLotsByIndex(contractMarket.address, 0, 100000);

    console.log(lots);
  });
  it("Users buys 50 different lots", async function () {
    for (i = 0; i < 50; i++) {
      //Select random account
      user = accounts[3];
      // console.log("Round ", i);
      const block = await ethers.provider.getBlock("latest");
      frameKeyStart = await contractMarket.clcFrameKey(block.timestamp);
      frameKey = await contractMarket.clcFrameKey(block.timestamp + 270000);

      //Calculate new random pair price
      pairPrice = ethers.BigNumber.from(Math.floor(Math.random() * 100) + 1);
      pairPrice = pairPrice.mul(dPrice);

      acqPrice = ethers.utils.parseUnits("1", tokenDecimals);
      //Calculate approval amount
      tax = await contractMarket.clcTax(frameKey, acqPrice);
      //Print tax in blue
      // console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(tax, tokenDecimals), " USDC");

      //Approve USDC to spend
      await token.connect(user).approve(contractMarket.address, tax.mul(2));
      //Check allowance
      let allowance = await token.allowance(user.address, contractMarket.address);
      // console.log("\x1b[33m%s\x1b[0m", "   Allowance: ", ethers.utils.formatUnits(allowance, tokenDecimals), " USDC");

      //get current block
      const block2 = await ethers.provider.getBlock("latest");
      //Purchase lot
      // console.log("\x1b[35m%s\x1b[0m", '   Purchasing lot ' + pairPrice.toString());
      await contractMarket.connect(user).tradeLot(frameKey, pairPrice, acqPrice, {
        maxFeePerGas: ethers.BigNumber.from(Math.floor(1.25 * block2.baseFeePerGas)),
      });

      process.stdout.write(`User: ${i}  bought a lot \r`);
    }
    console.log("\n");
  });
  it("Get lots array length", async function () {
    let userLotsLength = await contractMarket.getLotsArrayLength();
    console.log("\x1b[33m%s\x1b[0m", "   User lots array length: ", userLotsLength);
  });
  it("get lots by index", async function () {
    //Get userLots length
    let userLotsLength = await contractMarket.getLotsArrayLength();
    //Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage
    let lots = await contractMarketGetter.getLotsByIndex(contractMarket.address, 0, userLotsLength - 1);

    console.log(lots);
  });
});
