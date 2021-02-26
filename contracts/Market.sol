// SPDX-License-Identifier: MIT
pragma solidity ^0.5.0;
//pragma experimental ABIEncoderV2;

import '../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MarketFactory.sol";
import "../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "../node_modules/@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "../node_modules/@uniswap/lib/contracts/libraries/FixedPoint.sol";

contract Market {
    using SafeMath for uint;
    //Market factory
    MarketFactory public factory;
    //ERC20 token for down payments
    IERC20 public token;
    //Uniswap pair as an exchange market
    IUniswapV2Pair public uniswapPair;
    //Timestamp of first frame
    uint public initTimestamp;
    //Frames period in seconds
    uint public period;
    //Settlement period
    uint public settlementInterval;
    //Limit horizon to minimum in numbers of periods
    uint public minHorizon;
    //Limit horizon to maximum in numbers of periods
    uint public maxHorizon;
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
    enum SFrame {NULL, OPENED, CLOSED, INVALID}
    struct Frame {
        uint frameKey;
        SFrame state;
        uint priceAverage;
        uint accHorizon;
        uint accAmount;
        uint accRange;
        uint numWagersSettled;
        uint oraclePrice0CumulativeStart;
        uint oracleTimestampStart;
        uint oraclePrice0CumulativeEnd;
        uint oracleTimestampEnd;
    }

    //Frame event state changed
    event FrameChanged(uint frameKey);

    mapping(uint => Frame) public frames;

    uint[] public framesKeys;

    mapping(uint => uint[]) public framesWagers;

    //Wagers
    enum SWager {NULL, PLACED, SETTLED}
    struct Wager {
        uint wagerKey;
        address payable owner;
        uint amountTotal;
        uint priceMin;
        uint priceMax;
        uint frameKey;
        SWager state;
        uint timestamp;
        uint amountPlaced;
        uint amountFeeMarket;
        uint amountFeeProtocol;
        uint amountGained;
    }

    //Wager state changed
    event WagerChanged(uint index);

    mapping(uint => Wager) public wagers;
    uint[] public wagersKeys;

    constructor(MarketFactory _factory, IERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _initTimestamp, uint _settlementInterval, uint _minHorizon, uint _maxHorizon, uint _feeMarket) public {
        require(_period > _settlementInterval, "SETTLEMENT INTERVAL GREATER THAN PERIOD");
        require(_maxHorizon > _minHorizon, "MAX HORIZON MUST BE GREATER THAN MIN HORIZON");
        factory = _factory;
        token = _token;
        ownerMarket = msg.sender;
        period = _period;
        initTimestamp = _initTimestamp;
        settlementInterval = _settlementInterval;
        maxHorizon = _maxHorizon;
        minHorizon = _minHorizon;
        feeMarket = _feeMarket;
        uniswapPair = _uniswapPair;
    }

    function getOrCreateFrame(uint timestamp) public returns (uint){
        require(timestamp >= initTimestamp, "TIMESTAMP BEFORE INITIAL TIMESTAMP OF MARKET");
        //Get start timestamp of a frame
        uint frameTimestamp = clcFrameTimestamp(timestamp);
        //Check if frame exists
        if (frames[frameTimestamp].state != SFrame.NULL) return frameTimestamp;
        //Check if frame startBlock number is before current block number
        require(frameTimestamp >= block.timestamp, "CAN'T CREATE FRAME IN PAST");
        //Add frame
        frames[frameTimestamp] = Frame(frameTimestamp, SFrame.OPENED, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        framesKeys.push(frameTimestamp);
        emit FrameChanged(frameTimestamp);
        return frameTimestamp;
    }

    //Calculate start block of a frame
    function clcFrameTimestamp(uint timestamp) public view returns (uint){
        if (timestamp <= initTimestamp) return initTimestamp;
        return ((timestamp - initTimestamp) / period) * period + initTimestamp;
    }

    //Get frames count
    function getFramesCount() public view returns (uint){
        return framesKeys.length;
    }

    //Get wagers count in frame
    function getWagersCountFrame(uint frameKey) public view returns (uint){
        return framesWagers[frameKey].length;
    }

    //Get wagers count
    function getWagersCount() public view returns (uint){
        return wagersKeys.length;
    }

    //Place wager
    function placeWager(uint timestamp, uint priceMin, uint priceMax) public returns (uint){
        //Check price parameters<
        require(priceMin < priceMax, "MAXIMUM PRICE LOWER THAN MINIMUM");
        //Clc associated frame key from block number
        uint frameKey = getOrCreateFrame(timestamp);
        //Check horizon limits
        uint currentFrame = clcFrameTimestamp(block.timestamp);
        require(currentFrame.add(minHorizon.mul(period)) < frameKey, "MINIMUM HORIZON LIMIT BREACHED");
        require(currentFrame.add(maxHorizon.mul(period)) > frameKey, "MAXIMUM HORIZON LIMIT BREACHED");
        //Transfer funds
        uint amount = token.allowance(msg.sender, address(this));
        //Amount must be greater than 0
        require(amount > 0, "AMOUNT MUST BRE GREATER THAN 0");
        token.transferFrom(msg.sender, address(this), amount);
        //Calculate fee market
        uint _amountFeeMarket = amount.mul(feeMarket).div(100000);
        //Calculate fee protocol
        uint _amountFeeProtocol = amount.mul(feeProtocol).div(100000);
        //Calculate amount placed
        uint _amountPlaced = amount.sub(_amountFeeMarket).sub(_amountFeeProtocol);
        //Add fee amount to market balance
        feesMarketBalance = feesMarketBalance.add(_amountFeeMarket);
        //Add fee amount to protocol balance
        feesProtocolBalance = feesProtocolBalance.add(_amountFeeProtocol);
        //Calculate cumulative amount and subtract both fees of owner and protocol
        frames[frameKey].accAmount = frames[frameKey].accAmount.add(_amountPlaced);
        //Calculate cumulative horizon
        frames[frameKey].accHorizon = frames[frameKey].accHorizon.add(frameKey).sub(block.timestamp);
        //Calculate cumulative range
        frames[frameKey].accRange = frames[frameKey].accRange.add(scalar.div(priceMax.sub(priceMin)));
        //Place wager
        wagers[getWagersCount()] = Wager(
            getWagersCount(),
            msg.sender,
            amount,
            priceMin,
            priceMax,
            frameKey,
            SWager.PLACED,
            block.timestamp,
            _amountPlaced,
            _amountFeeMarket,
            _amountFeeProtocol,
            0);
        //Set wager key
        wagersKeys.push(getWagersCount() - 1);

        //Add wager key to frame
        framesWagers[frameKey].push(getWagersCount() - 1);

        //Update prices for frame
        updateFramePrices();

        //Emit wager event
        emit WagerChanged(getWagersCount() - 1);
        //Emit frame event
        emit FrameChanged(frameKey);
        return amount;
    }

    //Set frame prices
    function updateFramePrices() public {
        uint frameKey = clcFrameTimestamp(block.timestamp);
        //Correct price if outside settle interval
        if (block.timestamp <= ((frameKey.add(period)).sub(settlementInterval))) {
            //Prices from uniswap
            uint tmp;
            (frames[frameKey].oraclePrice0CumulativeStart, tmp, frames[frameKey].oracleTimestampStart) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
            emit FrameChanged(frameKey);
        }
        if (block.timestamp <= frameKey.add(period)) {
            //Price from uniswapPair
            uint tmp;
            (frames[frameKey].oraclePrice0CumulativeEnd, tmp, frames[frameKey].oracleTimestampEnd) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
            emit FrameChanged(frameKey);
        }
    }

    //Close frame
    function closeFrame(uint frameKey) public returns (SFrame){
        //Check if frame is opened
        require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        //Check if frame timing is correct
        require(frameKey.add(period) <= block.timestamp, "FRAME END TIME NOT REACHED");
        //Check if frame have valid prices
        if (frames[frameKey].oraclePrice0CumulativeStart <= 0 || frames[frameKey].oraclePrice0CumulativeEnd <= 0) {
            frames[frameKey].state = SFrame.INVALID;
            return frames[frameKey].state;
        }
        if (frames[frameKey].oraclePrice0CumulativeStart == frames[frameKey].oraclePrice0CumulativeEnd) {
            frames[frameKey].state = SFrame.INVALID;
            return frames[frameKey].state;
        }
        frames[frameKey].state = SFrame.CLOSED;
        //UQ112x112 encoded
        uint dP = frames[frameKey].oraclePrice0CumulativeEnd.sub(frames[frameKey].oraclePrice0CumulativeStart);
        uint dT = frames[frameKey].oracleTimestampEnd.sub(frames[frameKey].oracleTimestampStart);
        //Calculate average price UQ112x112 encoded
        frames[frameKey].priceAverage = uint(((FixedPoint.div(FixedPoint.uq112x112(uint224(dP)), (uint112(dT)))))._x);

        //Decode to scalar value
        frames[frameKey].priceAverage = (frames[frameKey].priceAverage >> 112).mul(scalar) + (frames[frameKey].priceAverage << 112).div(1e49);
        emit FrameChanged(frameKey);
        return frames[frameKey].state;
    }

    //Settle wager
    //TODO invalid frame -> return wagers
    function settleWager(uint wagerKey) public returns (uint amount){
        //Check if wager exists or was settled
        require(wagers[wagerKey].state == SWager.PLACED, "WAGER ALREADY SETTLED OR NON EXISTING");
        SFrame state = closeFrame(wagers[wagerKey].frameKey);
        require(state == SFrame.CLOSED, "FRAME NOT CLOSED");
        require(state != SFrame.INVALID, "FRAME INVALID");
        //Change state
        wagers[wagerKey].state = SWager.SETTLED;
        frames[wagers[wagerKey].frameKey].numWagersSettled++;
        emit WagerChanged(wagerKey);
        //Check wager outcome
        if (wagers[wagerKey].priceMax > frames[wagers[wagerKey].frameKey].priceAverage && wagers[wagerKey].priceMin < frames[wagers[wagerKey].frameKey].priceAverage) {
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
        uint share = scalar.mul(wager.amountPlaced).div(frame.accAmount);
        if (share > 1e24) return 1e24;
        return share;
    }

    function clcShareHorizon(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        uint share = scalar.mul(wager.frameKey.sub(wager.timestamp)).div(frame.accHorizon);
        if (share > 1e24) return 1e24;
        return share;
    }

    function clcShareRange(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        uint share = scalar.mul(scalar).div(wager.priceMax.sub(wager.priceMin)).div(frame.accRange);
        if (share > 1e24) return 1e24;
        return share;
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

    function changeWagerOwner(uint wagerKey, address owner){
        require(wagers[wagerKey].owner==msg.sender,"NOT WAGER'S OWNER");

    }
}