import assert from "assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { erc20Abi, parseEther, type Abi } from "viem";
import "dotenv/config";

// Uniswap V3 SwapRouter ABI
import ISwapRouterJson from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json" with { type: "json" };
const ROUTER_ABI = ISwapRouterJson.abi as Abi;

// ENV you need
const WMATIC  = process.env.WMATIC_ADDRESS as `0x${string}`;
const USDC    = process.env.ACCOUNTING_TOKEN_ADDRESS as `0x${string}`;
const ROUTER  = process.env.UNISWAP_ROUTER_ADDRESS as `0x${string}`;

// Optional: prefer 500; we’ll auto-fallback to 3000 if 500 reverts.
const PREFERRED_FEE = Number(process.env.FEE_WMATIC_USDC || 500);

describe("Swap 100 native → USDC via exactInputSingle (WMATIC -> USDC)", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    let beforeUsdc!: bigint;

    before(async () => {
        if (!WMATIC || !USDC || !ROUTER)
            throw new Error("Missing WMATIC_ADDRESS, ACCOUNTING_TOKEN_ADDRESS (USDC), or UNISWAP_ROUTER_ADDRESS in .env");

        // nudge block to avoid historical edge cases
        await wallet.sendTransaction({ to: wallet.account.address, value: 0n });

        beforeUsdc = await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.account.address],
        }) as bigint;
    });

    async function swapExactInputSingle(fee: number) {
        const amountIn = parseEther("100"); // swap exactly 1 native (MATIC on Polygon)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        // exactInputSingle params: router will wrap your native to WMATIC
        const txHash = await wallet.writeContract({
            address: ROUTER,
            abi: ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [{
                tokenIn: WMATIC,                 // IMPORTANT: use WMATIC as tokenIn when sending value
                tokenOut: USDC,
                fee,
                recipient: wallet.account.address,
                deadline,
                amountIn,                        // exact 1 native in
                amountOutMinimum: 0n,            // demo: no slippage guard; use QuoterV2 for production
                sqrtPriceLimitX96: 0n,
            }],
            value: amountIn,                   // pay with native; router wraps to WMATIC
        });

        const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
        assert.equal(rcpt.status, "success", `exactInputSingle swap failed on fee ${fee}`);
    }

    it("swaps 100 native to USDC (tries 0.05% first, falls back to 0.3%)", async () => {
        try {
            await swapExactInputSingle(PREFERRED_FEE); // usually 500 on Polygon
        } catch (e) {
            // common reason: no liquidity at that fee on your fork block
            console.warn(`Fee ${PREFERRED_FEE} failed, retrying with 3000...`, (e as Error).message);
            await swapExactInputSingle(3000);
        }
    });

    it("prints how much USDC we got", async () => {
        const afterUsdc = await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.account.address],
        }) as bigint;

        const received = afterUsdc - beforeUsdc;
        console.log(`\nSwap results (exactInputSingle 100 native → USDC):`);
        console.log(`  Received USDC: ${Number(received) / 1e6}`);
        assert(received > 0n, "did not receive any USDC");
    });
});
