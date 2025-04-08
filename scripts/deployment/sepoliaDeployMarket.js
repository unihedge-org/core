const initTimestamp = 1645027200;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const usdcAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log('Account address:', accounts[0].address);

  // Get account balance
  const balance = await accounts[0].getBalance();
  console.log('Account balance:', hre.ethers.utils.formatEther(balance), 'ETH');

  const Market = await hre.ethers.getContractFactory('Market');
  const market = await Market.deploy(usdcAddress, {
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
