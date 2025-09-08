// ignition/modules/MarketGetterModule.js
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MarketGetterModule = buildModule("MarketGetterModule", (m) => {
    // Deploy MarketGetter contract (no constructor arguments required)
    const marketGetter = m.contract("MarketGetter");

    // Note: MarketGetter does not require the Market address in its constructor.
    // If future versions need to configure MarketGetter with the Market address,
    // you can add logic here to call a setter function or pass it to the constructor.

    return { marketGetter };
});

export default MarketGetterModule;