const path = require('path');
const fs = require('fs');

// Function to read and parse a JSON file to get the ABI
function getContractABI(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return json.abi;
}

// Specify the path to the JSON files for the Market and MarketGetter contracts
// Adjust the paths according to your project structure
const marketABIPath = path.resolve(__dirname, 'artifacts/contracts/Market.sol/Market.json');
const marketGetterABIPath = path.resolve(__dirname, 'artifacts/contracts/MarketGetter.sol/MarketGetter.json');
const claimVerifierABIPath = path.resolve(__dirname, 'artifacts/contracts/ClaimVerifier.sol/ClaimVerifier.json');

// Read and export the ABIs
const MarketABI = getContractABI(marketABIPath);
const MarketGetterABI = getContractABI(marketGetterABIPath);
const ClaimVerifierABI = getContractABI(claimVerifierABIPath);

module.exports = {
  MarketABI,
  MarketGetterABI,
  ClaimVerifierABI,
};
