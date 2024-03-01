// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
//pragma experimental ABIEncoderV2;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '@uniswap/v3-core/contracts/libraries/TickMath.sol';

/// @author UniHedge
/// @dev All function calls are currently implemented without side effects
contract Market {
    //Length of a frame in seconds (1 day)
    uint public period = 86400; //64b
    //Market begin timestamp 1.1.2024
    uint public initTimestamp = 1704124800; //64b
    //Protocol fee 0.05% per period writen with 18 decimals
    uint public feeProtocol = 50000000000000000; //256b
    //Settle interval for average price calculation in seconds (10 minutes)
    uint public tReporting = 600;
    //Uniswap pool
    IUniswapV3Pool public uniswapPool = IUniswapV3Pool(0x67a9FE12fa6082D9D0203c84C6c56D3c4B269F28);
    //Range of a lot in the format of tokens decimals 100 and 18 decimals
    uint public dPrice = 1e20;
    //Tax on lots in the market 0.5% per period write with 18 decimals
    uint public taxMarket = 500000000000000000; //256b
    //ERC20 token used for buying lots in this contract
    IERC20 public accountingToken = IERC20(0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063); //256b
    //Owner of this market
    address public owner; //256b

    /*
    *   Frame enum

    *   NULL - Frame is not created
    *   OPENED - Frame is opened and ready for trading
    *   CLOSED - Frame is closed and ready for rate calculation
    *   RATED - Frame close rate was set
    *   SETTLED - Frame reward was claimed
    */
    enum SFrame {NULL, OPENED, CLOSED, RATED, SETTLED}

    struct Frame {
        uint frameKey;
        uint rate;
        uint[] lotKeys;
        //Reward claimed by user
        address rewardClaimedBy;
    }

    //Frames
    mapping(uint => Frame) public frames;
    uint[] public framesKeys;

    event FrameUpdate(Frame frame);

    /* Lot enum
    *   NULL - Lot is not created
    *   TAKEN - Lot is taken
    *   WON - Lot has won
    *   LOST - Lot has lost
    */

    enum SLot {NULL, TAKEN, WON, LOST}

    //TODO: dont forget to add referral logic

    struct LotState {
        uint timestamp;
        address owner;
        uint acquisitionPrice;
        uint feeCharged;
        uint taxCharged;
        uint taxRefunded;
    }

    struct Lot {
        uint frameKey;
        uint lotKey;
        LotState[] states;
    }

    //Lots
    //2 level mapping to store lots. 1 level mapping is frameKey, 2 level mapping is lotKey
    mapping(uint => mapping(uint => Lot)) public lots;

    event LotUpdate(Lot lot);

    constructor() {
        owner = msg.sender;
    }

    function getStateFrame(Frame memory frame) public view returns (SFrame){
        //NULL If frame doesn't exist, return SFrame.NULL
        if (frame.frameKey == 0) return SFrame.NULL;
        //CLAIMED If reward is claimed, return SFrame.CLAIMED
        if (frame.rewardClaimedBy != address(0)) return SFrame.SETTLED;
        //OPENED If frameKey+period is in the future, return SFrame.OPENED
        if (block.timestamp < frame.frameKey + period) return SFrame.OPENED;
        //RATED if average price is set, return SFrame.RATED
        if (frame.rate > 0) return SFrame.RATED;
        //CLOSED if no other condition is met, return SFrame.CLOSED
        return SFrame.CLOSED;
    }


    function getStateLot(Lot memory lot) public view returns (SLot){
        //NULL If lot doesn't exist, return SLot.NULL
        if (lot.lotKey == 0) return SLot.NULL;
        //If frame state is null, return SLot.NULL
        if (getStateFrame(frames[lot.frameKey]) == SFrame.NULL) return SLot.NULL;
        //If frame state is OPENED or CLOSED, return SLot.TAKEN
        if (getStateFrame(frames[lot.frameKey]) == SFrame.OPENED || getStateFrame(frames[lot.frameKey]) == SFrame.CLOSED) return SLot.TAKEN;
        //Frame state is RATED decide if lot state is WON or LOST
        //WON if frame average price is in interval of lot key and lotKey+dPrice
        if (frames[lot.frameKey].rate >= lot.lotKey && frames[lot.frameKey].rate < lot.lotKey + dPrice) return SLot.WON;
        //LOST if no other condition is met,
        return SLot.LOST;
    }

    function clcFrameKey(uint timestamp) public view returns (uint){
        if (timestamp <= initTimestamp) return initTimestamp;
        return timestamp - ((timestamp - initTimestamp) % (period));
    }

    function clcLotKey(uint value) public view returns (uint){
        if (value < dPrice) return dPrice;
        //Division cast to uint rounds down
        return value / (dPrice) * (dPrice);
    }

    function getFrame(uint frameKey) public view returns (Frame memory){
        //Reject if frame doesn't exist
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        return (frames[frameKey]);
    }

    function getLot(uint frameKey, uint lotKey) public view returns (Lot memory){
        //Reject if lot doesn't exist
        require(lots[frameKey][lotKey].lotKey != 0, "Lot doesn't exist");
        return lots[frameKey][lotKey];
    }

    function createFrame(uint timestamp) internal returns (Frame memory){
        //Get frame's timestamp - frame key
        uint frameKey = clcFrameKey(timestamp);
        //Reject if frame already exists
        require(frames[frameKey].frameKey == 0, "Frame already exists");
        //Create frame
        //Check if frame is in the future for at leas 1 period
        require(frameKey >= block.timestamp + period, "Can't create frame in the past");
        //Add frame
        frames[frameKey].frameKey = frameKey;
        framesKeys.push(frameKey);
        return frames[frameKey];
    }

    function createLot(Frame memory frame, uint rate, address _owner, uint acquisitionPrice, uint feeCharged, uint taxCharged) internal returns (Lot memory){
        //Reject if lot already exists
        uint lotKey = clcLotKey(rate);
        require(lots[frame.frameKey][lotKey].lotKey == 0, "Lot already exists");
        //Reject if acquisitionPrice less than 0
        require(acquisitionPrice > 0, "Acquisition price has to be greater than 0");
        //Reject if taxCharged less than 0
        require(taxCharged > 0, "Tax charged has to be greater than 0");
        //Create lot
        LotState memory state = LotState(block.timestamp, _owner, acquisitionPrice, feeCharged, taxCharged, 0);
        LotState[] memory states = new LotState[](1);
        states[0] = state;
        Lot memory lot = Lot(frame.frameKey, lotKey, states);

        //Add lot to frame
        frames[frame.frameKey].lotKeys.push(lot.lotKey);

        return lot;
    }

    function updateLot(Lot memory lot, address _owner, uint acquisitionPrice, uint feeCharged, uint taxCharged, uint taxRefunded) internal returns (Lot memory){
        //Reject if lot doesn't exist
        require(lot.lotKey != 0, "Lot doesn't exist");
        //Reject if acquisitionPrice less than 0
        require(acquisitionPrice > 0, "Acquisition price has to be greater than 0");
        //Update lot
        LotState memory state = LotState(block.timestamp, _owner, acquisitionPrice, feeCharged, taxCharged, taxRefunded);
        lots[lot.frameKey][lot.lotKey].states.push(state);
        return lot;
    }

    function getLotsKeysInFrame(uint frameKey) public view returns (uint[] memory){
        return frames[frameKey].lotKeys;
    }

    function overrideFrameRate(Frame memory frame, uint avgPrice) external {
        //Only owner can update frame close price
        require(msg.sender == owner, "Only owner can update frame close price");
        //Frame must exists
        require(frame.frameKey != 0, "Frame doesn't exist");
        //Frame must not be in CLAIMED state
        require(frame.rewardClaimedBy == address(0), "Frame reward was already claimed");
        frames[frame.frameKey].rate = avgPrice;
    }

    //Calculate amount of tax to be collected from the owner of the lot
    function clcTax(uint frameKey, uint acquisitionPrice) public view returns (uint tax) {
        uint taxPerSecond = taxMarket * acquisitionPrice / period;
        return ((frameKey + period) - block.timestamp) * taxPerSecond;
    }

    //Calculate protocol fee to be collected from the owner of the lot
    function clcFee(uint frameKey, uint acquisitionPrice) public view returns (uint fee) {
        uint feePerSecond = feeProtocol * acquisitionPrice / period;
        return ((frameKey + period) - block.timestamp) * feePerSecond;
    }

    //Calculate reward fund for the frame from lots
    function clcRewardFund(Frame memory frame) public view returns (uint) {
        uint rewardFund = 0;
        for (uint i = 0; i < frame.lotKeys.length; i++) {
            Lot memory lot = lots[frame.frameKey][frame.lotKeys[i]];
            for (uint j = 0; j < lot.states.length; j++) {
                //Add tax charged to the reward fund
                rewardFund += lot.states[j].taxCharged;
                //Subtract tax refunded from the reward fund
                rewardFund -= lot.states[j].taxRefunded;
            }
        }
        return rewardFund;
    }


    function purchaseLot(uint timestamp, uint rate, uint acquisitionPrice) external returns (Lot memory){
        //Calculate frame key
        uint frameKey = clcFrameKey(timestamp);
        //Get frame
        Frame memory frame = getFrame(frameKey);
        //If new lot is purchased
        if (frame.frameKey == 0) {
            frame = createFrame(timestamp);
            Lot memory lot = purchaseLotFresh(frame, rate, acquisitionPrice);
            emit LotUpdate(lot);
            return lot;
        }
        //If lot is updated no owner change
        if (frame.frameKey != 0) {
           
        }
        //If lot is updated with owner change
        if (frame.frameKey != 0) {
            
        }
        
        return null;
    }

    function purchaseLotFresh(Frame memory frame, uint lotKey, uint acquisitionPrice) internal returns (Lot memory){
        //Calculate tax amount
        uint tax = clcTax(frame.frameKey, acquisitionPrice);
        //Tax has to be greater than 0
        require(tax > 0, "Tax has to be greater than 0. Increase the acquisition price");
        //Calculate fee amount
        uint fee = clcFee(frame.frameKey, acquisitionPrice);
        //Fee has to be greater than 0
        require(fee > 0, "Fee has to be greater than 0. Increase the acquisition price");
        //Approved amount has to be at least equal to price of the
        require(accountingToken.allowance(msg.sender, address(this)) >= tax + fee, "Allowance to spend set too low");
        //Transfer tax amount to the market contract
        accountingToken.transferFrom(msg.sender, address(this), tax + fee);
        //Create new lot
        return createLot(frame, lotKey, msg.sender, acquisitionPrice, fee, tax);
    }

    function purchaseLotUpdatePrice(Lot memory lot, uint acquisitionPrice) internal {
        
    }
    
    function purchaseLotOwnerChange(Lot memory lot, address _owner, uint acquisitionPrice) internal {
        
    }

    function setFrameRate(uint frameKey) public {
        //Frame has to be in state CLOSE
        uint rate = clcFrameRate(frameKey);
        //Frame must exist
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        //Update frame
        frames[frameKey].rate = rate;
        emit FrameUpdate(frames[frameKey]);
    }

    function clcFrameRate(uint frameKey) public view returns (uint) {
        //Frame has to be in the past
        require(frameKey + period <= block.timestamp, "Frame has to be in the past");
        uint32 t1 = block.timestamp - frameKey - tReporting;
        uint32 t2 = block.timestamp - frameKey;

        // Assuming observe returns cumulative price values directly
        (int56[] memory tickCumulatives,) = uniswapPool.observe([t1, t2]);

        // Calculate the tick difference and time elapsed
        int56 tickCumulativeDelta = tickCumulatives[1] - tickCumulatives[0];
        uint32 timeElapsed = t2 - t1; // Ensure this calculation makes sense in your context

        // Calculate the average tick
        int24 averageTick = int24(tickCumulativeDelta / int56(timeElapsed));

        // Calculate the average price
        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(averageTick);

        // Convert to 18 decimal precision
        uint priceAverage = uint(sqrtPriceX96).mul(uint(sqrtPriceX96)).mul(1e18) >> (96 * 2);

        return priceAverage;
    }

    function settleFrame(Frame memory frame) private {
        //Reject of frame don't exist
        require(frame.frameKey != 0, "Frame doesn't exist");
        //Reject if frame is not in state RATED
        require(getStateFrame(frame) == SFrame.RATED, "Frame does not have a close rate set");
        //Calculate the winning lot key based on the frame's close rate
        uint lotKeyWon = clcLotKey(frame.rate);
        Lot memory lotWon = lots[frame.frameKey][lotKeyWon];
        //Reject if lot is in state LOST
        require(getStateLot(lotWon) == SLot.WON, "No winning lot in this frame");

        //Transfer winnings to last owner
        accountingToken.transfer(lotWon.lotOwner, clcRewardFund(frame));
        frame.rewardClaimedBy = lotWon.owner;

        emit LotUpdate(lotWon);
        emit FrameUpdate(frame);
    }

    function clcUnClaimableFunds() public view returns (uint){
        uint unClaimableFunds = 0;
        for (uint i = 0; i < framesKeys.length; i++) {
            Frame memory frame = frames[framesKeys[i]];
            //Frame has to be RATED
            if (getStateFrame(frame) == SFrame.RATED) {
            //Frame must not have lot that won
                Lot memory lotWon = lots[frame.frameKey][clcLotKey(frame.rate)][lots[frame.frameKey][clcLotKey(frame.rate)].length];
                if (getStateLot(lotWon) != SLot.WON)
                    unClaimableFunds += clcRewardFund(frame);
            }
        }
        return unClaimableFunds;
    }

    function withdrawAccountingToken(uint amount) external {
        require(msg.sender == owner, "Only owner can withdraw accounting token");
        accountingToken.transfer(owner, accountingToken.balanceOf(address(this)));
    }
}