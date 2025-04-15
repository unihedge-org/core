const initTimestamp = 1645027200;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const accountingToken = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC
  const pool = '0x45dDa9cb7c25131DF268515131f647d726f50608'; // USDC/WETH
  let dPrice = ethers.utils.parseUnits('100', 18);
  let feeProtocol = ethers.utils.parseUnits('0.03', 18);
  let feeMarket = ethers.utils.parseUnits('0.01', 18);

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log('Account address:', accounts[0].address);

  const Market = await hre.ethers.getContractFactory('Market');
  const market = await Market.deploy(accountingToken, feeProtocol, feeMarket, dPrice, pool, {
    gasPrice: 300000000000,
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
