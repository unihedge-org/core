const initTimestamp = 1645027200;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log("Account address:", accounts[0].address);

  //Deploy market getter contract
  const MarketGetter = await hre.ethers.getContractFactory("MarketGetter");
  const marketGetter = await MarketGetter.deploy({
    gasPrice: ethers.utils.parseUnits("30", "gwei"),
    gasLimit: 5000000,
  });
  await marketGetter.deployed();
  // Console log address
  console.log("MarketGetter deployed to:", marketGetter.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
