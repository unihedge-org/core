const hre = require("hardhat");

let addressUniswapV2Factory = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"; 
let addressUniswapV2Pair = "0x6FF62bfb8c12109E8000935A6De54daD83a4f39f";
let addressTokenDAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
let addressTokenWETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";

const initTimestamp = 1645027200;
const period = 86400; //in hours
const marketFee = 1000; // %/1000
const marketTax = 1000;
const dPrice = ethers.BigNumber.from('100000000000000000000000000');
const tReporting = 900;
const minTax = 1000;    
let avgPriceSwitch = true;


async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log("Account address:", accounts[0].address);

  // We get the contract to deploy
  const MarkerFactory = await hre.ethers.getContractFactory("MarketFactory", );
  // Deploy factory, specify gas:
  // const factory = await MarkerFactory.deploy(addressUniswapV2Factory, {
  //   gasPrice: 300000000000
  // });
  // await factory.deployed();


  // console.log("Factory deployed to:", factory.address); 

  const factory = await MarkerFactory.attach('0x99E1d83617442A4C601Ae7771B5eC02D68a98AfE');

  //  const Market = await hre.ethers.getContractFactory("Market");
  //  const market = await factory.addMarket(addressTokenDAI, addressUniswapV2Pair, period, initTimestamp, marketTax, marketFee, dPrice, tReporting, minTax, avgPriceSwitch, {
  //   gasPrice: 300000000000
  //  });
  //  await market.wait();

  // //Get markets address
  // const marketAddress = await factory.marketsKeys(await factory.getMarketsCount() - 1);
  // console.log("Market address:", marketAddress)

  //Deploy market getter contract
  const MarketGetter = await hre.ethers.getContractFactory("MarketGetter");
  const marketGetter = await MarketGetter.deploy({
    gasPrice: 300000000000
  });
  await marketGetter.deployed();
  // Console log address
  console.log("MarketGetter deployed to:", marketGetter.address);

  // Send 0 MATIC (ETH) to address 0x7d8fc3ccf41B0A9071994a8590e17009fe7BCe63
  // console.log("Sending 0 MATIC to address 0x7d8fc3ccf41B0A9071994a8590e17009fe7BCe63")
  // const providerAccount = accounts[0];
  // const recipientAddress = "0x7d8fc3ccf41B0A9071994a8590e17009fe7BCe63";
  // const zeroMATIC = ethers.utils.parseEther("0");
  // const nonce = await providerAccount.getTransactionCount();
  // const tx = await providerAccount.sendTransaction({
  //   to: recipientAddress,
  //   value: zeroMATIC,
  //   gasPrice: 300000000000,
  //   nonce: nonce,
  // });
  // await tx.wait();


  }

  

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
