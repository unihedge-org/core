import assert from "assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { mnemonicToAccount, type Address } from "viem/accounts";
import { erc20Abi } from "viem";
import "dotenv/config";

describe("Balance check for wallet from MNEMONIC in .env", async function () {
    const { viem } = await network.connect(); // uses --network <name>
    const publicClient = await viem.getPublicClient();

    let address: Address;
    let accountingToken: `0x${string}`;
    let fundedAddresses: Address[] = [];

    before(async () => {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) throw new Error("MNEMONIC not found in .env");

        const tokenEnv = process.env.ACCOUNTING_TOKEN_ADDRESS;
        if (!tokenEnv) throw new Error("ACCOUNTING_TOKEN_ADDRESS not found in .env");
        accountingToken = tokenEnv as `0x${string}`;

        // Derive 10 accounts from the mnemonic
        for (let i = 0; i < 10; i++) {
            const account = mnemonicToAccount(mnemonic, { accountIndex: i });
            fundedAddresses.push(account.address);
        }

        // Fund each account with 1000 ETH using viem
        const hundredEth = BigInt(100) * BigInt(10**18); // 100 ETH in wei
        for (const addr of fundedAddresses) {
            await publicClient.request({
                method: "hardhat_setBalance" as any, // Use type assertion to bypass TypeScript
                params: [addr, `0x${hundredEth.toString(16)}`],
            });
            console.log(`Funded address ${addr} with 100 ETH`);
        }

        // Set the first account as the primary address for testing
        address = fundedAddresses[0];
        console.log("Using primary address for tests:", address);

        // Bump chain past the exact fork block to avoid hardfork-history issue
        const [wallet] = await viem.getWalletClients();
        await wallet.sendTransaction({ to: address, value: 0n });
    });

    it("reads native coin balance (MATIC) for primary address", async () => {
        const bal = await publicClient.getBalance({ address, blockTag: "latest" });
        console.log("MATIC balance for primary address:", bal.toString(), "wei");
        assert.ok(bal >= 0n, "Failed to read MATIC balance for primary address");
    });

    it("reads Accounting Token (USDC) balance for primary address", async () => {
        const bal = await publicClient.readContract({
            address: accountingToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
            blockTag: "latest",
        }) as bigint;

        console.log("Accounting Token balance for primary address:", bal.toString());
        assert.ok(bal >= 0n, "Failed to read Accounting Token balance");
    });

    it("verifies 100 ETH balance for all 10 addresses", async () => {
        const hundredEth = BigInt(100) * BigInt(10**18); // 100 ETH in wei
        for (const addr of fundedAddresses) {
            const bal = await publicClient.getBalance({ address: addr, blockTag: "latest" });
            console.log(`MATIC balance for ${addr}:`, bal.toString(), "wei");
            assert.equal(bal, hundredEth, `Address ${addr} does not have exactly 100 ETH`);
        }
    });
});