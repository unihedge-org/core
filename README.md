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

* Deployed contracts on Goerli testnetwork

    * Market Factory address (25. 5. 23): 0xdbe926f96e2250d7C4901f118225566Dc654B969
    * Market Getter address (25. 5. 23): 0x10326A39caD42D314B583929A4b3A1A3366CDA4A
    * Market address (25. 5. 23): 0x7fD0bAE1518b966f7dBAB634D8C868Fe809Ab3BF
        * Accounting Token - DAI: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
        * Pair: 0x5dD9dec52a16d4d1Df10a66ac71d4731c9Dad984
        * WETH: 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6
        * DAI: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
        



#### TODO:
* Switch to Uniswap V3 contracts. 













