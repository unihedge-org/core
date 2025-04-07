const { ethers } = require("hardhat");
const { daiAddress, wMaticAddress, uniswapRouterAddress, IERC20, ISwapRouter} = require('../Helpers/imports');

// Exporting helper function to be used across different test files
async function swapTokenForUsers(users, tokenIn, tokenOut, amountInEther, contractSwapRouter) {
    const decimalsIn = await tokenIn.decimals(); // Use tokenIn decimals (WMATIC=18)
    const amountIn = ethers.utils.parseUnits(amountInEther.toString(), decimalsIn);
    console.log("\x1b[33m%s\x1b[0m", "   Amount to swap: ", ethers.utils.formatUnits(amountIn, decimalsIn), " POL");
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
            let tx = await contractSwapRouter.connect(users[i]).exactInputSingle(params, {value: params.amountIn});
            await tx.wait();
    }
}

async function loadCommonContracts() {
    let accounts = await ethers.getSigners();
    let owner = accounts[0];
    daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, owner);
    wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, owner);    
    contractSwapRouter = await ethers.getContractAt(ISwapRouter.abi, uniswapRouterAddress, owner);
    return {accounts, owner, daiContract, wMaticContract, contractSwapRouter};
}

module.exports = {
    swapTokenForUsers,
    loadCommonContracts
};
