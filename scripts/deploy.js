// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e";
let addressDAIToken = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
let tokenAddress = "0x218ff5C741891eF52D7B3C3a43C59E07d3C79Ddc";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const MarkerFactory = await hre.ethers.getContractFactory("MarketFactory");
  /* const factory = await MarkerFactory.deploy("0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");

  await factory.deployed();

  console.log("Factory deployed to:", factory.address); */

  const factory = await MarkerFactory.attach('0xF3D4d868d4648b5B87AE68142ddC8e2B7482D031');

  const Market = await hre.ethers.getContractFactory("Market");
  const market = await factory.addMarket(addressDAIToken, addressUniswapV2Pair, 3600, 1630911654, 100, 100,  ethers.BigNumber.from('100000000000000000000000000'), 1800, 1000);;
  console.log( market);

  let marketAddress = await factory.marketsKeys(0);
  console.log("Market deployed to:", marketAddress)
 }

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
