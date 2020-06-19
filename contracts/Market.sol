// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;
pragma experimental ABIEncoderV2;

import "../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Market {
    //Settlement token for wagers
    ERC20 sToken;
    //Uniswap pair as an exchange market
    IUniswapV2Pair public uniswapPair;
    //Frame start block
    uint public initBlock;
    //Frames period in number of blocks
    uint public period;
    //Frame settlement interval in number of blocks
    uint public settleInterval;
    //Frames
    enum SFrame {OPENED, CLOSED, SETTLED}
    struct Frame {
        SFrame state;
        uint settlePrice;
    }

    mapping(uint => Frame) public frames;
    uint[] public framesKeys;

    //Wagers
    enum SWager {PENDING_APPROVAL, PLACED}
    struct Wager {
        address owner;
        uint amount;
        uint priceMin;
        uint priceMax;
        uint frameKey;
        SWager state;
    }

    mapping(uint => Wager) public wagers;
    uint[] public wagerKeys;

    constructor(address _sToken, address _uniswapPair, uint _period, uint _settleInterval, uint _blockStart) public {
        require(_sToken != address(0), 'SETTLEMENT TOKEN 0x0');
        require(_settleInterval > 0, 'SETTLE INTERVAL LESS THAN 0');
        require(_settleInterval <= _period, 'SETTLE INTERVAL GREATER THAN PERIOD');
        period = _period;
        settleInterval = _settleInterval;
        initBlock = _blockStart;
        uniswapPair = IUniswapV2Pair(_uniswapPair);
    }

    function newFrame(uint blockNumber) public returns (uint){
        //Get start block of a frame
        uint blockStartFrame = clcFrameBlockStart(blockNumber);
        //Check if frame startBlock number is before initial frame
        require(blockStartFrame > initBlock, "FRAME TO EARLY");
        //Check if frame exists
        require(frames[blockStartFrame].settlePrice != 1, "FRAME ALREADY EXISTS");
        //Add frame
        frames[blockStartFrame] = Frame(SFrame.OPENED, 1);
        framesKeys.push(blockStartFrame);
        return blockStartFrame;
    }

    //Calculate start block of a frame
    function clcFrameBlockStart(uint blockNumber) public view returns (uint){
        return ((blockNumber - initBlock) / period) * period + initBlock;
    }

    //Get frames count
    function getFramesCount() public view returns (uint){
        return framesKeys.length;
    }

    //Get wagers count
    function getWagersCount() public view returns (uint){
        return wagerKeys.length;
    }

    //Allow funds to be spend for wager placement
    function approveWager(uint frameKey,uint amount, uint priceMin, uint priceMax) public returns (uint){
        //Check if frame is opened
        require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        //Create wager
        wagers[getWagersCount()] = Wager(msg.sender, amount, priceMin, priceMax, frameKey, SWager.PENDING_APPROVAL);
        //Process approval
        sToken.approve(address(this), amount);
        return getWagersCount();
    }

    //Place wager
    function placeWager(uint wagerKey) public {
        //Check wager state
        require(wagers[wagerKey].state==SWager.PENDING_APPROVAL,"WAGER NOT PENDING");
        //Transfer tokens
        //sToken.transferFrom


    }
}