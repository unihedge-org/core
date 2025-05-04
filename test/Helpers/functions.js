const { ethers } = require('hardhat');
const { daiAddress, wMaticAddress, uniswapRouterAddress, IERC20, ISwapRouter } = require('../Helpers/imports');

// Exporting helper function to be used across different test files
async function swapTokenForUsers(users, tokenIn, tokenOut, amountInEther, contractSwapRouter) {
  const decimalsIn = await tokenIn.decimals(); // Use tokenIn decimals (WMATIC=18)
  const amountIn = ethers.utils.parseUnits(amountInEther.toString(), decimalsIn);
  console.log('\x1b[33m%s\x1b[0m', '   Amount to swap: ', ethers.utils.formatUnits(amountIn, decimalsIn), ' POL');
  for (let i = 0; i < users.length; i++) {
    const params = {
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      fee: 3000,
      recipient: users[i].address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 10,
      amountIn: amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    };
    let tx = await contractSwapRouter.connect(users[i]).exactInputSingle(params, { value: params.amountIn });
    await tx.wait();
  }
}

async function loadCommonContracts() {
  let accounts = await ethers.getSigners();
  let owner = accounts[0];
  daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
  wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);
  contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
  return { accounts, owner, daiContract, wMaticContract, contractSwapRouter };
}

function convertToTokenUnits(number, decimals) {
  const dotIndex = number.indexOf('.');
  number = number.slice(0, dotIndex + 1 + decimals);

  // If the number after the dot is less than the decimals, add zeros
  const decimalPlaces = number.length - dotIndex - 1;
  if (decimalPlaces < decimals) {
    const zerosToAdd = decimals - decimalPlaces;
    number += '0'.repeat(zerosToAdd);
  }

  // Remove the dot and convert to BigNumber
  number = number.replace('.', '');
  // Convert to BigNumber and format it
  return ethers.BigNumber.from(number);
}

module.exports = {
  swapTokenForUsers,
  loadCommonContracts,
  convertToTokenUnits,
};

/**
 * Convert token amount (in raw decimals) to Q64.96 fixed-point format
 * @param {BigNumber} amountRaw - token amount in raw units (e.g., 15 USDC = 15 * 10^6)
 * @param {number} tokenDecimals - decimals of the token (e.g., 6 for USDC)
 * @returns {BigNumber} - amount in Q96 format
 */
function toQ96(amountRaw, tokenDecimals) {
  const Q96 = ethers.BigNumber.from(2).pow(96);
  const baseUnit = ethers.BigNumber.from(10).pow(tokenDecimals);
  return amountRaw.mul(Q96).div(baseUnit);
}

/**
 * Convert Q64.96 amount back to token decimals
 * @param {BigNumber} amountQ96 - amount in Q96 format
 * @param {number} tokenDecimals - decimals of the token (e.g., 6 for USDC)
 * @returns {BigNumber} - amount in raw token units
 */
function fromQ96(amountQ96, tokenDecimals) {
  const Q96 = ethers.BigNumber.from(2).pow(96);
  const baseUnit = ethers.BigNumber.from(10).pow(tokenDecimals);
  return amountQ96.mul(baseUnit).add(Q96.div(2)).div(Q96); // rounded to nearest
}

module.exports.toQ96 = toQ96;
module.exports.fromQ96 = fromQ96;
