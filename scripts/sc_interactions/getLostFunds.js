// import { readFileSync } from "fs";
const { readFileSync } = require('fs');

//Load ERC20.json from @openzeppelin/contracts build folder
const daiABI = JSON.parse(readFileSync('node_modules/@openzeppelin/contracts/build/contracts/ERC20.json', 'utf8'));

let addressDAIToken = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  await run('compile');

  //Print the account address
  console.log('Connecting to network...');
  const accounts = await hre.ethers.getSigners();

  //Console.log the network
  console.log('Network:', await ethers.provider.getNetwork());

  const dai = await new ethers.Contract(addressDAIToken, daiABI.abi, accounts[0]);

  const Market = await ethers.getContractFactory('Market');
  const market = Market.attach('0x28824b535d1F4edaf89a36B558811CB1c0b9Aa47');

  console.log('Market address: ', market.address);

  // Get DAI balance of the contract
  let balance1 = await dai.connect(accounts[0]).balanceOf(market.address);
  // Convert to ETH from WEI
  balance1 = ethers.utils.formatUnits(balance1, 18);
  console.log('DAI Balance: ' + balance1.toString());

  const balanceInWei = ethers.utils.parseUnits(balance1, 18);

  // Run withdrawAccountingToken from the Market contract
  await market.connect(accounts[0]).withdrawAccountingToken(balanceInWei);

  // Get DAI balance of the contract
  let balance2 = await dai.connect(accounts[0]).balanceOf(market.address);
  // Convert to ETH from WEI
  balance2 = ethers.utils.formatUnits(balance2, 18);
  console.log('DAI Balance: ' + balance2.toString());
}
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\x1b[31mError encountered:', error.message, '\x1b[0m');
    process.exit(1);
  });

// Balance1: 0.03236344606460768
// Balance2: 0.012462199073994316
// Balance3: 0.035780289062271004
// Balance4: 0.024873215104007479
// Balance5: 0.095225264756334996

// Skupaj: 0.20070441406121547
