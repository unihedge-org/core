const { ethers } = require("hardhat");

// Exporting helper function to be used across different test files
async function swapTokenForUsers(users, tokenIn, tokenOut, amountInEther, contractSwapRouter) {
    for (let i = 0; i < users.length; i++) {
            const params = {
                tokenIn: tokenIn.address,
                tokenOut: tokenOut.address,
                fee: 3000,
                recipient: users[i].address,
                deadline: Math.floor(Date.now() / 1000) + 60 * 10,
                amountIn: ethers.utils.parseEther(amountInEther.toString()),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            let tx = await contractSwapRouter.connect(users[i]).exactInputSingle(params, {value: params.amountIn});
            await tx.wait();
    }
}

module.exports = {
    swapTokenForUsers
};
