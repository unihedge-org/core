require("@nomiclabs/hardhat-waffle");
// require("@atixlabs/hardhat-time-n-mine");
require("hardhat-gas-reporter");
//Import dotenv
require("dotenv/config");

console.log("Private Key:", process.env.PRIVATE_KEY ? "Loaded" : "Not Found");
console.log("Alchemy Polygon Key:", process.env.ALCHEMY_POLYGON_API_KEY ? "Loaded" : "Not Found");

//Load the private key from .secret
const fs = require('fs');
const privateKey = fs.readFileSync(".secret").toString().trim();


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.20", // Additional compiler versions can be specified here
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
    url: `https://polygon-mainnet.g.alchemy.com/v2/B5BcNEAt4dYLjJBtEKZj6iC6x1apTiZI`,
    accounts: [`0x${process.env.PRIVATE_KEY}`],
    loggingEnabled: true,
  },
  hardhat: {
    forking: {
      url: "https://polygon-mainnet.g.alchemy.com/v2/B5BcNEAt4dYLjJBtEKZj6iC6x1apTiZI",
      loggingEnabled: true
    },
    chains: {
      137: {
        hardforkHistory: {
          london: 23850000
        }
      }
    }
  }
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
}
};