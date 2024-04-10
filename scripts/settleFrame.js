//npx hardhat --network xxx run ./Scripts/deploy.js   

const hre = require("hardhat");
const {expect, use} = require("chai");
const fs = require('fs');
const daiABI = JSON.parse(fs.readFileSync('dai.json', 'utf8'));
//----------------------------------------------------------------------------------------------
const addressDAIToken = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
const addressMarket = "0x0B0ce68385a39907BcbAb7327EDCA4eFABA092d1";
const addressMarketGetter = "0xA921B22291d8468A71e610f79F42441ce492Df7a";
//----------------------------------------------------------------------------------------------


//----------------------------------------------------------------------
const dPriceDif = -2; //ex. -2 means current rate minus 2*dPrice
     
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

    const dai = await new ethers.Contract(addressDAIToken, daiABI, accounts[0]);

    let balance = await dai.connect(accounts[0]).balanceOf(accounts[0].address);
    console.log("DAI Balance: " + balance.toString());

    const Market = await hre.ethers.getContractFactory("Market");
    const market = Market.attach(addressMarket)

    const MarketGetter = await hre.ethers.getContractFactory("MarketGetter");
    const marketGetter =  MarketGetter.attach(addressMarketGetter)

    //----------------------------------------------------------------------------------------------
    //Calculate timestamp timeStampStart, 10 days from current time
    const timeStampStart = (Date.now() / 1000 | 0) - 864000;
    //calculte frameKey from timestamp
    const frameKeyStart = await market.clcFrameKey(timeStampStart);
    //Calculate timestamp timeStampEnd, 7 days from current time
    const timeStampEnd = (Date.now() / 1000 | 0) + 864000;
    //calculte frameKey from timestamp
    const frameKeyEnd = await market.clcFrameKey(timeStampEnd);

    
    //Get User Lots
    let lots = await marketGetter.getLotsUser(market.address, accounts[0].address, 0, frameKeyStart, frameKeyEnd, 0, 30);
    let lotsUser = lots[0].filter(lot => lot[0].gt(0))
    console.log("User lots: ", lotsUser[0].toString());

    //Settle frame lotsUser[lotsUser.length-1][0]
    let frameKey = lotsUser[lotsUser.length-1][0];

    //Set frame Rate and settle frame
    let transactionSetFrameRate = await market.connect(accounts[0]).setFrameRate(frameKey);
    await transactionSetFrameRate.wait();
    console.log("Frame: ", frameKey.toString(), " frame rate transaction hash: ", transactionSetFrameRate.hash);

    let transaction = await market.connect(accounts[0]).settleFrame(frameKey);
    await transaction.wait();
    console.log("Frame: ", frameKey.toString(), " settlement transaction hash: ", transaction.hash);
  
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
