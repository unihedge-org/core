import assert from "assert/strict";
import { before, describe, it } from "node:test";
import { network } from "hardhat";
import { type Abi, erc20Abi, parseEther } from "viem";
import "dotenv/config";

// =======================
// Uniswap V3 SwapRouter ABI
// =======================
import ISwapRouterJson
    from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json" with { type: "json" };
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

// USDC has 6 decimals in this setup
const ONE_USDC = 1_000_000n;

// Helper: top up allowance when needed
async function ensureAllowance(
    publicClient: any,
    wallet: any,
    token: `0x${string}`,
    owner: `0x${string}`,
    spender: `0x${string}`,
    needed: bigint
) {
    const current = (await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
    })) as bigint;

    if (current < needed) {
        const txHash = await wallet.writeContract({
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, needed],
        });
        const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
        assert.equal(rcpt.status, "success", "USDC approve failed");
    }
}

// =======================
// Main suite
// =======================
describe("Swap 100 native → USDC, then deploy Market, then clcTax", async function () {
    const { viem } = await network.connect(); // run with: npx hardhat test --network polygonFork
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    let beforeUsdc!: bigint;
    let market: any;

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
        console.log(`  Received USDC: ${Number(received) / 1e6}`);
        assert(received > 0n, "did not receive any USDC");
    });

    // -----------------------
    // Step 2: Deploy Market
    // -----------------------
    it("deploys Market with constructor defaults", async () => {
        market = await viem.deployContract("Market", [
            "0x0000000000000000000000000000000000000000", // _acct => DEFAULT_ACCOUNTING_TOKEN
            "0x0000000000000000000000000000000000000000", // _uniswapPool => DEFAULT_UNISWAP_POOL
            0n, // _lotStepInTokenUnits  => default 100 tokens
            0n, // _feeProtocolQ96       => default 3.0000%
            0n, // _dischargeRateQ96     => default 10.0000%
            0n, // _period               => default 86_400
            0n, // _initTimestamp        => default
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

    it("approves 0.5 USDC (for 50% tax on 1 USDC) for Market to spend", async () => {
        // Approve slightly more than needed; 1 USDC covers 0.5 + any rounding
        const spender = market.address as `0x${string}`;
        const needed = ONE_USDC; // 1.0 USDC

        await ensureAllowance(publicClient, wallet, USDC, wallet.account.address, spender, needed);

        const post = (await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.account.address, spender],
        })) as bigint;

        console.log(`✅ Approved USDC allowance for Market: ${Number(post) / 1e6} USDC`);
        assert(post >= needed, "Allowance is below 1.0 USDC");
    });

    it("prints current block timestamp", async () => {
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const initialTs = blk.timestamp as bigint;
        console.log(`🕒 Initial block timestamp: ${initialTs.toString()} (${new Date(Number(initialTs) * 1000).toISOString()})`);
    });

    it("advances chain time to 50% tax point (frame end − 3×taxAnchorSeconds) - 1n (automine compensation)", async () => {
        // 1) Current block timestamp -> compute current frame
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

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

        // Target = frameKey + period - 3 * taxAnchorSeconds - 1n
        const targetTs = currentFrameKey + period - 3n * anchor - 1n;

        await publicClient.transport.request({
            method: "evm_setNextBlockTimestamp",
            params: [Number(targetTs)],
        });
        await publicClient.transport.request({ method: "evm_mine", params: [] });

        const blkNew = await publicClient.getBlock({ blockTag: "latest" });
        console.log(
            "⏩ Jumped to 50% tax point:",
            blkNew.timestamp.toString(),
            new Date(Number(blkNew.timestamp) * 1000)
        );
        assert.equal(blkNew.timestamp, targetTs, "Did not land exactly at the 50% tax timestamp");
    });

    it("purchases a lot in the current frame via tradeLot(rate=4000, acquisition=1 USDC)", async () => {
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        const frameKey = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        })) as bigint;

        const timestamp = nowTs;
        const rateQ96 = 4000n * Q96;
        const acquisitionPriceQ96 = Q96; // 1 USDC in Q96

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

    it("fetches the purchased lot (by last trade) and its associated trades", async () => {
        // Get the last trade index
        const tradeCount = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "getTradesCount",
        })) as bigint;
        const lastIdx = tradeCount - 1n;
        assert(lastIdx >= 0n, "No trades exist");

        // Fetch the last trade
        const last = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "trades",
            args: [lastIdx],
        })) as any;

        const lotId = last[2] as bigint; // lotID from trade
        const lastOwner = last[3] as `0x${string}`;
        const lastTaxT = last[5] as bigint; // taxT (in token units)

        // Load lot using lotId
        const lot = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "getLot",
            args: [lotId],
        })) as any;

        const tradeIdxs: bigint[] = lot.trades as bigint[];
        console.log(`\n📦 Lot ${lotId.toString()}`);
        console.log(`   trades count: ${tradeIdxs.length}`);
        assert(tradeIdxs.length > 0, "Lot has no trades");

        // Print each trade
        for (let i = 0; i < tradeIdxs.length; i++) {
            const idx = tradeIdxs[i];
            const t = (await publicClient.readContract({
                address: market.address as `0x${string}`,
                abi: MARKET_ABI,
                functionName: "trades",
                args: [idx],
            })) as any;

            const ts      = t[0] as bigint;
            const bn      = t[1] as bigint;
            const lotID   = t[2] as bigint;
            const owner   = t[3] as `0x${string}`;
            const acqQ96  = t[4] as bigint;
            const taxT    = t[5] as bigint; // token units
            const horizon = t[6] as bigint;
            const mode    = t[7] as bigint; // 0=PURCHASE,1=REVALUATE,2=RESALE

            // Decode lotID into frameKey and lotKeyTokens
            const frameKey = lotID & ((1n << 64n) - 1n); // lower 64 bits
            const lotKeyTokens = lotID >> 64n;           // upper bits (token units)

            const acqUsdc = Number(acqQ96) / Number(Q96);
            const taxUsdc = Number(taxT) / 1e6;
            const modeStr = mode === 0n ? "PURCHASE" : mode === 1n ? "REVALUATE" : mode === 2n ? "RESALE" : `UNKNOWN(${mode})`;

            console.log(`\n  🔹 Trade #${idx.toString()} [${modeStr}]`);
            console.log(`     timestamp:           ${ts.toString()} (${new Date(Number(ts) * 1000).toISOString()})`);
            console.log(`     blockNumber:         ${bn.toString()}`);
            console.log(`     lotID:               ${lotID.toString()}`);
            console.log(`     frameKey:            ${frameKey.toString()}`);
            console.log(`     lotKeyTokens:        ${lotKeyTokens.toString()}`);
            console.log(`     owner:               ${owner}`);
            console.log(`     acquisitionPriceQ96: ${acqQ96.toString()}  (~ ${acqUsdc} USDC)`);
            console.log(`     taxT:                ${taxT.toString()}  (~ ${taxUsdc} USDC)`);
            console.log(`     horizon:             ${horizon.toString()} seconds`);
        }

        // Sanity: last trade should be ours and tax ≈ 0.5 USDC at 50% point
        const expectedHalfT = 500_000n; // 0.5 USDC in 6dp
        const diff = lastTaxT > expectedHalfT ? lastTaxT - expectedHalfT : expectedHalfT - lastTaxT;

        assert.equal(lastOwner.toLowerCase(), wallet.account.address.toLowerCase(), "Last trade owner mismatch");
        assert(diff <= 1n, "Last trade tax is not ~0.5 USDC at 50% point");
    });

    it("prints current block timestamp", async () => {
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const ts = blk.timestamp as bigint;
        console.log(`🕒 Current block timestamp: ${ts.toString()} (${new Date(Number(ts) * 1000).toISOString()})`);
    });

    it("advance time to 10.9.2025 minus 99*anchor", async () => {
        // 10 Sep 2025 00:00:00 UTC is 1757443200; you used 1757520000 earlier — using your exact provided ts:
        // You provided: 1757520000n - 570240n = 99 * 5760n anchor seconds earlier than that day’s start
        const targetTs = 1757520000n - 570240n - 1n;

        await publicClient.transport.request({
            method: "evm_setNextBlockTimestamp",
            params: [Number(targetTs)],
        });
        await publicClient.transport.request({ method: "evm_mine", params: [] });

        const blkNew = await publicClient.getBlock({ blockTag: "latest" });
        console.log(
            "⏩ Jumped to 10% tax point:",
            blkNew.timestamp.toString(),
            new Date(Number(blkNew.timestamp) * 1000)
        );
        assert.equal(blkNew.timestamp, targetTs, "Did not land exactly at the intended 10% tax timestamp");
    });

    it("purchases a lot in the future frame via tradeLot(rate=4000, acquisition=1 USDC)", async () => {
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const now = blk.timestamp as bigint;

        // Frame timestamp inside a future frame (your provided value as bigint)
        const frameTs = 1757433600n; // inside the target frame
        const rateQ96 = 4000n * Q96;
        const acquisitionPriceQ96 = Q96; // 1 USDC

        // Top up allowance for this new purchase (10% of 1 USDC ≈ 0.1 USDC; approve 1 USDC to be safe)
        await ensureAllowance(
            publicClient,
            wallet,
            USDC,
            wallet.account.address,
            market.address as `0x${string}`,
            ONE_USDC
        );

        const txHash = await wallet.writeContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "tradeLot",
            args: [frameTs, rateQ96, acquisitionPriceQ96],
        });

        const rcpt = await publicClient.getTransactionReceipt({ hash: txHash });
        console.log(`\n✅ tradeLot executed at frameKey=${frameTs.toString()}`);
        console.log(`   now:                 ${now.toString()} (${new Date(Number(now) * 1000).toISOString()})`);
        console.log(`   rateQ96:             ${rateQ96.toString()} (== 4000)`);
        console.log(`   acquisitionPriceQ96: ${acquisitionPriceQ96.toString()} (== 1 USDC)`);
        assert.equal(rcpt.status, "success", "tradeLot transaction failed");
    });

    it("fetches the purchased future lot (via last trade) and its associated trades, checks 10% tax", async () => {
        const tradeCount = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "getTradesCount",
        })) as bigint;
        const lastIdx = tradeCount - 1n;
        assert(lastIdx >= 0n, "No trades exist");

        const last = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "trades",
            args: [lastIdx],
        })) as any;

        const lotId = last[2] as bigint;
        const lastOwner = last[3] as `0x${string}`;
        const lastTaxT = last[5] as bigint; // taxT (token units)

        // Load lot using lotId
        const lot = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "getLot",
            args: [lotId],
        })) as any;

        const tradeIdxs: bigint[] = lot.trades as bigint[];
        console.log(`\n📦 Lot ${lotId.toString()}`);
        console.log(`   trades count: ${tradeIdxs.length}`);
        assert(tradeIdxs.length > 0, "Lot has no trades");

        // Print each trade
        for (let i = 0; i < tradeIdxs.length; i++) {
            const idx = tradeIdxs[i];
            const t = (await publicClient.readContract({
                address: market.address as `0x${string}`,
                abi: MARKET_ABI,
                functionName: "trades",
                args: [idx],
            })) as any;

            const ts      = t[0] as bigint;
            const bn      = t[1] as bigint;
            const lotID   = t[2] as bigint;
            const owner   = t[3] as `0x${string}`;
            const acqQ96  = t[4] as bigint;
            const taxT    = t[5] as bigint; // token units
            const horizon = t[6] as bigint;
            const mode    = t[7] as bigint;

            const frameKey = lotID & ((1n << 64n) - 1n);
            const lotKeyTokens = lotID >> 64n;

            const acqUsdc = Number(acqQ96) / Number(Q96);
            const taxUsdc = Number(taxT) / 1e6;
            const modeStr = mode === 0n ? "PURCHASE" : mode === 1n ? "REVALUATE" : mode === 2n ? "RESALE" : `UNKNOWN(${mode})`;

            console.log(`\n  🔹 Trade #${idx.toString()} [${modeStr}]`);
            console.log(`     timestamp:           ${ts.toString()} (${new Date(Number(ts) * 1000).toISOString()})`);
            console.log(`     blockNumber:         ${bn.toString()}`);
            console.log(`     lotID:               ${lotID.toString()}`);
            console.log(`     frameKey:            ${frameKey.toString()}`);
            console.log(`     lotKeyTokens:        ${lotKeyTokens.toString()}`);
            console.log(`     owner:               ${owner}`);
            console.log(`     acquisitionPriceQ96: ${acqQ96.toString()}  (~ ${acqUsdc} USDC)`);
            console.log(`     taxT:                ${taxT.toString()}  (~ ${taxUsdc} USDC)`);
            console.log(`     horizon:             ${horizon.toString()} seconds`);
        }

        // Expect ~0.1 USDC at “10% point”
        const expectedTenthT = 100_000n; // 0.1 USDC in 6dp
        const diff = lastTaxT > expectedTenthT ? lastTaxT - expectedTenthT : expectedTenthT - lastTaxT;

        assert.equal(lastOwner.toLowerCase(), wallet.account.address.toLowerCase(), "Last trade owner mismatch");
        assert(diff <= 1n, "Last trade tax is not ~0.1 USDC at 10% point");
    });

    it("advance time to 15.9.2025", async () => {
        const targetTs = 1757692800n - 1n;

        await publicClient.transport.request({
            method: "evm_setNextBlockTimestamp",
            params: [Number(targetTs)],
        });
        await publicClient.transport.request({ method: "evm_mine", params: [] });

        const blkNew = await publicClient.getBlock({ blockTag: "latest" });
        console.log(
            "⏩ Jumped to 15.9.2025:",
            blkNew.timestamp.toString(),
            new Date(Number(blkNew.timestamp) * 1000)
        );
        assert.equal(blkNew.timestamp, targetTs, "Did not land exactly at the requested timestamp");
    });
});
