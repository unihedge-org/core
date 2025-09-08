import assert from "assert/strict";
import {before, describe, it} from "node:test";
import {network} from "hardhat";
import {type Abi, erc20Abi, parseEther} from "viem";
import "dotenv/config";

// =======================
// Uniswap V3 SwapRouter ABI
// =======================
import ISwapRouterJson
    from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json" with {type: "json"};
// =======================
// Market ABI (for readContract calls)
// =======================
import MarketJson from "../artifacts/contracts/Market.sol/Market.json" with {type: "json"};

const ROUTER_ABI = ISwapRouterJson.abi as Abi;

const MARKET_ABI = MarketJson.abi as Abi;

// =======================
// ENV addresses
// =======================
const WMATIC = process.env.WMATIC_ADDRESS as `0x${string}`;
const USDC = process.env.ACCOUNTING_TOKEN_ADDRESS as `0x${string}`;
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
// Main suite
// =======================
describe("Swap 100 native → USDC, then deploy Market, then clcTax", async function () {
    const {viem} = await network.connect(); // run with: npx hardhat test --network polygonFork
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    let beforeUsdc!: bigint;
    let market: any;

    before(async () => {
        if (!WMATIC || !USDC || !ROUTER)
            throw new Error("Missing WMATIC_ADDRESS, ACCOUNTING_TOKEN_ADDRESS (USDC), or UNISWAP_ROUTER_ADDRESS in .env");

        // bump past the exact fork block (avoids historical-hardfork issues)
        await wallet.sendTransaction({to: wallet.account.address, value: 0n});

        // record initial USDC balance
        beforeUsdc = await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.account.address],
        }) as bigint;
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

        const rcpt = await publicClient.getTransactionReceipt({hash: txHash});
        assert.equal(rcpt.status, "success", `exactInputSingle swap failed on fee ${fee}`);
    }

    it("swaps 100 native to USDC (tries 0.05% first, falls back to 0.3%)", async () => {
        try {
            await swapExactInputSingle(PREFERRED_FEE);
        } catch (e) {
            console.warn(`Fee ${PREFERRED_FEE} failed, retrying with 3000...`, (e as Error).message);
            await swapExactInputSingle(3000);
        }

        const afterUsdc = await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.account.address],
        }) as bigint;

        const received = afterUsdc - beforeUsdc;
        console.log(`✅ Swap results (100 native → USDC):`);
        console.log(`  Received USDC: ${Number(received) / 1e6}`);
        assert(received > 0n, "did not receive any USDC");
    });

    // -----------------------
    // Step 2: Deploy Market
    // -----------------------
    it("deploys Market with constructor defaults", async () => {
        // Constructor (with defaults):
        // (address _acct, address _uniswapPool, uint256 _lotStepInTokenUnits,
        //  uint256 _feeProtocolPct1e6, uint256 _dischargePct1e6,
        //  uint _period, uint _initTimestamp, uint _tSettle,
        //  uint256 _taxAnchorSeconds)
        market = await viem.deployContract("Market", [
            "0x0000000000000000000000000000000000000000", // _acct => DEFAULT_ACCOUNTING_TOKEN
            "0x0000000000000000000000000000000000000000", // _uniswapPool => DEFAULT_UNISWAP_POOL
            0n, // _lotStepInTokenUnits  => default 100 tokens
            0n, // _feeProtocolPct1e6    => default 3.0000%
            0n, // _dischargePct1e6      => default 10.0000%
            0n, // _period               => default 86_400
            0n, // _initTimestamp        => default 1_753_999_200
            0n, // _tSettle              => default 600
            0n, // _taxAnchorSeconds     => default 5_760
        ]);

        assert.ok(market?.address, "Deployment failed (no address returned)");
        console.log("✅ Deployed Market at:", market.address);
    });

    it("verifies Market bytecode exists", async () => {
        const code = await publicClient.getCode({address: market.address as `0x${string}`});
        assert.ok(code && code !== "0x", "No bytecode at deployed Market address");
        console.log("✅ Verified Market bytecode deployed");
    });

    it("approves 0.5 USDC (tax 50%) for Market to spend", async () => {
        const spender = market.address as `0x${string}`;
        const needed = 500_0000n; // 0.25 USDC with 6 decimals

        // Check current allowance
        const current = await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.account.address, spender],
        }) as bigint;

        if (current < needed) {
            const txHash = await wallet.writeContract({
                address: USDC,
                abi: erc20Abi,
                functionName: "approve",
                args: [spender, needed],
            });
            const rcpt = await publicClient.getTransactionReceipt({hash: txHash});
            assert.equal(rcpt.status, "success", "USDC approve failed");
        }

        const post = await publicClient.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.account.address, spender],
        }) as bigint;

        console.log(`✅ Approved USDC allowance for Market: ${Number(post) / 1e6} USDC`);
        assert(post >= needed, "Allowance is below 0.5 USDC");
    });

    it("prints current block timestamp", async () => {
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const initialTs = blk.timestamp as bigint;
        console.log(`🕒 Initial block timestamp: ${initialTs.toString()} (${new Date(Number(initialTs) * 1000).toISOString()})`);
    });

    it("advances chain time to 50% tax point (frame end − 3×taxAnchorSeconds) - 1n(automine compensation) ", async () => {
        // 1) Current block timestamp
        let t2=1756828800n-3n*5760n;

        // 3) Target = frameKey + period - 3 * taxAnchorSeconds -1n for automining compensation
        const targetTs = t2-1n;

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
        // Use the current block timestamp (we are at mid-frame from the previous step)
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        // Confirm the frameKey for this timestamp
        const frameKey = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        }) as bigint;

        // Parameters
        const timestamp = nowTs;             // any timestamp inside this frame
        const rateQ96 = 4000n * Q96;         // price signal = 4000
        const acquisitionPriceQ96 = Q96;     // acquisition price = 1 USDC

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


    // put once near your helpers if not already present:
    const FRAMEKEY_BITS = 64n;

    it("fetches the purchased lot (rate=4050) and its associated trades", async () => {
        // 1) Identify the frame & lot we just purchased into
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        const frameKey = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        }) as bigint;

        const rateQ96 = 4050n * Q96;
        const lotKeyTokens = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcLotKey",
            args: [rateQ96],
        }) as bigint; // token units

        // lotId = (lotKey << 64) | frameKey
        const lotId = (lotKeyTokens << FRAMEKEY_BITS) | frameKey;

        // 2) Load lot
        const lot = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "getLot",
            args: [lotId],
        }) as any;

        const tradeIdxs: bigint[] = lot.trades as bigint[];
        console.log(`\n📦 Lot ${lotId.toString()} (frameKey=${frameKey.toString()}, lotKeyTokens=${lotKeyTokens.toString()})`);
        console.log(`   trades count: ${tradeIdxs.length}`);
        assert(tradeIdxs.length > 0, "Lot has no trades");

        // 3) Print each trade
        for (let i = 0; i < tradeIdxs.length; i++) {
            const idx = tradeIdxs[i];
            const t = await publicClient.readContract({
                address: market.address as `0x${string}`,
                abi: MARKET_ABI,
                functionName: "trades",
                args: [idx],
            }) as any;

            const ts     = t[0] as bigint;
            const bn     = t[1] as bigint;
            const lotID  = t[2] as bigint;
            const owner  = t[3] as `0x${string}`;
            const acqQ96 = t[4] as bigint;
            const taxQ96 = t[5] as bigint;
            const horizon = t[6];
            const mode   = t[7] as bigint; // 0=PURCHASE,1=REVALUATE,2=RESALE

            const acqUsdc = Number(acqQ96) / Number(Q96);
            const taxUsdc = Number(taxQ96) / Number(Q96);
            const modeStr = mode === 0n ? "PURCHASE" : mode === 1n ? "REVALUATE" : mode === 2n ? "RESALE" : `UNKNOWN(${mode})`;

            console.log(`\n  🔹 Trade #${idx.toString()} [${modeStr}]`);
            console.log(`     timestamp:           ${ts.toString()} (${new Date(Number(ts) * 1000).toISOString()})`);
            console.log(`     blockNumber:         ${bn.toString()}`);
            console.log(`     lotID:               ${lotID.toString()}`);
            console.log(`     owner:               ${owner}`);
            console.log(`     acquisitionPriceQ96: ${acqQ96.toString()}  (~ ${acqUsdc} USDC)`);
            console.log(`     taxQ96:              ${taxQ96.toString()}  (~ ${taxUsdc} USDC)`);
            console.log(`     horizon              ${horizon.toString()} seconds`);
        }

        // 4) Sanity: last trade should be ours and tax ≈ 0.5 USDC at 50% point
        const lastIdx = tradeIdxs[tradeIdxs.length - 1];
        const last = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "trades",
            args: [lastIdx],
        }) as any;

        const lastOwner = last[3] as `0x${string}`;
        const lastTaxQ96 = last[5] as bigint;
        const expectedHalf = Q96 / 2n;
        const diff = lastTaxQ96 > expectedHalf ? lastTaxQ96 - expectedHalf : expectedHalf - lastTaxQ96;

        assert.equal(lastOwner.toLowerCase(), wallet.account.address.toLowerCase(), "Last trade owner mismatch");
        assert(diff <= 1n, "Last trade tax is not ~0.5 USDC at 50% point");
    });









});



