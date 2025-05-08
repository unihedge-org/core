const { ethers } = require('hardhat');

//npx hardhat --network xxx run ./Scripts/deploy.js
function fromQ96(amountQ96, tokenDecimals) {
  const Q96 = ethers.BigNumber.from(2).pow(96);
  const baseUnit = ethers.BigNumber.from(10).pow(tokenDecimals);
  return amountQ96.mul(baseUnit).div(Q96);
}
//----------------------------------------------------------------------
const dPriceDif = -2; //ex. -2 means current rate minus 2*dPrice

//----------------------------------------------------------------------

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  const accountingToken = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC
  const pool = '0x45dDa9cb7c25131DF268515131f647d726f50608'; // USDC/WETH
  const addressMarket = '0x89570449e014aF72e542D8D548E19F9EF73D58c9';
  const addressMarketGetter = '0x8F75a5cE0207a8eE930533F9453e88bA2228f3bD';
  const dPrice = Number(100);
  const feeProtocol = 3;
  const feeMarket = 1;

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log('Account address:', accounts[0].address);

  console.log('Account balance:', ethers.utils.formatUnits(await accounts[0].getBalance(), 18));

  const Market = await hre.ethers.getContractFactory('Market');
  const market = Market.attach(addressMarket);

  const MarketGetter = await hre.ethers.getContractFactory('MarketGetter');
  const marketGetter = MarketGetter.attach(addressMarketGetter);
  // Get accountingToken variable from market contract
  const accountingTokenMarket = await market.accountingToken();
  console.log('Accounting token: ', accountingTokenMarket);
  //----------------------------------------------------------------------------------------------
  //Calculate timestamp yesterday
  const timeStampStart = (Date.now() / 1000) | 0;
  const time_stamp_current = ((Date.now() / 1000) | 0) - 1 * 86400;

  // Get current frameKey
  let rateRaw = await market.connect(accounts[0]).clcRate();
  let rateQ96 = fromQ96(rateRaw, 6);
  // Invert rate by dividing 1 by rate
  let rate = ethers.BigNumber.from(1).mul(ethers.BigNumber.from(10).pow(6)).div(rateQ96);

  console.log('Current rate: ', ethers.utils.formatUnits(rate, 6), ' $');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
