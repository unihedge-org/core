// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const ethers = require("ethers");

const fs = require('fs');

var marketABI = JSON.parse(fs.readFileSync('D:/prog/UniHedge/core/artifacts/contracts/Market.sol/Market.json', 'utf8'));
marketABI = marketABI.abi;
//console.log(marketABI);

var daiABI = JSON.parse(fs.readFileSync('D:/prog/UniHedge/core/artifacts/contracts/Dai.sol/Dai.json', 'utf8'));
daiABI = marketABI.abi;

//var daiABI = JSON.parse(fs.readFileSync('D:/prog/UniHedge/core/dai.json', 'utf8'));


let addressUniswapFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e";
let addressDAIToken = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
let tokenAddress = "0x218ff5C741891eF52D7B3C3a43C59E07d3C79Ddc";

const Rinkeby_PRIVATE_KEY = fs.readFileSync(".secret").toString().trim();

var counter = 1;

async function main(){
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  const NODE_URL = "https://data-seed-prebsc-1-s1.binance.org:8545/";
  const provider = new ethers.providers.JsonRpcProvider(NODE_URL);
// provider is read-only get a signer for on-chain transactions
 // const signer = provider.getSigner();


  var privateKey = Rinkeby_PRIVATE_KEY;
  var wallet = await new ethers.Wallet(privateKey);
 // var provider = await new ethers.providers.InfuraProvider('rinkeby','fa45f0ccc7eb423e983a72671d038716');
  const walletSigner = await wallet.connect(provider);
  console.log(wallet);

  const market = await new ethers.Contract("0x01d60439c6EAe1e9cfDc3df1dCAbf09115c9Fc28", marketABI, walletSigner);

  const dai = await new ethers.Contract("0x6725F303b657a9451d8BA641348b6761A6CC7a17", daiABI, walletSigner);
  //console.log(wallet.address);
  //let b = await dai.connect(walletSigner).balanceOf(wallet.address);
  let b = await provider.getBalance(wallet.address);
  console.log("Balance of DAI is: " + ethers.utils.formatEther(b));

  // let approveTX = await dai.connect(walletSigner).mint();
  // await approveTX.wait();


  // var timestamp = Date.now() / 1000 | 0
  // console.log(timestamp);

  
  // let dPrice = ethers.BigNumber.from('100000000000000000000000000');
  // let pricePair = dPrice.mul(counter);

  // const approveAmnt = await market.connect(walletSigner).clcAmountToApprove(timestamp, pricePair, ethers.utils.parseEther('5'));
  // //await approveAmnt.wait();
  // console.log("Approve amount: " + approveAmnt);

/*   let approveTX = await dai.connect(walletSigner).approve(market.address, approveAmnt);
  await approveTX.wait();

  let approval = await dai.connect(walletSigner).allowance(wallet.address, market.address);
  console.log(approval.toString()); */

  // var timestamp = Date.now() / 1000 | 0
  // console.log(timestamp);

//   const buyTxs = await market.buyLot(timestamp, pricePair, ethers.utils.parseEther('5'),  {
//     gasPrice: 50000000000,
//     gasLimit: 12450000
// });
//   await buyTxs.wait();  

//   var timestamp = new Date().getTime();
//   console.log(timestamp);

//   const frame = await market.clcFrameTimestamp( timestamp  / 1000 | 0);
//   console.log(frame.toString());
//   const lots = await market.getLotsCount(frame);
//   console.log("No of lots in frame: " + lots);

//   let time = new Date(frame*1000);
//   console.log(time);

//   counter++;
//   if (counter >= 7) counter = 1; 
//   console.log("Counter: " + counter);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
