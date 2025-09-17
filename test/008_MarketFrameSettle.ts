import assert from "assert/strict";
import { before, describe, it } from "node:test";
import { network } from "hardhat";
import { type Abi, erc20Abi, parseEther } from "viem";
import "dotenv/config";

// =======================
// Uniswap V3 SwapRouter ABI
// =======================
import ISwapRouterJson from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json" with { type: "json" };
// =======================
// Market ABI (for readContract calls)
// =======================
import MarketJson from "../artifacts/contracts/Market.sol/Market.json" with { type: "json" };

const ROUTER_ABI = ISwapRouterJson.abi as Abi;
const MARKET_ABI = MarketJson.abi as Abi;

// =======================
// ENV addresses
// =======================
const WMATIC = process.env.WMATIC_ADDRESS as `0x${string}`;
const USDC   = process.env.ACCOUNTING_TOKEN_ADDRESS as `0x${string}`;
const ROUTER = process.env.UNISWAP_ROUTER_ADDRESS as `0x${string}`;

// =======================
// Swap config
// =======================
const PREFERRED_FEE = Number(process.env.FEE_WMATIC_USDC || 500);
const AMOUNT_IN_NATIVE = parseEther("100");

// =======================
// Fixed-point helpers
// =======================
const Q96 = 2n ** 96n;

// =======================
// Helpers
// =======================
async function getTokenBaseUnit(publicClient: any, token: `0x${string}`) {
    const decimals = (await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
    })) as number;

    const baseUnit = 10n ** BigInt(decimals);
    return { decimals, baseUnit };
}

// =======================
// Main suite
// =======================
describe("Swap 100 native → USDC, then deploy Market, then clcTax path", async function () {
    const { viem } = await network.connect(); // run with: npx hardhat test --network polygonFork
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    let beforeUsdc!: bigint;
    let market: any;
    let purchasedFrameKey!: bigint;
    let baseUnit!: bigint; // USDC base unit (10^6)
    let decimals!: number;

    before(async () => {
        if (!WMATIC || !USDC || !ROUTER)
            throw new Error("Missing WMATIC_ADDRESS, ACCOUNTING_TOKEN_ADDRESS (USDC), or UNISWAP_ROUTER_ADDRESS in .env");

        // bump past the exact fork block (avoids historical-hardfork issues)
        await wallet.sendTransaction({ to: wallet.account.address, value: 0n });

        // record initial USDC balance
        beforeUsdc = (await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.account.address],
        })) as bigint;

        const bu = await getTokenBaseUnit(publicClient, USDC);
        baseUnit = bu.baseUnit;
        decimals = bu.decimals;
    });

    // -----------------------
    // Step 1: Swap 100 native → USDC
    // -----------------------
    async function swapExactInputSingle(fee: number) {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        const txHash = await wallet.writeContract({
            address: ROUTER,
            abi: ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [{
                tokenIn: WMATIC,
                tokenOut: USDC,
                fee,
                recipient: wallet.account.address,
                deadline,
                amountIn: AMOUNT_IN_NATIVE,
                amountOutMinimum: 0n, // demo only — set slippage guard in production
                sqrtPriceLimitX96: 0n,
            }],
            value: AMOUNT_IN_NATIVE, // pay with native, router wraps → WMATIC
        });

        const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
        assert.equal(rcpt.status, "success", `exactInputSingle swap failed on fee ${fee}`);
    }

    it("swaps 100 native to USDC (tries 0.05% first, falls back to 0.3%)", async () => {
        try {
            await swapExactInputSingle(PREFERRED_FEE);
        } catch (e) {
            console.warn(`Fee ${PREFERRED_FEE} failed, retrying with 3000...`, (e as Error).message);
            await swapExactInputSingle(3000);
        }

        const afterUsdc = (await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.account.address],
        })) as bigint;

        const received = afterUsdc - beforeUsdc;
        console.log(`✅ Swap results (100 native → USDC):`);
        console.log(`  Received USDC: ${Number(received) / Number(baseUnit)}`);
        assert(received > 0n, "did not receive any USDC");
    });

    // -----------------------
    // Step 2: Deploy Market
    // -----------------------
    it("deploys Market with constructor defaults", async () => {
        // New constructor (Q96-native fee/discharge):
        // (address _acct, address _uniswapPool, uint256 _lotStepInTokenUnits,
        //  uint256 _feeProtocolQ96, uint256 _dischargeRateQ96,
        //  uint256 _period, uint256 _initTimestamp, uint256 _tSettle,
        //  uint256 _taxAnchorSeconds)
        market = await viem.deployContract("Market", [
            "0x0000000000000000000000000000000000000000", // _acct => DEFAULT_ACCOUNTING_TOKEN
            "0x0000000000000000000000000000000000000000", // _uniswapPool => DEFAULT_UNISWAP_POOL
            0n, // _lotStepInTokenUnits  => default 100 tokens
            0n, // _feeProtocolQ96       => default 3.0000% (Q96)
            0n, // _dischargeRateQ96     => default 10.0000% (Q96)
            0n, // _period               => default 86_400
            0n, // _initTimestamp        => default contract const
            0n, // _tSettle              => default 600
            0n, // _taxAnchorSeconds     => default 5_760
        ]);

        assert.ok(market?.address, "Deployment failed (no address returned)");
        console.log("✅ Deployed Market at:", market.address);
    });

    it("verifies Market bytecode exists", async () => {
        const code = await publicClient.getCode({ address: market.address as `0x${string}` });
        assert.ok(code && code !== "0x", "No bytecode at deployed Market address");
        console.log("✅ Verified Market bytecode deployed");
    });

    it("approves 0.5 USDC for Market to spend (for 50% tax on 1 USDC)", async () => {
        const spender = market.address as `0x${string}`;
        const needed = baseUnit / 2n; // 0.5 USDC in token units

        // Check current allowance
        const current = (await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.account.address, spender],
        })) as bigint;

        if (current < needed) {
            const txHash = await wallet.writeContract({
                address: USDC,
                abi: erc20Abi,
                functionName: "approve",
                args: [spender, needed],
            });
            const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
            assert.equal(rcpt.status, "success", "USDC approve failed");
        }

        const post = (await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.account.address, spender],
        })) as bigint;

        console.log(`✅ Approved USDC allowance for Market: ${Number(post) / Number(baseUnit)} USDC`);
        assert(post >= needed, "Allowance is below 0.5 USDC");
    });

    it("advances chain time to 50% tax point (frame end − 3×taxAnchorSeconds) - 1n (automine compensation)", async () => {
        // 1) Current block timestamp
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        // 2) Read period, taxAnchorSeconds, and compute current frame start
        const [period, anchor] = await Promise.all([
            publicClient.readContract({
                address: market.address as `0x${string}`,
                abi: MARKET_ABI,
                functionName: "period",
            }) as Promise<bigint>,
            publicClient.readContract({
                address: market.address as `0x${string}`,
                abi: MARKET_ABI,
                functionName: "taxAnchorSeconds",
            }) as Promise<bigint>,
        ]);

        const currentFrameKey = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        })) as bigint;

        // 3) Target = frameKey + period - 3 * taxAnchorSeconds - 1n
        const targetTs = currentFrameKey + period - 3n * anchor - 1n;

        // 4) Pin the next block timestamp and mine one block
        await publicClient.transport.request({
            method: "evm_setNextBlockTimestamp",
            params: [Number(targetTs)],
        });
        await publicClient.transport.request({ method: "evm_mine", params: [] });

        // 5) Verify we landed exactly at targetTs
        const blkNew = await publicClient.getBlock({ blockTag: "latest" });
        console.log(
            "⏩ Jumped to 50% tax point:",
            blkNew.timestamp.toString(),
            new Date(Number(blkNew.timestamp) * 1000)
        );
        assert.equal(blkNew.timestamp, targetTs, "Did not land exactly at the 50% tax timestamp");
    });

    it("purchases a lot in the current frame via tradeLot(rate=4000, acquisition=1 USDC)", async () => {
        // We are at the 50% tax point from the previous step
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        // Confirm the frameKey for this timestamp
        const frameKey = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        })) as bigint;

        // Parameters
        const timestamp = nowTs;          // any timestamp inside this frame
        const rateQ96 = 4000n * Q96;      // price signal = 4000
        const acquisitionPriceQ96 = Q96;  // acquisition price = 1 USDC

        // Execute tradeLot
        const txHash = await wallet.writeContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "tradeLot",
            args: [timestamp, rateQ96, acquisitionPriceQ96],
        });

        const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
        console.log(`\n✅ tradeLot executed at frameKey=${frameKey.toString()}`);
        console.log(`   timestamp:           ${timestamp.toString()} (${new Date(Number(timestamp) * 1000).toISOString()})`);
        console.log(`   rateQ96:             ${rateQ96.toString()} (== 4000)`);
        console.log(`   acquisitionPriceQ96: ${acquisitionPriceQ96.toString()} (== 1 USDC)`);
        assert.equal(rcpt.status, "success", "tradeLot transaction failed");
    });

    it("closes the purchased frame, sets its rate, and prints it", async () => {
        // frame we purchased into = current frame at this moment
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        const period = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "period",
        })) as bigint;

        purchasedFrameKey = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        })) as bigint;

        // jump to the start of the next frame so purchasedFrameKey is closed
        const targetTs = purchasedFrameKey + period;
        await publicClient.transport.request({
            method: "evm_setNextBlockTimestamp",
            params: [Number(targetTs)],
        });
        await publicClient.transport.request({ method: "evm_mine", params: [] });

        // set the frame rate (required before settle)
        const txHash = await wallet.writeContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "setFrameRate",
            args: [purchasedFrameKey],
        });
        const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
        assert.equal(rcpt.status, "success", "setFrameRate failed");

        // ✅ Read back the frame and print the settled rate
        const frame = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "getFrame",
            args: [purchasedFrameKey],
        })) as any;

        const settlement = frame?.settlement ?? frame?.[2];
        assert.ok(settlement, "Settlement struct missing on returned frame");

        const settledRateQ96: bigint = settlement.rateQ96 ?? settlement[3];
        assert(settledRateQ96 > 0n, "settled rate not set (> 0 expected)");

        const settledRate = Number(settledRateQ96) / Number(Q96);

        console.log(`\n📏 setFrameRate(frameKey=${purchasedFrameKey.toString()}) mined in block ${rcpt.blockNumber}`);
        console.log(`   Settled rateQ96: ${settledRateQ96.toString()}`);
        console.log(`   Settled rate:    ${settledRate}`);
    });
});
