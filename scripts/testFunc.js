// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
require("@nomiclabs/hardhat-ethers");

const fs = require('fs');
const { ethers } = require("hardhat");

const daiABI = JSON.parse(fs.readFileSync('dai.json', 'utf8'));

let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e";
let addressDAIToken = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
let tokenAddress = "0x218ff5C741891eF52D7B3C3a43C59E07d3C79Ddc";

const Rinkeby_PRIVATE_KEY = fs.readFileSync(".secret").toString().trim();



async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const MarkerFactory = await hre.ethers.getContractFactory("MarketFactory");

  const Market = await hre.ethers.getContractFactory("Market");
  const market = await Market.attach('0x01d60439c6EAe1e9cfDc3df1dCAbf09115c9Fc28');

  var privateKey = Rinkeby_PRIVATE_KEY;
  var wallet = await new ethers.Wallet(privateKey);
  var provider = new ethers.providers.InfuraProvider('rinkeby','fa45f0ccc7eb423e983a72671d038716');
  const walletSigner = wallet.connect(provider);
  console.log(walletSigner);

  const dai = await new ethers.Contract("0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa", daiABI, walletSigner);
  //console.log(wallet.address);
  let b = await dai.connect(walletSigner).balanceOf(wallet.address);
  console.log(b.toString());


  var timestamp = Date.now() / 1000 | 0
  console.log(timestamp);

  const approveAmnt = await market.connect(walletSigner).clcAmountToApprove(timestamp, ethers.BigNumber.from('6600000101302161004392578051'), ethers.utils.parseEther('5'));
  //await approveAmnt.wait();
  console.log("Approve amount: " + approveAmnt);

  let approveTX = await dai.connect(walletSigner).approve(market.address, approveAmnt);
  await approveTX.wait();

  let approval = await dai.connect(walletSigner).allowance(wallet.address, market.address);
  console.log(approval.toString());

  var timestamp = Date.now() / 1000 | 0
  console.log(timestamp);

  const buyTxs = await market.buyLot(timestamp, ethers.BigNumber.from('600000101302161004392578051'), ethers.utils.parseEther('5'));
  await buyTxs.wait();  

  var timestamp = new Date().getTime();
  console.log(timestamp);

  const frame = await market.clcFrameTimestamp( timestamp  / 1000 | 0);
  console.log(frame.toString());
  const lots = await market.getLotsCount(frame);
  console.log("No of lots in frame: " + lots);

  let time = new Date(frame*1000);
  console.log(time);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
