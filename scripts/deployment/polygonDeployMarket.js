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
  const dPrice = Number(100);
  const feeProtocol = 3;
  const feeMarket = 1;

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log('Account address:', accounts[0].address);

  console.log('Account balance:', ethers.utils.formatUnits(await accounts[0].getBalance(), 18));

  const Market = await hre.ethers.getContractFactory('Market');
  const market = await Market.deploy(accountingToken, feeProtocol, feeMarket, dPrice, pool, {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
    gasLimit: 5_000_000,
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
