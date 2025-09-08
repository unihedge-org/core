import assert from "assert/strict";
import {describe, it} from "node:test";
import {network} from "hardhat";
import type {Abi} from "viem";
import "dotenv/config";
import BigNumber from "bignumber.js"

// ===== Market artifact =====
import MarketJson from "../artifacts/contracts/Market.sol/Market.json" with {type: "json"};

const MARKET_ABI = MarketJson.abi as Abi;
const MARKET_BYTECODE = MarketJson.bytecode as `0x${string}`;

// Fixed-point helper
const Q96 = 2n ** 96n;

describe("Market clcTax @ specific frameKey", async function () {
    const {viem} = await network.connect(); // run: npx hardhat test --network polygonFork
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();
    let market: any;

    let marketAddress!: `0x${string}`;

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

    it("advances chain time to the exact start of the next frame", async () => {
        // 1) Get the current block timestamp
        const blk = await publicClient.getBlock({blockTag: "latest"});
        const nowTs = blk.timestamp as bigint;

        // 2) Read initTimestamp and period from Market
        const initTimestamp = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "initTimestamp",
        }) as bigint;

        const period = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "period",
        }) as bigint;

        // 3) Compute current frame start via clcFrameKey
        const currentFrameKey = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        }) as bigint;

        // 4) Next frame starts at currentFrameKey + period
        const nextFrameStart = currentFrameKey + period;

        // 5) Move time forward to exactly that next frame start
        const delta = nextFrameStart - nowTs;
        await publicClient.transport.request({method: "evm_increaseTime", params: [Number(delta)]});
        await publicClient.transport.request({method: "evm_mine", params: []});

        // 6) Verify new block timestamp == nextFrameStart
        const blkNew = await publicClient.getBlock({blockTag: "latest"});
        console.log(
            "⏩ Jumped to start of next frame:",
            blkNew.timestamp.toString(),
            new Date(Number(blkNew.timestamp) * 1000) // convert seconds → ms
        );
        assert.equal(blkNew.timestamp, nextFrameStart, "Did not land exactly at next frame start");
    });

    it("calculates clcTax at frameKey = 1756828800 for 1 USDC acquisition (should be 0.25 USDC)", async () => {
        const frameKey = 1756828800n;

        // acquisitionPrice = 1 USDC in Q96
        const acquisitionPriceQ96 = Q96;

        // expected = 25% of 1 USDC = Q96 / 4
        const expectedQ96 = Q96 / 4n;

        // call clcTax
        const taxQ96 = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcTax",
            args: [frameKey, acquisitionPriceQ96],
        }) as bigint;

        // Convert to decimal USDC
        const taxUsdc = Number(taxQ96) / Number(Q96);

        console.log(`\n🧮 clcTax at frameKey ${frameKey.toString()}`);
        console.log(`  acquisitionPriceQ96: ${acquisitionPriceQ96.toString()} (== 1 USDC)`);
        console.log(`  taxQ96:              ${taxQ96.toString()}`);
        console.log(`  expectedQ96:         ${expectedQ96.toString()} (== 0.25 USDC)`);
        console.log(`  tax (USDC):          ${taxUsdc}`);

        // Assert equality (allow ±1 for rounding tolerance)
        const diff = taxQ96 > expectedQ96 ? taxQ96 - expectedQ96 : expectedQ96 - taxQ96;
        assert(diff <= 1n, "Tax is not exactly 0.25 USDC");
    });

    it("calculates clcTax at frameKey = 1756828800 for 1 USDC acquisition (off-chain, should be 0.25 USDC)", async () => {
        // Get the chain's current timestamp so we match getHorizon() semantics
        const blkNow = await publicClient.getBlock({ blockTag: "latest" });
        const chainNowBN = new BigNumber((blkNow.timestamp as bigint).toString());

        // If your constructor can change these, you can read them from the contract.
        // const periodRaw = await publicClient.readContract({ address: market.address, abi: MARKET_ABI, functionName: "period" }) as bigint;
        // const taxAnchorRaw = await publicClient.readContract({ address: market.address, abi: MARKET_ABI, functionName: "taxAnchorSeconds" }) as bigint;

        const Q96_BN = new BigNumber("79228162514264337593543950336"); // 2^96
        const period = new BigNumber("86400");                           // or new BigNumber(periodRaw.toString())
        const taxAnchorSeconds = new BigNumber("5760");                  // or new BigNumber(taxAnchorRaw.toString())

        // Integer sqrt via Newton’s method (floor), mirroring Solidity’s Math.sqrt
        const sqrtBN = (value: BigNumber): BigNumber => {
            const v = new BigNumber(value);
            if (v.isZero()) return new BigNumber(0);
            let z = v.plus(1).dividedToIntegerBy(2);
            let y = v;
            while (z.lt(y)) {
                y = z;
                z = v.dividedToIntegerBy(z).plus(z).dividedToIntegerBy(2);
            }
            return y;
        };

        // Floor mulDiv: ⌊a*b / d⌋
        const mulDiv = (a: BigNumber, b: BigNumber, d: BigNumber): BigNumber =>
            a.multipliedBy(b).dividedToIntegerBy(d);

        // ---- off-chain getTaxRateQ96() ----
        const getTaxRateQ96 = (frameKeyBN: BigNumber): BigNumber => {
            // t = max(0, frameKey + period - block.timestamp)
            const t = BigNumber.max(new BigNumber(0), frameKeyBN.plus(period).minus(chainNowBN));

            // denomQ96 = Q96 + ⌊t*Q96 / taxAnchorSeconds⌋
            const denomQ96 = Q96_BN.plus(mulDiv(t, Q96_BN, taxAnchorSeconds));

            // sqrtDenomQ96 = sqrt(denomQ96 << 96) == sqrt(denomQ96 * 2^96)
            const sqrtDenomQ96 = sqrtBN(denomQ96.multipliedBy(Q96_BN));

            // τ_Q96 = ⌊Q96*Q96 / sqrtDenomQ96⌋
            return mulDiv(Q96_BN, Q96_BN, sqrtDenomQ96);
        };

        // ---- off-chain clcTax() ----
        const clcTaxBN = (frameKey: string | number | bigint, acquisitionPriceBN: BigNumber): BigNumber => {
            const rateQ96 = getTaxRateQ96(new BigNumber(frameKey.toString()));
            return mulDiv(rateQ96, acquisitionPriceBN, Q96_BN);
        };

        const frameKey = "1756828800";
        const acquisitionPriceBN = Q96_BN;                  // 1 USDC in Q96
        const expectedQ96 = Q96_BN.dividedToIntegerBy(4);   // 0.25 USDC

        const taxBN = clcTaxBN(frameKey, acquisitionPriceBN);
        const taxUsdc = taxBN.dividedBy(Q96_BN).toNumber();

        console.log(`\n🧮 Off-chain clcTax at frameKey ${frameKey}`);
        console.log(`  taxBN:       ${taxBN.toString()}`);
        console.log(`  expectedQ96: ${expectedQ96.toString()} (== 0.25 USDC)`);
        console.log(`  tax (USDC):  ${taxUsdc}`);

        const diff = taxBN.minus(expectedQ96).abs();
        assert(diff.lte(1), `Tax is not exactly 0.25 USDC, diff: ${diff.toString()}`);
    });

    it("calculates clcTax at frameKey = 1756828800 for 1 USDC acquisition (off-chain decimal, no Q96)", async () => {
        // Read chain time to mirror on-chain horizon
        const blkNow = await publicClient.getBlock({ blockTag: "latest" });
        const chainNow = blkNow.timestamp as bigint;

        // If constructor can change these, read them from the contract:
        // const periodRaw = await publicClient.readContract({ address: market.address, abi: MARKET_ABI, functionName: "period" }) as bigint;
        // const taxAnchorRaw = await publicClient.readContract({ address: market.address, abi: MARKET_ABI, functionName: "taxAnchorSeconds" }) as bigint;

        const period = new BigNumber(86400);         // or new BigNumber(periodRaw.toString())
        const taxAnchorSeconds = new BigNumber(5760); // or new BigNumber(taxAnchorRaw.toString())

        // High precision + floor rounding to mimic Solidity's bias
        BigNumber.config({ DECIMAL_PLACES: 80, ROUNDING_MODE: BigNumber.ROUND_FLOOR });

        // ---- Pure decimal off-chain calculator (no Q96) ----
        const clcTaxDecimal = (
            frameKey: string | number | bigint,
            acquisitionPriceDecimal: BigNumber
        ): BigNumber => {
            const fk = new BigNumber(frameKey.toString());
            const nowBN = new BigNumber(chainNow.toString());

            // t = max(0, frameKey + period - now)
            const t = BigNumber.max(new BigNumber(0), fk.plus(period).minus(nowBN));

            // denom = 1 + t / taxAnchorSeconds
            const denom = new BigNumber(1).plus(t.div(taxAnchorSeconds));

            // τ(t) = 1 / sqrt(denom)
            const rate = new BigNumber(1).div(denom.sqrt());

            // tax = rate * acquisitionPrice (decimal units, e.g., USDC)
            // If you want to mimic USDC token transfer rounding, floor to 6 dp:
            const tax = rate.multipliedBy(acquisitionPriceDecimal);
            return tax; // keep high precision; we’ll compare with tolerance
        };

        // Inputs
        const frameKey = "1756828800";
        const acquisitionPriceDecimal = new BigNumber(1); // 1.00 USDC

        // Off-chain (decimal) result
        const taxDecimal = clcTaxDecimal(frameKey, acquisitionPriceDecimal); // expected ~0.25 at frame start

        // On-chain reference (so test is robust even if params change)
        const taxQ96 = await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcTax",
            args: [BigInt(frameKey), /* acquisitionPriceQ96 */ (2n ** 96n)], // 1.0 in Q96
        }) as bigint;

        // Convert on-chain Q96 to decimal for comparison
        const q96AsDec = new BigNumber("79228162514264337593543950336"); // 2^96
        const taxOnChainDecimal = new BigNumber(taxQ96.toString()).div(q96AsDec);

        // Logs
        console.log(`\n🧮 Off-chain DEC clcTax at frameKey ${frameKey}`);
        console.log(`  taxDecimal:         ${taxDecimal.toFixed()}`);
        console.log(`  taxOnChainDecimal:  ${taxOnChainDecimal.toFixed()}`);

        // Assert close within a very small epsilon (covers tiny rounding diffs)
        // Epsilon = 1e-18 USDC (tighter than any UI need, still safe)
        const epsilon = new BigNumber("1e-18");
        const diff = taxDecimal.minus(taxOnChainDecimal).abs();
        assert(diff.lte(epsilon), `Off-chain decimal tax deviates: diff=${diff.toString()}`);
    });
});
