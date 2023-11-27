Software | Version
------------- | -------------
Hardhat  | 2.6.4
Solidity  | ^0.8.0 (solc-js)
Node | v14.17.2


## **Market** contract functions

* Recent updates:
    * New struct:
        ```solidity
        struct User {
            address userPublicKey;
            uint commulativeTax;
            address[] referrals;
            address referredBy;
        }
        ```
    * function createUser(address newUser, address referredBy)
        * Get's called if a new address buys a lot
    * function getUserStruct(Market market, address userPubKey)
        * Part of marketGetter smart contract   
    * function getUserAddresses()
        * Returns array of all users that have their owen User struct
        * So all users who bought a lot
    * function getUserStructs(Market market, uint endIndex, uint endIndex)
        * Part of marketGetter smart contract
        * Returns n(=endIndex-endIndex ) of user structs

* Deployed contracts on Polygon mainnet:

    * Market Factory address (27. 11. 23): 0x99E1d83617442A4C601Ae7771B5eC02D68a98AfE
    * Market Getter address (27. 11. 23): 0x93F84209212AFc496458CccA63d15aA63F40b0E6
    * Market address (27. 11. 23): 0xd5Ce1687Ec1E864F206F3Aeb11a1746f4F7347ce
        * Accounting Token - DAI: 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063
        * Pair: 0x6FF62bfb8c12109E8000935A6De54daD83a4f39f
        * WETH: 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619
        * DAI: 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063       

* Deployed contracts on Goerli testnet:

    * Market Factory address (16. 06. 23): 0x664d692F2241f50beAA9f45870aBccD846e93F38
    * Market Getter address (16. 06. 23): 0xdD146Ec5e8D60b128A951725ab0D2A8ea317F8eE
    * Market address (16. 06. 23): 0x3e2fAdfC46957a05Df4C3e0cbc40Ca0804391F89
        * Accounting Token - DAI: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
        * Pair: 0x5dD9dec52a16d4d1Df10a66ac71d4731c9Dad984
        * WETH: 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6
        * DAI: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844      



