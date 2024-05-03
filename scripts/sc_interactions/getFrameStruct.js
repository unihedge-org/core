//npx hardhat --network xxx run ./Scripts/deploy.js   
import hre from 'hardhat';
import { promises as fs } from 'fs';
const daiABI = JSON.parse(await fs.readFile('dai.json', 'utf8'));

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
    //Calculate timestamp timeStampEnd, 10 days from current time
    const timeStampEnd = (Date.now() / 1000 | 0) + 864000;
    //calculte frameKey from timestamp
    const frameKeyEnd = await market.clcFrameKey(timeStampEnd);

    
    //Get User Lots
    let lots = await marketGetter.getLotsUser(market.address, accounts[0].address, 0, frameKeyStart, frameKeyEnd, 0, 30);
    let lotsUser = lots[0].filter(lot => lot[0].gt(0))
    console.log("User lots: ", lotsUser.length);

    //Filter out all frameKey lotsUser[i][0]
    let frameKeys = lotsUser.map(lot => lot[0]);
    //Order them by frameKey value
    frameKeys.sort((a, b) => a - b);

    //Settle frame lotsUser[lotsUser.length-1][0]
    let frameKey = frameKeys[frameKeys.length-1];
    console.log("\x1b[33m%s\x1b[0m", "Frame key: ", frameKey.toString());
    //Get frame struct
    let frame = await marketGetter.getFrameStruct(market.address, 1712678400);  
    console.log("Frame struct: ", frame);

        
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
