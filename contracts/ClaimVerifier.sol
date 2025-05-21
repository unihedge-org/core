// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMarketContract {
    struct Frame {
        uint frameKey;
        uint rate;
        uint[] lotKeys;
        address claimedBy;
        uint rateSettle;
        uint feeSettle;
        uint rewardSettle;
    }
    
    function getFrame(uint frameKey) external view returns (Frame memory);
}

contract ClaimVerifier {
    // Define the interface with the Frame struct

    IMarketContract public marketContract;
    mapping(address => mapping(uint => bool)) public hasClaimed;

    constructor(address _marketContract) {
        marketContract = IMarketContract(_marketContract);
    }

    function claim(uint frameKey) external {
        require(!hasClaimed[msg.sender][frameKey], "Already claimed");
        
        // Get the frame data
        IMarketContract.Frame memory frame = marketContract.getFrame(frameKey);
        
        // Verify the caller is the claimedBy address
        require(frame.claimedBy == msg.sender, "Not the winner");
        
        // Mark as claimed
        hasClaimed[msg.sender][frameKey] = true;
    }
}