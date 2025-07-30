// test-connection.js
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);
  console.log('Account balance:', (await deployer.getBalance()).toString());

  // Check current block
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log('Current block:', blockNumber);

  // Try to get block details
  const block = await ethers.provider.getBlock(blockNumber);
  console.log('Block hash:', block.hash);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
