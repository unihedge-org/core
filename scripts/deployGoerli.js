// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

//npx hardhat --network xxx run ./Scripts/deploy.js   

const hre = require("hardhat");

//----------------------------------------------------------------------------------------------
let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x5dD9dec52a16d4d1Df10a66ac71d4731c9Dad984"; //WETH/DAI
let addressDAIToken = "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844";
let addressWETHoken = "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6";

//----------------------------------------------------------------------------------------------


//----------------------------------------------------------------------
const startTimestamp = Date.now() / 1000 | 0;
const initTimestamp = startTimestamp - (startTimestamp % 3600);
const period = 3600;
const marketFee = 100; // %/1000
const marketTax = 1000;
const dPrice = ethers.BigNumber.from('10000000000000000000000000000');
const tReporting = 900;
const minTax = 0;
const priceSwitch = false;        
//----------------------------------------------------------------------


async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  await hre.run('compile');

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log("Account address:", accounts[0].address);

  // // We get the contract to deploy
  const MarkerFactory = await hre.ethers.getContractFactory("MarketFactory", );
  // const factory = await MarkerFactory.deploy(addressUniswapFactory,{});
  // await factory.deployed();

  // console.log("Factory deployed to:", factory.address); 

  // console.log("Dai deployed to:", dai.address); 

  const factory = await MarkerFactory.attach('0xdbe926f96e2250d7C4901f118225566Dc654B969');

   const Market = await hre.ethers.getContractFactory("Market");
   const market = await factory.addMarket(addressDAIToken, addressUniswapV2Pair, period, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax, priceSwitch);
   await market.wait();
  //console.log(market);

  //Get markets address
  const marketAddress = await factory.marketsKeys(await factory.getMarketsCount() - 1);
  console.log("Market address:", marketAddress)

  // //Deploy market getter contract
  // const MarketGetter = await hre.ethers.getContractFactory("MarketGetter");
  // const marketGetter = await MarketGetter.deploy();
  // await marketGetter.deployed();
  // //Console log address
  // console.log("MarketGetter deployed to:", marketGetter.address);

  }

  

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
