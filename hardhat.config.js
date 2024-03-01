require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require("@atixlabs/hardhat-time-n-mine");
//require("hardhat-gas-reporter");

const fs = require('fs');
const PRIVATE_KEY = fs.readFileSync(".secret").toString().trim();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = { 
  solidity: "0.7.0",
  networks: {
    goerli: {
      url: 'https://goerli.infura.io/v3/fa45f0ccc7eb423e983a72671d038716',
      accounts: [`0x${PRIVATE_KEY}`],
      gas: 12450000,
      gasPrice: 50000000000
    },
    polygon: {
      // url: 'https://polygon-mainnet.chainnodes.org/da196e8f-51e4-40a3-a02a-1f359fa615a7',
      url: 'https://polygon-mainnet.g.alchemy.com/v2/VkzZji9lTLBz-uNYD--fPwOf40VPo27s',
      // url: 'https://polygon.llamarpc.com',
      // url: 'https://rpc-mainnet.maticvigil.com',
      // url: 'https://polygon-rpc.com/',
      accounts: [`0x${PRIVATE_KEY}`],
    },
    BSCTestnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      accounts: [`0x${PRIVATE_KEY}`],
      gas: 12450000,
      gasPrice: 50000000000
    },
    forking: {
      // Using Alchemy
      url: `https://polygon-mainnet.infura.io/v3/fa45f0ccc7eb423e983a72671d038716`, // url to RPC node, ${ALCHEMY_KEY} - must be your API key
      // Using Infura
      // url: `https://mainnet.infura.io/v3/${INFURA_KEY}`, // ${INFURA_KEY} - must be your API key
      blockNumber: 25867882, // a specific block number with which you want to work
    },
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://bscscan.com/
    apiKey: 'GPH97NNZCW56HC34VARTFC94ZZZHWSUC4U'
  },
  mocha: {
    timeout: 100000000
  },
  // gasReporter: {
  //   currency: 'EUR',
  //   gasPrice: 21
  // },
};
