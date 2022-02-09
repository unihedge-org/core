const hre = require("hardhat");

//----------------------------------------------------------------------------------------------
let addressSushiswapFactory = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";
let addressSushiswapV2Pair = "0x03E6c12eF405AC3F642B9184eDed8E1322de1a9e";
let addressDAIToken = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
let tokenAddress = "0x218ff5C741891eF52D7B3C3a43C59E07d3C79Ddc";
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


}

  

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
