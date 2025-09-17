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
describe("Swap 100 native → USDC, then deploy Market, then tradeLot & inspect", async function () {
    const { viem } = await network.connect(); // run with: npx hardhat test --network polygonFork
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    let beforeUsdc!: bigint;
    let market: any;
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

        // load USDC base unit
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
        // New constructor (Q96-native):
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
        const needed = baseUnit / 2n; // 0.5 USDC in token units (USDC has 6 decimals)

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

    it("prints current block timestamp", async () => {
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const initialTs = blk.timestamp as bigint;
        console.log(
            `🕒 Initial block timestamp: ${initialTs.toString()} (${new Date(Number(initialTs) * 1000).toISOString()})`
        );
    });

    it("advances chain time to 50% tax point (frame end − 3×taxAnchorSeconds) - 1n (automine compensation)", async () => {
        // This test jumps to a fixed target that corresponds to 50% tax based on your config.
        // If your default constants change, update the arithmetic accordingly.
        const targetTs = 1756828800n - 3n * 5760n - 1n;

        await publicClient.transport.request({
            method: "evm_setNextBlockTimestamp",
            params: [Number(targetTs)],
        });
        await publicClient.transport.request({ method: "evm_mine", params: [] });

        const blkNew = await publicClient.getBlock({ blockTag: "latest" });
        console.log("⏩ Jumped to 50% tax point:", blkNew.timestamp.toString(), new Date(Number(blkNew.timestamp) * 1000));
        assert.equal(blkNew.timestamp, targetTs, "Did not land exactly at the 50% tax timestamp");
    });

    // -----------------------
    // Step 3: tradeLot
    // -----------------------
    it("purchases a lot in the current frame via tradeLot(rate=4000, acquisition=1 USDC)", async () => {
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
        const timestamp = nowTs;         // inside this frame
        const rateQ96 = 4000n * Q96;     // price signal = 4000
        const acquisitionPriceQ96 = Q96; // acquisition price = 1 USDC (in Q96)

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

    const FRAMEKEY_BITS = 64n;

    it("fetches the purchased lot (rate=4050) and its associated trades", async () => {
        // 1) Identify the frame & lot we just purchased into
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        const frameKey = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        })) as bigint;

        const rateQ96 = 4050n * Q96;

        // NEW: clcLotKeyT returns lot key in TOKEN units (T)
        const lotKeyTokens = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcLotKeyT",
            args: [rateQ96],
        })) as bigint;

        // lotId = (lotKey << 64) | frameKey
        const lotId = (lotKeyTokens << FRAMEKEY_BITS) | frameKey;

        // 2) Load lot
        const lot = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "getLot",
            args: [lotId],
        })) as any;

        const tradeIdxs: bigint[] = lot.trades as bigint[];
        console.log(`\n📦 Lot ${lotId.toString()} (frameKey=${frameKey.toString()}, lotKeyTokens=${lotKeyTokens.toString()})`);
        console.log(`   trades count: ${tradeIdxs.length}`);
        assert(tradeIdxs.length > 0, "Lot has no trades");

        // 3) Print each trade (note: taxT is in token units, not Q96)
        for (let i = 0; i < tradeIdxs.length; i++) {
            const idx = tradeIdxs[i];
            const t = (await publicClient.readContract({
                address: market.address as `0x${string}`,
                abi: MARKET_ABI,
                functionName: "trades",
                args: [idx],
            })) as any;

            const ts = t[0] as bigint;
            const bn = t[1] as bigint;
            const lotID = t[2] as bigint;
            const owner = t[3] as `0x${string}`;
            const acqQ96 = t[4] as bigint;
            const taxT = t[5] as bigint; // CHANGED: this is token units now
            const horizon = t[6] as bigint;
            const mode = t[7] as bigint; // 0=PURCHASE,1=REVALUATE,2=RESALE

            const acqUsdc = Number(acqQ96) / Number(Q96);          // only for display
            const taxUsdc = Number(taxT) / Number(baseUnit);       // correct: tokens → decimal
            const modeStr =
                mode === 0n ? "PURCHASE" : mode === 1n ? "REVALUATE" : mode === 2n ? "RESALE" : `UNKNOWN(${mode})`;

            console.log(`\n  🔹 Trade #${idx.toString()} [${modeStr}]`);
            console.log(`     timestamp:           ${ts.toString()} (${new Date(Number(ts) * 1000).toISOString()})`);
            console.log(`     blockNumber:         ${bn.toString()}`);
            console.log(`     lotID:               ${lotID.toString()}`);
            console.log(`     owner:               ${owner}`);
            console.log(`     acquisitionPriceQ96: ${acqQ96.toString()}  (~ ${acqUsdc} USDC)`);
            console.log(`     taxT:                ${taxT.toString()}    (~ ${taxUsdc} USDC)`);
            console.log(`     horizon              ${horizon.toString()} seconds`);
        }

        // 4) Sanity: last trade should be ours and tax ≈ 0.5 USDC at 50% point
        const lastIdx = tradeIdxs[tradeIdxs.length - 1];
        const last = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "trades",
            args: [lastIdx],
        })) as any;

        const lastOwner = last[3] as `0x${string}`;
        const lastTaxT = last[5] as bigint; // token units
        const expectedHalfT = baseUnit / 2n; // 0.5 * baseUnit

        const diff = lastTaxT > expectedHalfT ? lastTaxT - expectedHalfT : expectedHalfT - lastTaxT;

        assert.equal(lastOwner.toLowerCase(), wallet.account.address.toLowerCase(), "Last trade owner mismatch");
        // allow 1 atomic unit tolerance
        assert(diff <= 1n, "Last trade tax is not ~0.5 USDC at 50% point");
    });
});
