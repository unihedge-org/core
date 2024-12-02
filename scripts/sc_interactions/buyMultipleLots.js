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
  const account = accounts[2];
  console.log("Main account address:", accounts[0].address);
  console.log("Bot 1 account address:", accounts[1].address);
  console.log("Bot 2 account address:", accounts[0].address);
  console.log("Bot 3 account address:", accounts[0].address);

  //Console.log the network
  console.log("Network:", await ethers.provider.getNetwork());

  const dai = await new ethers.Contract(addressDAIToken, daiABI.abi, account);

  let balance = await dai.connect(account).balanceOf(account.address);
  // Convert to ETH from WEI
  balance = ethers.utils.formatUnits(balance, 18);
  console.log("DAI Balance: " + balance.toString());

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

  let let_set_price = "0.0001";

  // Acc naj gre od 12 do 19 pol, ko tega zrihtaš
  for (let i = 15; i < 19; i++) {
    lot_pair_price = pairPrice.add(dPrice.mul(i));

    //FrameKey 3 days in future
    let days;
    if (i < 8) {
      days = 3 * 86400;
    } else if (i < 15) {
      days = 6 * 86400;
    } else {
      days = 9 * 86400;
    }
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
    console.log("Lot " + (i + 1) + " bought");

    // Sleep for 10 seconds
    await new Promise((r) => setTimeout(r, 10000));
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\x1b[31mError encountered:", error.message, "\x1b[0m");
    process.exit(1);
  });
