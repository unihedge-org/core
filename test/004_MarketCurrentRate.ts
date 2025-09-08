// test/market.clcRate.current.test.ts
import assert from "assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";

// Q96 = 2^96
const Q96 = 2n ** 96n;

/** Convert Q96 fixed-point to decimal string (BigInt-safe). */
function q96ToDecimalString(xQ96: bigint, dp = 6): string {
    const scale = 10n ** BigInt(dp);
    const scaled = (xQ96 * scale) / Q96;
    const intPart = scaled / scale;
    const fracPart = (scaled % scale).toString().padStart(dp, "0");
    return `${intPart}.${fracPart}`;
}

describe("Market — deploy (defaults) then clcRate()", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    let market: any;
    let forkTime: string;
    let rate1!: bigint;

    before(async () => {
        // bump block forward (avoids historical-hardfork quirks)
        await wallet.sendTransaction({ to: wallet.account.address, value: 0n });

        // fetch fork block + timestamp
        const block = await publicClient.getBlock();
        forkTime = new Date(Number(block.timestamp) * 1000).toISOString();
        console.log(`⏱ Fork at block ${block.number} (${forkTime})`);
    });

    it("deploys Market with constructor defaults", async () => {
        market = await viem.deployContract("Market", [
            "0x0000000000000000000000000000000000000000", // _acct
            "0x0000000000000000000000000000000000000000", // _uniswapPool
            0n, // _lotStepInTokenUnits
            0n, // _feeProtocolPct1e6
            0n, // _dischargePct1e6
            0n, // _period
            0n, // _initTimestamp
            0n, // _tSettle
            0n, // _taxAnchorSeconds
        ]);
        assert.ok(market?.address, "Deployment failed (no address)");
        console.log("✅ Market deployed at:", market.address);
    });

    it("verifies deployed bytecode exists", async () => {
        const code = await publicClient.getCode({
            address: market.address as `0x${string}`,
        });
        assert.ok(code && code !== "0x", "No bytecode at deployed address");
    });

    it("calls clcRate() and logs Q96 + decoded value", async () => {
        rate1 = await market.read.clcRate([]);
        const decoded = q96ToDecimalString(rate1, 8);

        console.log("Market.clcRate() raw Q96:", rate1.toString());
        console.log(`📈 Rate at ${forkTime}: ${decoded}`);

        assert.equal(typeof rate1, "bigint");
    });
});
