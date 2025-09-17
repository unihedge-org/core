import assert from "assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import type { Abi } from "viem";
import "dotenv/config";
import BigNumber from "bignumber.js";

// ===== Market artifact =====
import MarketJson from "../artifacts/contracts/Market.sol/Market.json" with { type: "json" };

const MARKET_ABI = MarketJson.abi as Abi;

// Fixed-point helper
const Q96 = 2n ** 96n;

// Minimal ERC20 Metadata ABI (for decimals)
const ERC20_METADATA_ABI = [
    {
        type: "function",
        name: "decimals",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
    },
] as const;

describe("Market clcTaxT @ specific frameKey", async function () {
    const { viem } = await network.connect(); // run: npx hardhat test --network polygonFork
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();
    let market: any;

    // Helpers to read accounting token + base unit
    const getAccountingToken = async (addr: `0x${string}`) => {
        const accountingToken = (await publicClient.readContract({
            address: addr,
            abi: MARKET_ABI,
            functionName: "accountingToken",
        })) as `0x${string}`;
        return accountingToken;
    };

    const getBaseUnitT = async (tokenAddr: `0x${string}`) => {
        const decimals = (await publicClient.readContract({
            address: tokenAddr,
            abi: ERC20_METADATA_ABI,
            functionName: "decimals",
        })) as number;
        const baseUnit = 10n ** BigInt(decimals);
        return { decimals, baseUnit };
    };

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
            0n, // _initTimestamp        => default as in contract
            0n, // _tSettle              => default 600
            0n, // _taxAnchorSeconds     => default 5_760
        ]);

        assert.ok(market?.address, "Deployment failed (no address returned)");
        console.log("✅ Deployed Market at:", market.address);
    });

    it("advances chain time to the exact start of the next frame", async () => {
        // 1) Get the current block timestamp
        const blk = await publicClient.getBlock({ blockTag: "latest" });
        const nowTs = blk.timestamp as bigint;

        // 2) Read initTimestamp and period from Market
        const initTimestamp = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "initTimestamp",
        })) as bigint;

        const period = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "period",
        })) as bigint;

        // 3) Compute current frame start via clcFrameKey
        const currentFrameKey = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcFrameKey",
            args: [nowTs],
        })) as bigint;

        // 4) Next frame starts at currentFrameKey + period
        const nextFrameStart = currentFrameKey + period;

        // 5) Move time forward to exactly that next frame start
        const delta = nextFrameStart - nowTs;
        await publicClient.transport.request({ method: "evm_increaseTime", params: [Number(delta)] });
        await publicClient.transport.request({ method: "evm_mine", params: [] });

        // 6) Verify new block timestamp == nextFrameStart
        const blkNew = await publicClient.getBlock({ blockTag: "latest" });
        console.log(
            "⏩ Jumped to start of next frame:",
            blkNew.timestamp.toString(),
            new Date(Number(blkNew.timestamp) * 1000)
        );
        assert.equal(blkNew.timestamp, nextFrameStart, "Did not land exactly at next frame start");
    });

    it("calculates clcTaxT at frameKey = 1756828800 for 1 USDC acquisition (should be ~0.25 USDC)", async () => {
        const frameKey = 1756828800n;

        // acquisitionPrice = 1 USDC in Q96
        const acquisitionPriceQ96 = Q96;

        // Load base unit (USDC has 6 decimals)
        const accountingToken = await getAccountingToken(market.address);
        const { decimals, baseUnit } = await getBaseUnitT(accountingToken);

        // expected = 25% of 1 USDC = 0.25 USDC => in token units
        const expectedT = (baseUnit / 4n);

        // call clcTaxT (now returns TOKEN units)
        const taxT = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcTaxT",
            args: [frameKey, acquisitionPriceQ96],
        })) as bigint;

        // Convert to decimal USDC just for logs
        const taxUsdc = Number(taxT) / Number(baseUnit);

        console.log(`\n🧮 clcTaxT at frameKey ${frameKey.toString()}`);
        console.log(`  acquisitionPriceQ96: ${acquisitionPriceQ96.toString()} (== 1 USDC)`);
        console.log(`  taxT:                ${taxT.toString()} (token units)`);
        console.log(`  expectedT:           ${expectedT.toString()} (== 0.25 USDC)`);
        console.log(`  tax (USDC):          ${taxUsdc}`);

        // Assert equality (allow ±1 token unit for rounding tolerance)
        const diff = taxT > expectedT ? taxT - expectedT : expectedT - taxT;
        assert(diff <= 1n, "Tax is not ~0.25 USDC");
    });

    it("calculates clcTaxT off-chain (BigNumber), matching on-chain (should be ~0.25 USDC)", async () => {
        // Read chain time to mirror on-chain horizon
        const blkNow = await publicClient.getBlock({ blockTag: "latest" });
        const chainNowBN = new BigNumber((blkNow.timestamp as bigint).toString());

        // Read base unit
        const accountingToken = await getAccountingToken(market.address);
        const { decimals, baseUnit } = await getBaseUnitT(accountingToken);
        const BASE_UNIT_BN = new BigNumber(baseUnit.toString());

        const Q96_BN = new BigNumber("79228162514264337593543950336"); // 2^96
        const period = new BigNumber("86400");
        const taxAnchorSeconds = new BigNumber("5760");

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

        // ---- off-chain clcTaxT() in tokens ----
        const clcTaxT_offchain = (
            frameKey: string | number | bigint,
            acquisitionPriceQ96_BN: BigNumber
        ): BigNumber => {
            const rateQ96 = getTaxRateQ96(new BigNumber(frameKey.toString()));
            const taxQ96 = mulDiv(rateQ96, acquisitionPriceQ96_BN, Q96_BN); // Q96 units
            // fromQ96: tokens = ⌊taxQ96 * baseUnit / Q96⌋
            return mulDiv(taxQ96, BASE_UNIT_BN, Q96_BN);
        };

        const frameKey = "1756828800";
        const acquisitionPriceQ96_BN = Q96_BN; // 1.0 in Q96
        const expectedT_BN = BASE_UNIT_BN.dividedToIntegerBy(4); // 0.25 * baseUnit

        const taxT_BN = clcTaxT_offchain(frameKey, acquisitionPriceQ96_BN);

        // On-chain reference
        const taxT_onchain = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcTaxT",
            args: [BigInt(frameKey), (2n ** 96n)],
        })) as bigint;

        console.log(`\n🧮 Off-chain clcTaxT at frameKey ${frameKey}`);
        console.log(`  taxT_offchain: ${taxT_BN.toString()} (T)`);
        console.log(`  taxT_onchain:  ${taxT_onchain.toString()} (T)`);
        console.log(`  expectedT:     ${expectedT_BN.toString()} (T)`);

        const diff1 = taxT_BN.minus(new BigNumber(taxT_onchain.toString())).abs();
        const diff2 = taxT_BN.minus(expectedT_BN).abs();

        // Allow +/- 1 token unit (atomic) of tolerance
        assert(diff1.lte(1), `Off-chain vs on-chain mismatch: diff=${diff1.toString()}`);
        assert(diff2.lte(1), `Off-chain vs expected 0.25 mismatch: diff=${diff2.toString()}`);
    });

    it("calculates clcTax at frameKey = 1756828800 for 1 USDC acquisition (off-chain decimal, no Q96)", async () => {
        // Read chain time to mirror on-chain horizon
        const blkNow = await publicClient.getBlock({ blockTag: "latest" });
        const chainNow = blkNow.timestamp as bigint;

        // Read base unit
        const accountingToken = await getAccountingToken(market.address);
        const { decimals, baseUnit } = await getBaseUnitT(accountingToken);
        const BASE_UNIT_BN = new BigNumber(baseUnit.toString());

        const period = new BigNumber(86400);
        const taxAnchorSeconds = new BigNumber(5760);

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
            return rate.multipliedBy(acquisitionPriceDecimal);
        };

        // Inputs
        const frameKey = "1756828800";
        const acquisitionPriceDecimal = new BigNumber(1); // 1.00 USDC

        // Off-chain (decimal) result
        const taxDecimal = clcTaxDecimal(frameKey, acquisitionPriceDecimal); // expected ~0.25 at frame start

        // On-chain reference (tokens), convert to decimal using baseUnit
        const taxT = (await publicClient.readContract({
            address: market.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: "clcTaxT",
            args: [BigInt(frameKey), (2n ** 96n)], // 1.0 in Q96
        })) as bigint;

        const taxOnChainDecimal = new BigNumber(taxT.toString()).div(BASE_UNIT_BN);

        // Logs
        console.log(`\n🧮 Off-chain DEC clcTax at frameKey ${frameKey}`);
        console.log(`  taxDecimal:         ${taxDecimal.toFixed()}`);
        console.log(`  taxOnChainDecimal:  ${taxOnChainDecimal.toFixed()}`);

        // Tight epsilon
        const epsilon = new BigNumber("1e-18");
        const diff = taxDecimal.minus(taxOnChainDecimal).abs();
        assert(diff.lte(epsilon), `Off-chain decimal tax deviates: diff=${diff.toString()}`);
    });
});
