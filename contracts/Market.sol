// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;
//pragma experimental ABIEncoderV2;

import "../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./MarketFactory.sol";
import "../node_modules/@openzeppelin/contracts/math/SafeMath.sol";

contract Market {
    using SafeMath for uint;
    //Market factory
    MarketFactory public factory;
    //ERC20 token for down payments
    ERC20 public token;
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
    //Owner of the market
    address public ownerMarket;
    //Fees accumulator
    uint public feesMarketBalance = 0;
    uint public feesProtocolBalance = 0;
    //Fixed point scalar
    uint scalar = 1e24;

    //Frames
    enum SFrame {NULL, OPENED, CLOSED, SETTLED}
    struct Frame {
        SFrame state;
        uint settlePrice;
        uint accHorizon;
        uint accAmount;
        uint accRange;
        uint numWagersSettled;
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
        uint amountGained;

    }

    mapping(uint => Wager) public wagers;
    uint[] public wagersKeys;

    constructor(MarketFactory _factory, ERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _settleInterval, uint _blockStart, uint _feeMarket) public {
        require(_settleInterval > 0, 'SETTLE INTERVAL LESS THAN 0');
        require(_settleInterval <= _period, 'SETTLE INTERVAL GREATER THAN PERIOD');
        factory = _factory;
        token = _token;
        ownerMarket = msg.sender;
        period = _period;
        settleInterval = _settleInterval;
        initBlock = _blockStart;
        feeMarket = _feeMarket;
        uniswapPair = _uniswapPair;
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
        frames[blockStartFrame] = Frame(SFrame.OPENED, 1, 0, 0, 0, 0);
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

    //Place wager
    function placeWager(uint frameKey, uint priceMin, uint priceMax) public returns (uint){
        //Check if frame is opened
        require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        //Check if block number is before start frame block
        require(frameKey >= block.number, "WAGER TO LATE");
        //Check price range
        require(priceMin < priceMax, "MAXIMUM PRICE LOWER THAN MINIMUM");
        //Transfer funds
        uint amount = token.allowance(msg.sender, address(this));
        if (!token.transferFrom(msg.sender, address(this), amount)) revert("TRANSFER OF TOKENS FAILED");
        //Calculate fee market
        uint _amountFeeMarket = amount.mul(feeMarket).div(100000);
        //Calculate fee protocol
        uint _amountFeeProtocol = amount.mul(feeMarket).div(100000);
        //Calculate amount placed
        uint _amountPlaced = amount.sub(_amountFeeMarket).sub(_amountFeeProtocol);
        //Add fee amount to market balance
        feesMarketBalance = feesMarketBalance.add(_amountFeeMarket);
        //Add fee amount to protocol balance
        feesProtocolBalance = feesProtocolBalance.add(_amountFeeProtocol);
        //Calculate cumulative amount and subtract both fees of owner and protocol
        frames[frameKey].accAmount = frames[frameKey].accAmount.add(_amountPlaced);
        //Calculate cumulative horizon
        frames[frameKey].accHorizon = frames[frameKey].accHorizon.add(frameKey).sub(block.number);
        //Calculate cumulative range
        frames[frameKey].accRange = frames[frameKey].accRange.add(scalar.div(priceMax.sub(priceMin)));
        //Place wager
        wagers[getWagersCount()] = Wager(
            msg.sender,
            amount,
            priceMin,
            priceMax,
            frameKey,
            SWager.PLACED,
            block.number,
            _amountPlaced,
            _amountFeeMarket,
            _amountFeeProtocol,
            0);
        //Set wager key
        wagersKeys.push(getWagersCount());
        return amount;
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
        //Check if wager exists or was settled
        require(wagers[wagerKey].state == SWager.PLACED, "WAGER ALREADY SETTLED OR NOT EXISTS");
        //        //Check owner of wager
        //        require(wager.owner == msg.sender, "WAGER IS NOT OWNED BY THE CALLER");
        //Check if frame is closed
        require(frames[wagers[wagerKey].frameKey].state == SFrame.CLOSED, "FRAME NOT CLOSED");
        //Change state
        wagers[wagerKey].state = SWager.SETTLED;
        frames[wagers[wagerKey].frameKey].numWagersSettled++;
        //Check wager outcome
        if (wagers[wagerKey].priceMax > frames[wagers[wagerKey].frameKey].settlePrice && wagers[wagerKey].priceMin < frames[wagers[wagerKey].frameKey].settlePrice) {
            //Calculate settle amount
            amount = clcSettleAmount(wagerKey);
            //Transfer value
            token.transfer(wagers[wagerKey].owner, amount);
            return amount;
        } else return 0;
    }

    function clcShareAmount(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return scalar.mul(wager.amountPlaced).div(frame.accAmount);
    }

    function clcShareHorizon(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return scalar.mul(wager.frameKey.sub(wager.block)).div(frame.accHorizon);
    }

    function clcShareRange(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return scalar.mul(scalar).div(wager.priceMax.sub(wager.priceMin)).div(frame.accRange);
    }

    function clcShare(uint wagerKey) public view returns (uint){
        return clcShareAmount(wagerKey).add(clcShareHorizon(wagerKey)).add(clcShareRange(wagerKey)).div(3);
    }

    function clcSettleAmount(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return clcShare(wagerKey).mul(frame.accAmount).div(scalar);
    }

    function withdrawFeesMarket() public {
        token.transfer(ownerMarket, feesMarketBalance);
        feesMarketBalance = 0;
    }

    function withdrawFeesProtocol() public {
        uint amount = token.balanceOf(address(this));
        if (amount > feesProtocolBalance) amount = feesProtocolBalance;
        token.transfer(factory.owner(), amount);
        feesProtocolBalance = 0;
    }
}