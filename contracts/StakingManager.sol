pragma solidity ^0.4.0;

import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract StakingManager {
    //Token asset
    ERC20 public tokenAsset;
    //Token stake
    ERC20 public tokenStake;
    //Total staked amount
    uint public accAmountStaked = 0;
    //Stake
    enum SStake {NULL, OPENED, CLOSED}

    struct StakeFrame {
        uint stake;
        uint amountStakeOpen;
        uint amountStakeClose;
        SStake state;
        address staker;
    }

    StakeFrame[] public stakeFrames;



    constructor (ERC20 asset, ERC20 stake) public {
        tokenAsset = asset;
        tokenStake = stake;
    }

    function openStake(){
        //Transfer stake tokens to stake contract manager
        uint amount = tokenAsset.allowance()
        stakeFrames.push(StakeFrame())
    }
}
