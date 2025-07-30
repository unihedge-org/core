require('@nomiclabs/hardhat-waffle');
// require("@atixlabs/hardhat-time-n-mine");
// require("hardhat-gas-reporter");
//Import dotenv
require('dotenv/config');

const privateKeys = process.env.PRIVATE_KEYS.split(',');

// console.log("Private Key:", process.env.PRIVATE_KEY ? "Loaded" : "Not Found");
// console.log("Alchemy Polygon Key:", process.env.ALCHEMY_POLYGON_API_KEY ? "Loaded" : "Not Found");
// console.log("Quicknode Polygon Key:", process.env.QUICKNODE_POLYGON_API_KEY ? "Loaded" : "Not Found");

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.0',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.20', // Additional compiler versions can be specified here
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_POLYGON_API_KEY}`,
      // url: `https://lingering-winter-spree.matic.quiknode.pro/${process.env.QUICKNODE_POLYGON_API_KEY}/`,
      accounts: privateKeys,
      loggingEnabled: true,
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_SEPOLIA_API_KEY}`,
      accounts: privateKeys,
      loggingEnabled: true,
    },

    hardhat: {
      forking: {
        // url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_POLYGON_API_KEY}`,
        url: `https://lingering-winter-spree.matic.quiknode.pro/${process.env.QUICKNODE_POLYGON_API_KEY}/`,
        // url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_SEPOLIA_API_KEY}`,
        loggingEnabled: true,
        // blockNumber: 56612874
      },
      chains: {
        137: {
          hardforkHistory: {
            london: 23850000,
          },
        },
      },
    },
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://bscscan.com/
    apiKey: `${process.env.ETHERSCAN_API_KEY}`,
  },
  mocha: {
    timeout: 100000000,
  },
};
