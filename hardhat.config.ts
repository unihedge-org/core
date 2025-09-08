import "dotenv/config";
import type {HardhatUserConfig} from "hardhat/config";
import {configVariable} from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";

const config: HardhatUserConfig = {
    plugins: [hardhatToolboxViemPlugin],
    solidity: {
        version: "0.8.28",
        settings: {optimizer: {enabled: true, runs: 200}, viaIR: true},
    },
    networks: {
        // your simulated nets
        hardhatMainnet: {type: "edr-simulated", chainType: "l1"},
        hardhatOp: {type: "edr-simulated", chainType: "op"},

        // Sepolia
        sepolia: {
            type: "http",
            chainType: "l1",
            url: configVariable("SEPOLIA_RPC_URL"),
            accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
        },

        // Polygon mainnet (for deploys)
        polygon: {
            type: "http",
            chainType: "l1",
            chainId: 137,
            url: configVariable("POLYGON_RPC_URL"),
            accounts: {
                mnemonic: configVariable("MNEMONIC"),
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 1,
            },
        },

        // Forked Polygon for tests/sandbox
        polygonFork: {
            type: "edr-simulated",
            chainType: "l1",
            forking: {
                url: configVariable("POLYGON_RPC_URL"),
                blockNumber: 74657736,
            },
        },
    },
};

export default config;
