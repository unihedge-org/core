// SPDX-License-Identifier: MIT
pragma solidity ^0.5.0;
//pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "./MarketFactory_2.sol";

/**
    * @title Market contract
    * @author Unihedge
    * @notice Smart contract for placing wagers on a market
 */
contract Market_2 {
    using SafeMath for uint;
    //Market factory
    MarketFactory_2 public factory;
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
        uint accHorizonWin;
        uint accAmountWin;
        uint accAmount;
        uint accRangeWin;
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

    constructor(MarketFactory_2 _factory, IERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _initTimestamp, uint _settlementInterval, uint _minHorizon, uint _maxHorizon, uint _feeMarket) public {
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


    /**
        * @notice Create a new frame from a timestamp, or get an existing frame key back from the timestamp
        * @dev Timestamp has to be in milliseconds
        * @param timestamp Time of a desired frame
        * @return frame timestamp
    */
    function getOrCreateFrame(uint timestamp) public returns (uint){
        require(timestamp >= initTimestamp, "TIMESTAMP BEFORE INITIAL TIMESTAMP OF MARKET");
        //Get start timestamp of a frame
        uint frameTimestamp = clcFrameTimestamp(timestamp);
        //Check if frame exists
        if (frames[frameTimestamp].state != SFrame.NULL) return frameTimestamp;
        //Check if frame startBlock number is before current block number
        require(frameTimestamp >= block.timestamp, "CAN'T CREATE FRAME IN PAST");
        //Add frame
        frames[frameTimestamp] = Frame(frameTimestamp, SFrame.OPENED, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        framesKeys.push(frameTimestamp);
        emit FrameChanged(frameTimestamp);
        return frameTimestamp;
    }

    /**
        * @notice Calcuate frames timestamp from period and initial timestamp
        * @dev Timestamp has to be in milliseconds
        * @dev Adds a multiples of "period" to initial timestamp 
        * @param timestamp Current timestamp.
        * @return frame timestamp.
    */
    function clcFrameTimestamp(uint timestamp) public view returns (uint){
        if (timestamp <= initTimestamp) return initTimestamp;
        return ((timestamp - initTimestamp) / period) * period + initTimestamp;
    }

    /**
        * @notice Get number of frames in a given market
        * @return returns lenght of frame key array.
    */
    function getFramesCount() public view returns (uint){
        return framesKeys.length;
    }

    /**
        * @notice Get number of wagers in a given frame
        * @param frameKey Frame's key (timestamp)
        * @return returns length of wagers array
    */
    function getWagersCountFrame(uint frameKey) public view returns (uint){
        return framesWagers[frameKey].length;
    }

    /**
        * @notice Get number of wagers in a market
        * @return returns number of wagers
    */
    function getWagersCount() public view returns (uint){
        return wagersKeys.length;
    }

    /**
        * @notice Wager a price range on a given frame
        * @dev  
        * @param timestamp Time of a frame in which to place a wager
        * @param priceMin Maximum price of token pair at the time of selected frame 
        * @param priceMax Minimum price of token pair at the time of selected frame 
        * @return returns Amount that was wagered/sent to the market contract
    */
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
        require(amount > 0, "AMOUNT MUST BE GREATER THAN 0");
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

        frames[frameKey].accAmount = frames[frameKey].accAmount.add(_amountPlaced);
         /*
        //Calculate cumulative amount and subtract both fees of owner and protocol
        frames[frameKey].accAmount = frames[frameKey].accAmount.add(_amountPlaced);
        //Calculate cumulative horizon
        frames[frameKey].accHorizon = frames[frameKey].accHorizon.add(frameKey).sub(block.timestamp);
        //Calculate cumulative range
        frames[frameKey].accRange = frames[frameKey].accRange.add(scalar.div(priceMax.sub(priceMin))); */
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
        //updateFramePrices();

        //Emit wager event
        emit WagerChanged(getWagersCount() - 1);
        //Emit frame event
        emit FrameChanged(frameKey);
        return amount;
    }

    /**
        * @notice Update pair's prices from uniswap's oracle
        * @dev This functions has to be called before and during settlement period 
    */
    function updateFramePrices(uint PriceCumulative) public {
        uint frameKey = clcFrameTimestamp(block.timestamp);
        //Correct price if outside settle interval
        if (block.timestamp <= ((frameKey.add(period)).sub(settlementInterval))) {
            frames[frameKey].oraclePrice0CumulativeStart = PriceCumulative;
            frames[frameKey].oracleTimestampStart = block.timestamp;
            emit FrameChanged(frameKey);
        }
        else if (block.timestamp <= frameKey.add(period)) {
            frames[frameKey].oraclePrice0CumulativeEnd = PriceCumulative;
            frames[frameKey].oracleTimestampEnd = block.timestamp;
            emit FrameChanged(frameKey);
        }
    }

    /**
        * @notice Close frame and calculate its average price
        * @dev 
        * @param frameKey Key (timestamp) of the frame you wish to close
        * @return returns frames state (shuld be closed)
    */
    function closeFrame(uint frameKey) public returns (SFrame){
        //Check if frame is opened
        require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        //Check if frame timing is correct
        require(frameKey.add(period) <= block.timestamp, "FRAME END TIME NOT REACHED");
        //Check if frame has valid prices
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
        uint priceDiff = frames[frameKey].oraclePrice0CumulativeEnd.sub(frames[frameKey].oraclePrice0CumulativeStart);
        uint timeDiff = frames[frameKey].oracleTimestampEnd.sub(frames[frameKey].oracleTimestampStart);
        //Calculate time-weighted average price -- UQ112x112 encoded
        frames[frameKey].priceAverage = uint(((FixedPoint.div(FixedPoint.uq112x112(uint224(priceDiff)), (uint112(timeDiff)))))._x);

        //Decode to scalar value
        frames[frameKey].priceAverage = (frames[frameKey].priceAverage >> 112).mul(scalar); 
        frames[frameKey].priceAverage = (frames[frameKey].priceAverage << 112).div(1e49);

        uint wagerCount = getWagersCount();

        for (uint i=0; i<wagerCount; i++) {
            if (wagers[i].priceMax > frames[frameKey].priceAverage && wagers[i].priceMin < frames[frameKey].priceAverage) {
                frames[frameKey].accAmountWin = frames[frameKey].accAmountWin.add(wagers[i].amountPlaced);
                frames[frameKey].accHorizonWin = frames[frameKey].accHorizonWin.add(frameKey).sub(wagers[i].timestamp);
                frames[frameKey].accRangeWin = frames[frameKey].accRangeWin.add(scalar.div((wagers[i].priceMax).sub(wagers[i].priceMin)));
            }
        }

        emit FrameChanged(frameKey);
        return frames[frameKey].state;
    }

    
    /**
        * @notice Resolve and settle wager
        * @param wagerKey Wager's key (number).
        * @return amount Returs amount that was won by participant.
    */
    function settleWager(uint wagerKey) public returns (uint amount){
        //Check if wager exists or was settled
        SFrame state;
        require(wagers[wagerKey].state == SWager.PLACED, "WAGER ALREADY SETTLED OR NON EXISTING");
        if (frames[wagers[wagerKey].frameKey].state == SFrame.OPENED) {
            state = closeFrame(wagers[wagerKey].frameKey);
        }
        else {
            state = frames[wagers[wagerKey].frameKey].state;
        }
        require(state != SFrame.INVALID, "FRAME INVALID"); 
        require(state == SFrame.CLOSED, "FRAME NOT CLOSED");
        
        //Change state
        wagers[wagerKey].state = SWager.SETTLED;
        frames[wagers[wagerKey].frameKey].numWagersSettled++;
        emit WagerChanged(wagerKey);

        if (frames[wagers[wagerKey].frameKey].accAmountWin == 0) {
            token.transfer(wagers[wagerKey].owner, wagers[wagerKey].amountPlaced);
        }

        //Check wager outcome
        if (wagers[wagerKey].priceMax > frames[wagers[wagerKey].frameKey].priceAverage && wagers[wagerKey].priceMin < frames[wagers[wagerKey].frameKey].priceAverage) {
            //Calculate settle amount
            amount = clcSettleAmount(wagerKey);
            //Transfer value
            token.transfer(wagers[wagerKey].owner, amount);
            return amount;
        } else return 0;
    }

    /**
        * @notice Calculate wager's share from accumulated amount
        * @param wagerKey Wager's key (number)
        * @return returns wager's share
    */
    function clcShareAmount(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        uint share = scalar.mul(wager.amountPlaced).div(frame.accAmountWin);
        if (share > 1e24) return 1e24;
        return share;
    }

    /**
        * @notice Calculate wager's share from accumulated timestamps (horizon)
        * @param wagerKey Wager's key (number)
        * @return returns wager's share
    */
    function clcShareHorizon(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        uint share = scalar.mul(wager.frameKey.sub(wager.timestamp)).div(frame.accHorizonWin);
        if (share > 1e24) return 1e24;
        return share;
    }

    /**
        * @notice Calculate wager's share from accumulated range
        * @param wagerKey Wager's key (number)
        * @return returns wager's share
    */
    function clcShareRange(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        uint share = scalar.mul(scalar).div(wager.priceMax.sub(wager.priceMin)).div(frame.accRangeWin);
        if (share > 1e24) return 1e24;
        return share;
    }

    /**
        * @notice Calculate wager's share 
        * @param wagerKey Wager's key (number)
        * @return returns complete share.
    */
    function clcShare(uint wagerKey) public view returns (uint){
        return clcShareAmount(wagerKey).add(clcShareHorizon(wagerKey)).add(clcShareRange(wagerKey)).div(3);
    }

    /**
        * @notice Calculate wager's true share amount
        * @param wagerKey Wager's key (number)
        * @return returns winning amount.
    */
    function clcSettleAmount(uint wagerKey) public view returns (uint){
        Wager memory wager = wagers[wagerKey];
        Frame memory frame = frames[wager.frameKey];
        return clcShare(wagerKey).mul(frame.accAmount).div(scalar);
    }

    /**
        * @notice Withdraw market's fees to owner's address
    */
    function withdrawFeesMarket() public {
        token.transfer(ownerMarket, feesMarketBalance);
        feesMarketBalance = 0;
    }

    /**
        * @notice Withdraw market's fees to factory's owner
    */
    function withdrawFeesProtocol() public {
        uint amount = token.balanceOf(address(this));
        if (amount > feesProtocolBalance) amount = feesProtocolBalance;
        token.transfer(factory.owner(), amount);
        feesProtocolBalance = 0;
    }

    //TODO: implement this function
/*    function changeWagerOwner(uint wagerKey, address owner){
        require(wagers[wagerKey].owner==msg.sender,"NOT WAGER'S OWNER");

    }*/
}