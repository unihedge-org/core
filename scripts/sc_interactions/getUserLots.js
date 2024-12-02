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

  let timestamp = (Date.now() / 1000) | 0;
  let frameKeyStart = await market.clcFrameKey(timestamp);
  let frameKeyEnd = await market.clcFrameKey(timestamp + 864000);

  let userLots = await marketGetter.getLotsUser(market.address, account.address, 0, frameKeyStart, frameKeyEnd, 0, 30);

  // filter non-zero lots, userLots[0][index].lotKey must be greater than 0
  userLots = userLots[0].filter((lot) => lot[0].gt(0));
  console.log("User lots: ", userLots.length);
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\x1b[31mError encountered:", error.message, "\x1b[0m");
    process.exit(1);
  });
