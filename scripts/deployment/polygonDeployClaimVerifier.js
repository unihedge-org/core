async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const marketAddress = '0x0107553Ec904dB553E3a779fCD3164EF2F44ed2f';

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log('Account address:', accounts[0].address);

  console.log('Account balance:', ethers.utils.formatUnits(await accounts[0].getBalance(), 18));

  const ClaimeVerifier = await hre.ethers.getContractFactory('ClaimVerifier');
  const claimVerifier = await ClaimeVerifier.deploy(marketAddress, {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
    gasLimit: 5_000_000,
  });
  await claimVerifier.deployed();

  console.log('CLaim verifier deployed to:', claimVerifier.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
