// test/market.deploy.defaults.test.ts
import assert from "assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";

describe("Market — deploy with constructor defaults", async function () {
    const { viem } = await network.connect(); // run with: npx hardhat test test/market.deploy.defaults.test.ts --network polygonFork
    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    let market: any;

    before(async () => {
        // bump past the exact fork block (avoids historical-hardfork issues)
        await wallet.sendTransaction({ to: wallet.account.address, value: 0n });
    });

    it("deploys Market using defaults (Polygon addresses & knobs)", async () => {
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

    it("verifies deployed bytecode exists", async () => {
        const code = await publicClient.getCode({ address: market.address as `0x${string}` });
        assert.ok(code && code !== "0x", "No bytecode at deployed Market address");
        console.log("✅ Verified Market bytecode deployed");
    });
});
