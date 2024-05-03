// Libraries
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Contract artifacts
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');


// Node.js Utilities
const fs = require('fs');

// Re-exporting the imported modules
module.exports = {
    expect,
    ethers,
    time,
    IERC20,
    ISwapRouter,
    fs
};