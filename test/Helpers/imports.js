// Libraries
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Contract artifacts
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');

const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
const wMaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"
const uniswapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; 


// Node.js Utilities
const fs = require('fs');

// Re-exporting the imported modules
module.exports = {
    expect,
    ethers,
    time,
    IERC20,
    ISwapRouter,
    fs,
    daiAddress,
    wMaticAddress,
    uniswapRouterAddress
};