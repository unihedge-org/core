//npx hardhat --network xxx run ./Scripts/deploy.js   
import { run, ethers as _ethers } from "hardhat";
import { expect } from "chai";
import { readFileSync } from 'fs';
const daiABI = JSON.parse(readFileSync('dai.json', 'utf8'));
//----------------------------------------------------------------------------------------------
let addressDAIToken = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

//----------------------------------------------------------------------------------------------


//----------------------------------------------------------------------
const startTimestamp = Date.now() / 1000 | 0;

const dPriceDif = 2; //ex. -2 means current rate minus 2*dPrice
     
//----------------------------------------------------------------------


async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    await run('compile');    

    //Print the account address
    const accounts = await _ethers.getSigners();
    console.log("Account address:", accounts[0].address);

    const dai = await new ethers.Contract(addressDAIToken, daiABI, accounts[0]);

    let balance = await dai.connect(accounts[0]).balanceOf(accounts[0].address);
    console.log("DAI Balance: " + balance.toString());

    const Market = await _ethers.getContractFactory("Market");
    const market = Market.attach("0x0B0ce68385a39907BcbAb7327EDCA4eFABA092d1")

    const MarketGetter = await _ethers.getContractFactory("MarketGetter");
    const marketGetter =  MarketGetter.attach("0xA921B22291d8468A71e610f79F42441ce492Df7a")

    //Buy a lot
    let dPrice = await market.dPrice();

    console.log("Current dPrice: " + dPrice.toString());
    expect(dPrice).to.be.gt(0);

    let pairPrice = await market.clcRate();
    expect(pairPrice).to.be.gt(0);
    console.log("Pair price: " + pairPrice);
    //add dPrice to pairPrice

    pairPrice = pairPrice.add(dPrice.mul(dPriceDif));

    console.log("Pair price: " + pairPrice);
    console.log("Difference:" + pairPrice.sub(dPrice));

    // let frameKey = await market.clcFrameTimestamp((Date.now() / 1000 | 0) + 432000); // 5 days
    //Frame key 3 days in future
    let frameKey = await market.clcFrameKey((Date.now() / 1000 | 0)); // 3 days contractMarket.address, frameKey, winningPairPrice, ethers.utils.parseEther('1')
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
  
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
