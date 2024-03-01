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

    const dai = await new ethers.Contract("0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", daiABI, accounts[0]);

    let balance = await dai.connect(accounts[0]).balanceOf(accounts[0].address);
    console.log("DAI Balance: " + balance.toString());

    const Market = await hre.ethers.getContractFactory("Market");
    const market = Market.attach("0xd5Ce1687Ec1E864F206F3Aeb11a1746f4F7347ce")

    const MarketGetter = await hre.ethers.getContractFactory("MarketGetter");
    const marketGetter =  MarketGetter.attach("0x93F84209212AFc496458CccA63d15aA63F40b0E6")

    //Buy a lot

    // let pairPrice = dPrice.mul(101);
    // let frameKey = await market.clcFrameTimestamp((Date.now() / 1000 | 0) + 432000); // 5 days
    //Frame key 3 days in future
    let frameKey = await market.clcFrameTimestamp((Date.now() / 1000 | 0) + 259200); // 3 days
    // const lotPrice = ethers.BigNumber.from(await marketGetter.connect(accounts[0]).clcAmountToApprove(market.address, frameKey, pairPrice, ethers.utils.parseEther('0.001')));
    // console.log("Lot price: " + lotPrice);

    // await dai.connect(accounts[0]).approve(market.address, lotPrice);

    // console.log("Dai Approved")


    // //Buy lot and specify gas price
    // let transaction =  await market.connect(accounts[0]).buyLot(frameKey, pairPrice, ethers.utils.parseEther('0.001'), '0x0000000000000000000000000000000000000000', {
    //     gasPrice: 300000000000,
    //     gasLimit: 3100000
    //   });

    //   console.log("Transaction hash: " + transaction.hash);
    //   console.log("Lot bought");

    // console.log("Transaction hash: " + transaction.hash);
    // console.log("Lot bought");

    //Get user lots
    let curentFrame = await market.connect(accounts[0]).clcFrameTimestamp(Date.now() / 1000 | 0);
    
    //Frame 4 days in future
    let frameKey2 = await market.clcFrameTimestamp((Date.now() / 1000 | 0)+432000); //5 days


    let userLots = await marketGetter.connect(accounts[0]).getLotsUser(market.address, accounts[0].address, 0, curentFrame, frameKey2, 0, 2);
    console.log(userLots[0])
    //frameKey is a bigNumber so we need to convert it to string, use ethers.utils.formatEther
    console.log(userLots[0][0]['frameKey'].toString());
    //Num of lots
    console.log("Num of all lots: " + userLots[0].length);

    let userFrames = await marketGetter.connect(accounts[0]).getFramesUser(market.address, accounts[0].address, curentFrame, frameKey2, 0, 2);
    console.log(userFrames[0]);
    //Num of frames
    console.log("Num of frames: " + userFrames[0].length);


    let getNumOfLots = await marketGetter.connect(accounts[0]).getLotsCount(market.address, frameKey);
    console.log("Num of lots in frame " + frameKey +": " + getNumOfLots);

  
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
