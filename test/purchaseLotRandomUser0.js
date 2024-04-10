const {expect} = require("chai");
const {ethers} = require("hardhat");
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json');
const fs = require('fs');

describe("Purchase one random empty lot", function () {
    let accounts, daiContract, wMaticContract, contractMarket, contractMarketGetter;
    const marketAddress = "0x0B0ce68385a39907BcbAb7327EDCA4eFABA092d1";
    const daiAddress = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
    const wMaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"// Correct DAI address needed
    const marketGetterAddress = "0xA921B22291d8468A71e610f79F42441ce492Df7a";
    let account;
    let dPrice;

    let price = 0;

    before(async function () {
        accounts = await ethers.getSigners();

        
        // Setup or get existing contracts here, if necessary
        daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, accounts[0]);
        wMaticContract = await ethers.getContractAt(IERC20.abi, wMaticAddress, accounts[0]);
        //Load market contract from address
        contractMarket = await ethers.getContractAt("Market", marketAddress, accounts[0]);
        //Load market getter contract from address
        contractMarketGetter = await ethers.getContractAt("MarketGetter", marketGetterAddress, accounts[0]);


        //Get DAI Balance of first 10 accounts
        for (let i = 0; i < 10; i++) {
            daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, accounts[i]);
            let balance = await daiContract.balanceOf(accounts[i].address);
            console.log("\x1b[36m%s\x1b[0m", "   DAI balance of account ", accounts[i].address, ": ", ethers.utils.formatUnits(balance, 18), " DAI");
        }

        //Use account from .secret file which contains private key
        //Load private key from .secret file
        
        const PRIVATE_KEY = fs.readFileSync(".secret").toString().trim();
        //Load account from private key
        account = new ethers.Wallet(PRIVATE_KEY, ethers.provider);
        console.log("\x1b[36m%s\x1b[0m", "   Account address: ", account.address);
        //get dai balance of account
        let balance = await daiContract.balanceOf(account.address);
        console.log("\x1b[36m%s\x1b[0m", "   DAI balance: ", ethers.utils.formatUnits(balance, 18), " DAI");

        //Convert account to signer
        account = account.connect(ethers.provider);

        //acount sends 1 DAI to first 10 accounts
        for (let i = 0; i < 10; i++) {
            //Send 1 DAI to account
            console.log("\x1b[36m%s\x1b[0m", "   Send 1 DAI to account ", accounts[i].address);
            //Console mining process in  purple with tab before
            console.log("\x1b[35m%s\x1b[0m", "   ...Mining...");
            await daiContract.connect(account).transfer(accounts[i].address, ethers.utils.parseUnits("1", 18));
        }
    });

    it("Get current price of market", async function () {
        price = Number(await contractMarket.connect(account).clcRate());
        expect(price).to.be.gt(0);
        //Console in blue with two tabs price in blue
        console.log("\x1b[36m%s\x1b[0m", "   Current rate: ", price);
    });

    it("Chose one random unoccupied lot", async function () {

        //Generate random timestamp from now and 10 days ahead
        let timestamp = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 864000);
        //Generate random rate from 0.9 of price to 1.1 of price
        let rate = Math.floor(price * (0.9 + Math.random() * 0.2));

        //Random value between 0.01 and 1 DAI
        let acquisitionPrice = ethers.utils.parseUnits((0.01 + Math.random() * 0.99).toFixed(2), 18); // DAI

        console.log("\x1b[36m%s\x1b[0m", "   Random timestamp: ", timestamp);
        console.log("\x1b[36m%s\x1b[0m", "   Random rate: ", BigInt(rate));
        console.log("\x1b[36m%s\x1b[0m", "   Random acquisition price: ", ethers.utils.formatUnits(acquisitionPrice, 18), " DAI");
        //Clc frame key
        let frameKey = await contractMarket.clcFrameKey(timestamp);
        console.log("\x1b[36m%s\x1b[0m", "   Frame key: ", frameKey);
        //Clc lot key
        let lotKey = await contractMarket.clcLotKey(BigInt(rate));
        console.log("\x1b[36m%s\x1b[0m", "   Lot key: ", lotKey);

        //Check if lot exists
        try {
            let lot = await contractMarket.getLot(frameKey, lotKey);
            //Return to start of for loop
            console.log("\x1b[36m%s\x1b[0m", "   Lot exists: ", lot);
            //Log that process wil be terminated in red
            console.log("\x1b[31m%s\x1b[0m", "   Purchase process terminated. Please try again.");
        } catch (e) {
            //Purchase lot
            //Random number between 0 and 9
            let num = Math.floor(Math.random() * 9);
            let tax = await contractMarket.clcTax(frameKey, acquisitionPrice);
            console.log("\x1b[36m%s\x1b[0m", "   Tax: ", tax);
            //Set allowance to spend DAI
            console.log("\x1b[36m%s\x1b[0m", "   Set allowance to spend DAI");
            //Console mining process in  purple with tab before
            console.log("\x1b[35m%s\x1b[0m", "   ...Mining...");
            await daiContract.connect(accounts[num]).approve(contractMarket.address, tax);

            let allowance = await daiContract.allowance(accounts[num].address, contractMarket.address);
            console.log("\x1b[36m%s\x1b[0m", "   Allowance: ", allowance);
            expect(allowance).to.be.eq(tax);

            //Purchase lot
            console.log("\x1b[36m%s\x1b[0m", "   Purchase lot");
            //Console mining process in  purple with tab before
            console.log("\x1b[35m%s\x1b[0m", "   ...Mining...");
            await contractMarket.connect(accounts[num]).tradeLot(frameKey, lotKey, acquisitionPrice);

            let lot = await contractMarket.getLot(frameKey, lotKey);

            expect(lot.states[0].owner).to.be.eq(accounts[num].address);
            console.log("\x1b[36m%s\x1b[0m", "   Lot owner: ", lot.states[0].owner);

            //Log purchased lot
            console.log("\x1b[36m%s\x1b[0m", "   Lot purchased: ", lot);

        }


    });
    it('Get DAI balance of account', async function () {
        //Get DAI balance of accounts, first 10 accounts
        for (let i = 0; i < 10; i++) {
            daiContract = await ethers.getContractAt(IERC20.abi, daiAddress, accounts[i]);
            let balance = await daiContract.balanceOf(accounts[i].address);
            console.log("\x1b[36m%s\x1b[0m", "   DAI balance of account ", accounts[i].address, ": ", ethers.utils.formatUnits(balance, 18), " DAI");
        }
        //Get DAI balance of account
        let balance = await daiContract.balanceOf(account.address);
        console.log("\x1b[36m%s\x1b[0m", "   DAI balance: ", ethers.utils.formatUnits(balance, 18), " DAI");
    });
})

