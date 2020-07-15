// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;
//pragma experimental ABIEncoderV2;

import "../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Market {
    //Uniswap pair as an exchange market
    IUniswapV2Pair public uniswapPair;
    //Frame start block
    uint public initBlock;
    //Frames period in number of blocks
    uint public period;
    //Frame settlement interval in number of blocks
    uint public settleInterval;
    //Fee in %/1000
    uint public feeMarket;
    //Fee in %/1000
    uint public feeProtocol = 100;
    //Owner
    address public owner;
    //Fees accumulator
    uint public feesMarketBalance = 0;
    uint public feesProtocolBalance = 0;
    //Fixed point scalar
    uint scalar = 1000000000000000000;

    //Frames
    enum SFrame {NULL, OPENED, CLOSED, SETTLED}
    struct Frame {
        SFrame state;
        uint settlePrice;
        uint accHorizon;
        uint accAmount;
        uint accRange;
    }

    mapping(uint => Frame) public frames;
    uint[] public framesKeys;

    //Wagers
    enum SWager {NULL, PLACED, SETTLED}
    struct Wager {
        address payable owner;
        uint amountTotal;
        uint priceMin;
        uint priceMax;
        uint frameKey;
        SWager state;
        uint block;
        uint amountPlaced;
        uint amountFeeMarket;
        uint amountFeeProtocol;

    }

    mapping(uint => Wager) public wagers;
    uint[] public wagersKeys;

    constructor(address _uniswapPair, uint _period, uint _settleInterval, uint _blockStart, uint _feeMarket) public {
        require(_settleInterval > 0, 'SETTLE INTERVAL LESS THAN 0');
        require(_settleInterval <= _period, 'SETTLE INTERVAL GREATER THAN PERIOD');
        owner = msg.sender;
        period = _period;
        settleInterval = _settleInterval;
        initBlock = _blockStart;
        feeMarket = _feeMarket;
        uniswapPair = IUniswapV2Pair(_uniswapPair);
    }

    function newFrame(uint blockNumber) public returns (uint){
        //Get start block of a frame
        uint blockStartFrame = clcFrameBlockStart(blockNumber);
        //Check if frame startBlock number is before initial frame
        require(blockStartFrame >= initBlock, "FRAME TO EARLY MARKET NOT OPENED");
        //Check if frame startBlock number is before current block number
        require(blockStartFrame > block.number, "FRAME TO EARLY");
        //Check if frame exists
        require(frames[blockStartFrame].settlePrice != 1, "FRAME ALREADY EXISTS");
        //Add frame
        frames[blockStartFrame] = Frame(SFrame.OPENED, 1, 0, 0, 0);
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
        return wagersKeys.length;
    }

    //Allow funds to be spend for wager placement
    function placeWager(uint frameKey, uint priceMin, uint priceMax) public payable returns (uint){
        //Check if frame is opened
        require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        //Check price range
        require(priceMin < priceMax, "MAXIMUM PRICE LOWER THAN MINIMUM");
        //Calculate fee market
        uint _amountFeeMarket = msg.value * feeMarket / 100000;
        //Calculate fee protocol
        uint _amountFeeProtocol = msg.value * feeProtocol / 100000;
        //Calculate amount placed
        uint _amountPlaced = msg.value - _amountFeeMarket - _amountFeeProtocol;
        //Add fee amount to market balance
        feesMarketBalance += _amountFeeMarket;
        //Add fee amount to protocol balance
        feesProtocolBalance += _amountFeeProtocol;
        //Calculate cumulative amount and subtract both fees of owner and protocol
        frames[frameKey].accAmount += _amountPlaced;
        //Calculate cumulative horizon
        frames[frameKey].accHorizon += frameKey - block.number;
        //Calculate cumulative range
        frames[frameKey].accRange += scalar / (priceMax - priceMin);
        //Place wager
        wagers[getWagersCount()] = Wager(
            msg.sender,
            msg.value,
            priceMin,
            priceMax,
            frameKey,
            SWager.PLACED,
            block.number,
            _amountPlaced,
            _amountFeeMarket,
            _amountFeeProtocol);
        //Set wager key
        wagersKeys.push(getWagersCount());
        //Return wager key
        return getWagersCount();
    }

    //Close frame
    function closeFrame(uint frameKey) public {
        //Check if frame is opened
        require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        //Check if frame timing is correct
        require(frameKey + this.period() < block.number, "FRAME NOT ENDED");
        //Set settling price
        frames[frameKey].settlePrice = 100;
        //Close frame
        frames[frameKey].state = SFrame.CLOSED;
    }

    //Settle wager
    function settleWager(uint wagerKey) public returns (uint amount){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];

        //Check if wager exists or was settled
        require(wager.state == SWager.PLACED, "WAGER ALREADY SETTLED OR NOT EXISTS");
        //Check owner of wager
        require(wager.owner == msg.sender, "WAGER IS NOT OWNED BY THE CALLER");
        //Check if frame is closed
        require(frame.state == SFrame.CLOSED, "FRAME NOT CLOSED");
        //Change state
        wager.state = SWager.SETTLED;
        //Check wager outcome
        if (wager.priceMax > frame.settlePrice && wager.priceMin < frame.settlePrice) {
            //Calculate settle amount
            amount = clcSettleAmount(wagerKey);
            //Transfer value
            wager.owner.transfer(amount);
            return amount;
        } else return 0;
    }

    function clcShareAmount(uint wagerKey) public view returns(uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return scalar * wager.amountPlaced / frame.accAmount;
    }

    function clcShareHorizon(uint wagerKey) public view returns(uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return scalar * (wager.frameKey -wager.block) / frame.accHorizon;
    }

    function clcShareRange(uint wagerKey) public view returns(uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return scalar * scalar / (wager.priceMax - wager.priceMin) / frame.accRange ;
    }

    function clcShare(uint wagerKey) public view returns(uint){
        return (clcShareAmount(wagerKey) + clcShareHorizon(wagerKey) + clcShareRange(wagerKey)) / 3;
    }

    function clcSettleAmount(uint wagerKey) public view returns(uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return clcShare(wagerKey)*frame.accAmount/scalar;
    }
}