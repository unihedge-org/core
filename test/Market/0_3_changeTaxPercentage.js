const {
  expect,
  ethers,
  IERC20,
  ISwapRouter,
  daiAddress,
  wMaticAddress,
  uniswapRouterAddress,
} = require("../Helpers/imports");
const { swapTokenForUsers } = require("../Helpers/functions.js");

/*
Random user buys a random lot in the range of 1 to 100 times dPrice
*/
describe("Purchase one random empty lot", function () {
  let accounts, owner, user, daiContract, wMaticContract, contractMarket, swapRouter, frameKey, dPrice, acqPrice, tax;
  let pairPrice = ethers.BigNumber.from("0");

  before(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];

    //Get current block number and print it
    const block = await ethers.provider.getBlock("latest");
    console.log("\x1b[33m%s\x1b[0m", "   Current block: ", block.number);

    //Contracts are loaded from addresses
    daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
    wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);
    swapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
    contractSwapRouter = await ethers.getContractAt(
      ISwapRouter.abi,
      "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      owner
    );

    //Swap tokens for users, get DAI
    await swapTokenForUsers(accounts.slice(0, 5), wMaticContract, daiContract, 10, contractSwapRouter);
    //Check if DAI balance is greater than 0
    let balance = await daiContract.balanceOf(owner.address);
    console.log("\x1b[33m%s\x1b[0m", "   DAI balance: ", ethers.utils.formatUnits(balance, 18), " DAI");
    expect(balance).to.be.gt(0);
  });
  it("Deploy Market contract", async function () {
    const Market = await ethers.getContractFactory("Market");
    contractMarket = await Market.deploy();
    //Expect owner to be first account
    expect(await contractMarket.owner()).to.equal(accounts[0].address);
    //Expect period to be 1 day in seconds
    expect(await contractMarket.period()).to.equal(86400);

    dPrice = await contractMarket.dPrice();
    console.log("\x1b[33m%s\x1b[0m", "   dPrice: ", ethers.utils.formatUnits(dPrice, 18), " DAI");
    //Expect dPrice to be 1e20
    expect(dPrice).to.equal(ethers.utils.parseUnits("1", 20));
  });
  it("Change tax percentage", async function () {
    //Select random account
    user = accounts[Math.floor(Math.random() * 4) + 1];
    //Get current block timestamp
    const block = await ethers.provider.getBlock("latest");

    frameKey = await contractMarket.clcFrameKey(block.timestamp + 259200);
    // Get the current date and time in UTC
    const now = new Date();

    // Get the timestamp of today at 16:00 GMT
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));

    //Select random pair price in range of 1 to 100 times dPrice
    pairPrice = ethers.BigNumber.from(Math.floor(Math.random() * 100) + 1);
    pairPrice = pairPrice.mul(dPrice);

    //Acqusition price in DAI:
    acqPrice = ethers.utils.parseUnits("15", 18);
    //Calculate approval amount
    let taxOld = await contractMarket.clcTax(frameKey, acqPrice);
    //Print tax in blue
    console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(taxOld, 18), " DAI");

    // Mine one block
    await ethers.provider.send("evm_mine", []);

    let taxPercentageOld = await contractMarket.taxMarket();

    console.log("\x1b[36m%s\x1b[0m", "   Tax percentage old: ", taxPercentageOld, " DAI");

    // Change tax percentage, 10000000000000000 is 1% per period [wei] = 0.01
    await contractMarket.changeTaxPercentage(ethers.BigNumber.from("30000000000000000"));

    // Mine one block
    await ethers.provider.send("evm_mine", []);

    //Calculate approval amount
    let taxNew = await contractMarket.clcTax(frameKey, acqPrice);
    //Print tax in blue
    console.log("\x1b[36m%s\x1b[0m", "   Tax: ", ethers.utils.formatUnits(taxNew, 18), " DAI");

    // Check if tax percentage has changed
    let taxPercentageNew = await contractMarket.taxMarket();

    console.log("\x1b[36m%s\x1b[0m", "   Tax percentage new: ", taxPercentageNew, " DAI");

    // Assert that the tax has changed
    expect(taxOld).to.not.equal(taxNew);
    expect(taxPercentageNew).to.equal(ethers.BigNumber.from("30000000000000000"));
  });
});
