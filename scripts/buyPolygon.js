//npx hardhat --network xxx run ./Scripts/deploy.js   

const hre = require("hardhat");

const fs = require('fs');
const daiABI = JSON.parse(fs.readFileSync('dai.json', 'utf8'));
//----------------------------------------------------------------------------------------------
let addressDAIToken = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

//----------------------------------------------------------------------------------------------


//----------------------------------------------------------------------
const startTimestamp = Date.now() / 1000 | 0;
const initTimestamp = startTimestamp - (startTimestamp % 3600);
const period = 3600;
const marketFee = 100; // %/1000
const marketTax = 1000;
// const dPrice = ethers.BigNumber.from('10000000000000000000000000000');
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

    const dai = await new ethers.Contract("0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", daiABI, accounts[0]);

    let balance = await dai.connect(accounts[0]).balanceOf(accounts[0].address);
    console.log("DAI Balance: " + balance.toString());

    const Market = await hre.ethers.getContractFactory("Market");
    const market = Market.attach("0x0B0ce68385a39907BcbAb7327EDCA4eFABA092d1")

    const MarketGetter = await hre.ethers.getContractFactory("MarketGetter");
    const marketGetter =  MarketGetter.attach("0xA921B22291d8468A71e610f79F42441ce492Df7a")

    //Buy a lot
    let dPrice = await market.dPrice();

    console.log("Current dPrice: " + dPrice.toString());

    let pairPrice = ethers.BigNumber.from('3369674728396359164646').add(dPrice);
    // let frameKey = await market.clcFrameTimestamp((Date.now() / 1000 | 0) + 432000); // 5 days
    //Frame key 3 days in future
    let frameKey = await market.clcFrameKey((Date.now() / 1000 | 0) + 86400); // 3 days contractMarket.address, frameKey, winningPairPrice, ethers.utils.parseEther('1')
    const lotPrice = ethers.BigNumber.from(await marketGetter.connect(accounts[0]).clcAmountToApprove(market.address, frameKey, pairPrice, ethers.utils.parseEther('0.001')));
    console.log("Amount to approve: " + lotPrice);

    //Get previous approved amount
    let approvedAmount = await dai.connect(accounts[0]).allowance(accounts[0].address, market.address);
    console.log("Approved amount before: " + approvedAmount.toString());

    let TnxApprove = await dai.connect(accounts[0]).approve(market.address, lotPrice);
    console.log("Transaction hash: " + TnxApprove.hash);
    console.log("Dai Approved")


    // Buy lot and specify gas price
    let transaction =  await market.connect(accounts[0]).tradeLot(frameKey, pairPrice, ethers.utils.parseEther('0.001'), {
        gasPrice: 300000000000,
        gasLimit: 3100000
      });

      console.log("Transaction hash: " + transaction.hash);
      console.log("Lot bought");

    // console.log("Transaction hash: " + transaction.hash);
    // console.log("Lot bought");

    //Get user lots
    // let curentFrame = await market.connect(accounts[0]).clcFrameTimestamp(Date.now() / 1000 | 0);
    
    // //Frame 4 days in future
    // let frameKey2 = await market.clcFrameTimestamp((Date.now() / 1000 | 0)+432000); //5 days


    // let userLots = await marketGetter.connect(accounts[0]).getLotsUser(market.address, accounts[0].address, 0, curentFrame, frameKey2, 0, 2);
    // console.log(userLots[0])
    // //frameKey is a bigNumber so we need to convert it to string, use ethers.utils.formatEther
    // console.log(userLots[0][0]['frameKey'].toString());
    // //Num of lots
    // console.log("Num of all lots: " + userLots[0].length);

    // let userFrames = await marketGetter.connect(accounts[0]).getFramesUser(market.address, accounts[0].address, curentFrame, frameKey2, 0, 2);
    // console.log(userFrames[0]);
    // //Num of frames
    // console.log("Num of frames: " + userFrames[0].length);


    // let getNumOfLots = await marketGetter.connect(accounts[0]).getLotsCount(market.address, frameKey);
    // console.log("Num of lots in frame " + frameKey +": " + getNumOfLots);

  
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
