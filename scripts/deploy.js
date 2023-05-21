// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

//npx hardhat --network xxx run ./Scripts/deploy.js   

const hre = require("hardhat");

//----------------------------------------------------------------------------------------------
let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e";
let addressDAIToken = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
let tokenAddress = "0x218ff5C741891eF52D7B3C3a43C59E07d3C79Ddc";

let uniswapFactoryBSCT = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
let daiBSCT = "0x8a9424745056Eb399FD19a0EC26A14316684e274";
let uniswapV2PairBSCT = "0xf7609B69377dF3D91f77126A429f4DE523466240"; //DAI/ETH
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
  // await hre.run('compile');

  // We get the contract to deploy
  const MarkerFactory = await hre.ethers.getContractFactory("MarketFactory", );
  const factory = await MarkerFactory.deploy(addressUniswapFactory,{
    gasPrice: 500000000000,
    gasLimit: 12450000
});
  await factory.deployed();

  console.log("Factory deployed to:", factory.address); 

  // const DaiFactory = await hre.ethers.getContractFactory("Dai");
  // const dai = await DaiFactory.deploy(97);
  // await dai.deployed();

  // console.log("Dai deployed to:", dai.address); 

  //const factory = await MarkerFactory.attach('0xb9a0CE2186BE67a99C5337Cc96CfC0510978CBfe');

   const Market = await hre.ethers.getContractFactory("Market");
   const market = await factory.addMarket(addressDAIToken, addressUniswapV2Pair, period, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax, priceSwitch);
   await market.wait();
  //console.log(market);

  const marketAddress = await factory.marketsKeys(await factory.getMarketsCount() - 1);
  console.log("Market address:", marketAddress)

  }

  

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
