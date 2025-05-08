const initTimestamp = 1645027200;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const accountingToken = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9'; // WETH
  const pool = '0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50'; // USDC/WETH
  const dPrice = Number(10);
  const feeProtocol = 3;
  const feeMarket = 1;

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log('Account address:', accounts[0].address);

  // Get account balance
  const balance = await accounts[0].getBalance();
  console.log('Account balance:', hre.ethers.utils.formatEther(balance), 'ETH');

  const Market = await hre.ethers.getContractFactory('Market');
  const market = await Market.deploy(accountingToken, feeProtocol, feeMarket, dPrice, pool, {
    gasPrice: ethers.utils.parseUnits('10', 'gwei'),
    gasLimit: 5000000,
  });
  await market.deployed();

  console.log('Market deployed to:', market.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
