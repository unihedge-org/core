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
    user = accounts[1];

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
  it("User can't change tax percentage", async function () {
    await expect(
      contractMarket.connect(user).changeTaxPercentage(ethers.BigNumber.from("30000000000000000"))
    ).to.be.revertedWith("Only owner can change tax percentage");
  });
  it("User can't change protocol fee", async function () {
    await expect(
      contractMarket.connect(user).changeProtocolFee(ethers.BigNumber.from("30000000000000000"))
    ).to.be.revertedWith("Only owner can change protocol fee");
  });
  it("User can't withdraw funds", async function () {
    await expect(
      contractMarket.connect(user).withdrawAccountingToken(ethers.BigNumber.from("30000000000000000"))
    ).to.be.revertedWith("Only owner can withdraw accounting token");
  });
});
