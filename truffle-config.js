const HDWalletProvider = require('@truffle/hdwallet-provider');

const fs = require('fs');
const mnemonic = fs.readFileSync(".secret").toString().trim();


module.exports = {
  networks: {
    development: {
     host: "127.0.0.1",     // Localhost (default: none)
     port: 8545,            // Standard Ethereum port (default: none)
     network_id: "*",       // Any network (default: none)
     gas: 4612388
    }, 

    rinkeby: { //changed to websockets url. Migrations kept crashing with http url
      provider: () => new HDWalletProvider(mnemonic, 'wss://rinkeby.infura.io/ws/v3/fa45f0ccc7eb423e983a72671d038716'),
      network_id: 4,
      networkCheckTimeout: 1000000,  
      gas: 4612388,
      timeoutBlocks: 200 
    },
    rinkeby: { //changed to websockets url. Migrations kept crashing with http url
      provider: () => new HDWalletProvider(mnemonic, 'https://rpc.xdaichain.com/'),
      network_id: 100,
      networkCheckTimeout: 1000000,  
      gas: 4612388,
      timeoutBlocks: 200
    },



    // Useful for private networks
    // private: {
      // provider: () => new HDWalletProvider(mnemonic, `https://network.io`),
      // network_id: 2111,   // This network is yours, in the cloud.
      // production: true    // Treats this network as if it was a public net. (default: false)
    // }
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
    reporter: 'eth-gas-reporter',
    reporterOptions : { showTimeSpent: true }
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "^0.8.0",    // Fetch exact version from solc-bin (default: truffle's version)
    }
  },

  plugins: [
    'truffle-plugin-verify'
  ],
  api_keys: {
    etherscan: '29A12AMJ6CT3PA3KS8T6D3F86G42ZDI59J'
  }
}
