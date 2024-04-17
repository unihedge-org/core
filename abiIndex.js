import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to read and parse a JSON file to get the ABI
function getContractABI(filePath) {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return json.abi;
}

// Specify the path to the JSON files for the Market and MarketGetter contracts
// Adjust the paths according to your project structure
const marketABIPath = path.resolve(__dirname, 'artifacts/contracts/Market.sol/Market.json');
const marketGetterABIPath = path.resolve(__dirname, 'artifacts/contracts/MarketGetter.sol/MarketGetter.json');

// Read and export the ABIs
export const MarketABI = getContractABI(marketABIPath);
export const MarketGetterABI = getContractABI(marketGetterABIPath);
