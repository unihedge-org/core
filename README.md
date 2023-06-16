Software | Version
------------- | -------------
Hardhat  | 2.6.4
Solidity  | ^0.8.0 (solc-js)
Node | v14.17.2


## **Market** contract functions

* Recent updates:
    * New function: addReferral(address referralPublicKey, string memory message)
        * *referralPublicKey => PublicKey of the person that sent the referal link*
        * *message => signed message(referralPublicKey) by the msg.sender (person who called the contract)*
        * referral info is saved to:
            * struct Referal {
                    address ownerPublicKey;
                    address referralPublicKey;
                    string message;
                }
            * Each Referral struct is mapped onto user's address:
                * mapping(address => MLib.Referal) public referals;
        * This function can only be called if user hasn't bought any lots

* Deployed contracts on Polygon mainnet:

    * Market Factory address (08. 06. 23): 0xE660B1173aaD602EDfdEf28d57Fe4Fb8478fAeeD
    * Market Getter address (08. 06. 23): 0x6eBc9E85179737C69dA2Be5007eaf84124af71BC
    * Market address (08. 06. 23): 0x332D5863a16E92039e1Eef7D04883CdF5d23846e
        * Accounting Token - DAI: 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063
        * Pair: 0x6FF62bfb8c12109E8000935A6De54daD83a4f39f
        * WETH: 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619
        * DAI: 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063       


Factory deployed to: 
Market address: 
MarketGetter deployed to: 



* Deployed contracts on Goerli testnet:

    * Market Factory address (16. 06. 23): 0x664d692F2241f50beAA9f45870aBccD846e93F38
    * Market Getter address (16. 06. 23): 0xdD146Ec5e8D60b128A951725ab0D2A8ea317F8eE
    * Market address (16. 06. 23): 0x3e2fAdfC46957a05Df4C3e0cbc40Ca0804391F89
        * Accounting Token - DAI: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
        * Pair: 0x5dD9dec52a16d4d1Df10a66ac71d4731c9Dad984
        * WETH: 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6
        * DAI: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844      



