// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library MLib {
    enum SFrame {NULL, OPENED, CLOSED}
    enum SLot {NULL, BOUGHT, SETTLED}

    struct Frame {
        uint frameKey; 
        uint oracleTimestampStart;
        uint oracleTimestampEnd;
        uint rewardFund;
        uint priceAverage;
        uint oraclePrice0CumulativeStart;
        uint oraclePrice0CumulativeEnd;
        uint oraclePrice1CumulativeStart;
        uint oraclePrice1CumulativeEnd;
        SFrame state;
        uint[] lotKeys;
    } 

    struct Lot {
        uint frameKey;
        uint lotKey;
        address lotOwner;
        uint acquisitionPrice;
        SLot state;
    }

    struct User {
        uint commulativeTax;
        address[] refferals;
        address refferdBy;
    }

    // struct Referal {
    //     address ownerPublicKey;
    //     address referralPublicKey;
    //     string message;
    // }
    
}
