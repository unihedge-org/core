import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ZERO = "0x0000000000000000000000000000000000000000";

const MarketModule = buildModule("MarketModule", (m) => {
    // Parameters are configurable at deploy time, but default to your test values.
    const acct = m.getParameter("acct", ZERO);                         // DEFAULT_ACCOUNTING_TOKEN
    const uniswapPool = m.getParameter("uniswapPool", ZERO);           // DEFAULT_UNISWAP_POOL
    const lotStepInTokenUnits = m.getParameter("lotStepInTokenUnits", 0n);
    const feeProtocolPct1e6   = m.getParameter("feeProtocolPct1e6", 0n);
    const dischargePct1e6     = m.getParameter("dischargePct1e6", 0n);
    const period              = m.getParameter("period", 0n);
    const initTimestamp       = m.getParameter("initTimestamp", 0n);
    const tSettle             = m.getParameter("tSettle", 0n);
    const taxAnchorSeconds    = m.getParameter("taxAnchorSeconds", 0n);

    const market = m.contract("Market", [
        acct,
        uniswapPool,
        lotStepInTokenUnits,
        feeProtocolPct1e6,
        dischargePct1e6,
        period,
        initTimestamp,
        tSettle,
        taxAnchorSeconds,
    ]);

    return { market };
});

export default MarketModule;
