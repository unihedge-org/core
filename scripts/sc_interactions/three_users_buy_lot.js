// import { readFileSync } from "fs";
const { readFileSync } = require("fs");

//Load ERC20.json from @openzeppelin/contracts build folder
const daiABI = JSON.parse(readFileSync("node_modules/@openzeppelin/contracts/build/contracts/ERC20.json", "utf8"));

let addressDAIToken = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  await run("compile");

  //Print the account address
  console.log("Connecting to network...");
  const accounts = await hre.ethers.getSigners();
  const bot1 = accounts[1];
  const bot2 = accounts[2];
  const bot3 = accounts[3];

  //Console.log the network
  console.log("Network:", await ethers.provider.getNetwork());

  const dai = await new ethers.Contract(addressDAIToken, daiABI.abi, accounts[0]);

  const Market = await ethers.getContractFactory("Market");
  const market = Market.attach("0x722B124B3837e05e5be614f2259554075f1D095E");

  console.log("Market address: ", market.address);

  const MarketGetter = await ethers.getContractFactory("MarketGetter");
  const marketGetter = MarketGetter.attach("0x1c7FdF81E725c4AEae48E3C8a17E6c444f9E3856");

  console.log("MarketGetter address: ", marketGetter.address);

  // Prepare to buy a lot
  let dPrice = await market.dPrice();

  console.log("Current dPrice: " + dPrice.toString());

  let pairPrice = await market.clcRate();
  console.log("Pair price: " + pairPrice);

  let let_set_price = "0.001";

  for (let i = 1; i <= 3; i++) {
    lot_pair_price = pairPrice.add(dPrice.mul(1));

    // Each run is done by different account
    let account = i === 1 ? bot1 : i === 2 ? bot2 : bot3;

    //FrameKey 3 days in future
    let days = 6 * 86400;
    let timestamp = ((Date.now() / 1000) | 0) + days;
    let frameKey = await market.clcFrameKey(timestamp);

    const lot_amount_to_approve = ethers.BigNumber.from(
      await marketGetter
        .connect(account)
        .clcAmountToApprove(market.address, frameKey, lot_pair_price, ethers.utils.parseEther(let_set_price))
    );

    console.log("Amount to approve: " + lot_amount_to_approve);

    //Check approved amount
    let approvedAmount = await dai.connect(account).allowance(account.address, market.address);
    console.log("Approved amount before: " + approvedAmount.toString());

    // Approve DAI to spend
    let TnxApprove = await dai.connect(account).approve(market.address, lot_amount_to_approve);
    console.log("Transaction hash: " + TnxApprove.hash);
    console.log("Dai approved");

    // Buy lot and specify gas price
    let transaction = await market
      .connect(account)
      .tradeLot(frameKey, lot_pair_price, ethers.utils.parseEther(let_set_price), {
        maxFeePerGas: ethers.utils.parseUnits("80", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("25", "gwei"),
        gasLimit: 100000,
      });

    console.log("Transaction hash: " + transaction.hash);
    console.log("\x1b[32mLot: " + lot_pair_price + " bought by: " + account.address + "\x1b[0m");

    // Sleep for 3 seconds
    await new Promise((r) => setTimeout(r, 5000));
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\x1b[31mError encountered:", error.message, "\x1b[0m");
    process.exit(1);
  });
