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
        SFrame state;
        uint settlePrice;
        uint accHorizon;
        uint accAmount;
        uint accRange;
        uint numWagersSettled;
        uint priceCumulative;
        uint priceCumulativeBlockNumber;
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

    constructor(MarketFactory _factory, ERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _blockStart, uint _feeMarket) public {
        factory = _factory;
        token = _token;
        ownerMarket = msg.sender;
        period = _period;
        initBlock = _blockStart;
        feeMarket = _feeMarket;
        uniswapPair = _uniswapPair;
    }

    function getOrCreateFrame(uint blockNumber) public returns (uint){
        //Get start block of a frame
        uint blockStartFrame = clcFrameBlockStart(blockNumber);
        //Check if frame exists
        if (frames[blockStartFrame].state != SFrame.NULL) return blockStartFrame;
        //Check if frame startBlock number is before initial frame
        if (blockStartFrame <= initBlock) return 0;
        //Check if frame startBlock number is before current block number
        if (blockStartFrame <= block.number) return 0;
        //Add frame
        frames[blockStartFrame] = Frame(SFrame.OPENED, 1, 0, 0, 0, 0, 0, 0);
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
    function placeWager(uint blockNumber, uint priceMin, uint priceMax) public returns (uint){
        //Clc associated frame key from block number
        uint frameKey = getOrCreateFrame(blockNumber);
        require(frameKey != 0, "CAN'T PLACE WAGER BLOCK NUMBER ERROR");
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
        //Set price for frame
        setFramePrice(frameKey);
        return amount;
    }

    //Set frame price
    function setFramePrice(uint frameKey) public {
        //Correct price if better timing
        if (block.number > frames[frameKey].priceCumulativeBlockNumber && block.number <= frameKey) {
            frames[frameKey].priceCumulativeBlockNumber = block.number;
            //Price from uniswapPair
            //            frames[frameKey].price = uniswapPair.price0CumulativeLast();
            frames[frameKey].priceCumulative = 100;
            frames[frameKey].priceCumulativeBlockNumber = block.number;
        }
    }

    //Close frame
    function closeFrame(uint frameKey) public returns (SFrame){
        //Check if frame is opened
        if (frames[frameKey].state == SFrame.OPENED) {
            //Check if frame timing is correct
            if (frameKey + this.period() <= block.number) {
                //Check if frame have valid prices
                if (frames[frameKey].priceCumulative >= 0 && frames[frameKey + period].priceCumulative >= 0) {
                    frames[frameKey].state = SFrame.CLOSED;
                    frames[frameKey].settlePrice = frames[frameKey + period].priceCumulative.sub(frames[frameKey].priceCumulative)
                    .div(frames[frameKey + period].priceCumulativeBlockNumber.sub(frames[frameKey].priceCumulativeBlockNumber));
                } else {
                    frames[frameKey].state = SFrame.INVALID;
                }
            }
        }
        return frames[frameKey].state;
    }

    //Settle wager
    function settleWager(uint wagerKey) public returns (uint amount){
        //Check if wager exists or was settled
        require(wagers[wagerKey].state == SWager.PLACED, "WAGER ALREADY SETTLED OR NOT EXISTS");
        SFrame state = closeFrame(wagers[wagerKey].frameKey);
        require(state == SFrame.CLOSED, "FRAME NOT CLOSED");
        require(state != SFrame.INVALID, "FRAME INVALID");
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