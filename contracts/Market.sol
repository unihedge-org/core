// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
//pragma experimental ABIEncoderV2;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "hardhat/console.sol";

/// @author UniHedge
contract Market {
    //Length of a frame in [seconds] (1 day)
    uint public period = 86400; //64b
    //Market begin timestamp 1.1.2024 [seconds]
    uint public initTimestamp = 1704124800; //64b
    //Protocol fee 3.00% per frame [wei] writen with 6 decimals = 0.03
    uint256 public feeProtocol = 30000; //256b
    //Settle interval for average price calculation in [seconds] (10 minutes)
    uint public tSettle = 600;
    //Uniswap pool
    IUniswapV3Pool public uniswapPool = IUniswapV3Pool(0x45dDa9cb7c25131DF268515131f647d726f50608);
    //Range of a lot [wei ETH/USDC], 
    uint256 public dPrice = 1e8; // 100 USDC
    //Tax on lots in the market 1% per period [wei] = 0.01
    uint256 public taxMarket = 10000; //256b
    //ERC20 token used for buying lots in this contract
    IERC20Metadata public accountingToken; //256b // USDC token address on Polygon
    // ERC20 token decimals	
    uint8 public accountingTokenDecimals;
    //Owner of this market
    address public owner; //256b
    /*
    *   Frame enum

    *   NULL - Frame is not created
    *   OPENED - Frame is opened and ready for trading
    *   CLOSED - Frame is closed and ready for rate calculation
    *   RATED - Frame close rate was set
    *   SETTLED - Frame reward was claimed by winner or market owner
    */
    enum SFrame {NULL, OPENED, CLOSED, RATED, SETTLED}

    struct Frame {
        uint frameKey;
        uint rate;
        uint[] lotKeys;
        //Reward claimed by user
        address claimedBy;
        //Close rate as average rate of frame for settle interval
        uint rateSettle;
        //Fee charged at the settle stage of the frame
        uint feeSettle;
        //Reward fund for the frame sum of all taxes charged minus all taxes refunded minus protocol fee
        uint rewardSettle;
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

    struct LotState {
        //Block number
        uint blockNumber;
        //Block timestamp
        uint blockTimestamp;
        //Lot owner
        address owner;
        //Acquisition price
        uint acquisitionPrice;
        //Tax charged
        uint taxCharged;
        //Tax refunded
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
    //Create a public array of lots, each number is made out of frame key and lotKey
    uint256[] public lotsArray;

    event LotUpdate(Lot lot);

    constructor(address _accountingToken) {
        owner = msg.sender;
        accountingToken = IERC20Metadata(_accountingToken);
        accountingTokenDecimals = accountingToken.decimals(); 
    }

    function getStateFrame(uint frameKey) public view returns (SFrame){
        //NULL If frame doesn't exist, return SFrame.NULL
        if (frames[frameKey].frameKey == 0) return SFrame.NULL;
        //SETTLED If reward is claimed, return SFrame.CLAIMED
        if (frames[frameKey].claimedBy != address(0)) return SFrame.SETTLED;
        //OPENED If frameKey+period is in the future, return SFrame.OPENED
        if (block.timestamp < frames[frameKey].frameKey + period) return SFrame.OPENED;
        //RATED if average price is set, return SFrame.RATED
        if (frames[frameKey].rate > 0) return SFrame.RATED;
        //CLOSED if no other condition is met, return SFrame.CLOSED
        return SFrame.CLOSED;
    }

    function getStateLot(uint frameKey, uint lotKey) public view returns (SLot){
        //NULL If lot doesn't exist, return SLot.NULL
        if (lots[frameKey][lotKey].lotKey == 0) return SLot.NULL;
        //If frame state is null, return SLot.NULL
        if (getStateFrame(frameKey) == SFrame.NULL) return SLot.NULL;
        //If frame state is OPENED or CLOSED, return SLot.TAKEN
        if (getStateFrame(frameKey) == SFrame.OPENED || getStateFrame(frameKey) == SFrame.CLOSED) return SLot.TAKEN;
        //Frame state is RATED decide if lot state is WON or LOST
        //WON if frame average price is in interval of lot key and lotKey+dPrice
        if (frames[frameKey].rate >= lots[frameKey][lotKey].lotKey && frames[frameKey].rate < lots[frameKey][lotKey].lotKey + dPrice) return SLot.WON;
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
        return (value / (dPrice) * (dPrice));
    }

    function getFrame(uint frameKey) public view returns (Frame memory){
        //Reject if frame doesn't exist
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        return (frames[frameKey]);
    }

    function getFramesLength() public view returns (uint){
        return framesKeys.length;
    }

    function getLotsLength(uint frameKey) public view returns (uint){
        return frames[frameKey].lotKeys.length;
    }

    function getLotsArray() public view returns (uint256[] memory){
        return lotsArray;
    }
    function getLotsArrayLength() public view returns (uint){
        return lotsArray.length;
    }

    function getFrameLotKeys(uint frameKey) public view returns (uint[] memory){
        return frames[frameKey].lotKeys;
    }


    function getLot(uint frameKey, uint lotKey) public view returns (Lot memory){
        //Reject if lot doesn't exist
        require(lots[frameKey][lotKey].lotKey != 0, "Lot doesn't exist");
        return lots[frameKey][lotKey];
    }

    //Function to get lot states for market getter
    function getLotStates(uint frameKey, uint lotKey) public view returns (LotState[] memory){
        return lots[frameKey][lotKey].states;
    }

    // Function to concatenate a timestamp and an 18-decimal number
    function concatenate(uint256 frameKey, uint256 lotKey) public pure returns (uint256 concatenated) {
        lotKey = lotKey * 1e10;
        concatenated = lotKey + frameKey;
        return concatenated;
    }

    function createFrame(uint timestamp) internal returns (uint){
        //Get frame's timestamp - frame key
        uint frameKey = clcFrameKey(timestamp);
        //Reject if frame already exists
        require(frames[frameKey].frameKey == 0, "Frame already exists");
        //Create frame
        //Check if frame is in the future for at leas 1 period
        require(frameKey + period >= block.timestamp, "Frame has to be in the future");
        //Add frame
        frames[frameKey].frameKey = frameKey;
        framesKeys.push(frameKey);
        emit FrameUpdate(frames[frameKey]);
        return frameKey;
    }

    function getLotsKeysInFrame(uint frameKey) public view returns (uint[] memory){
        return frames[frameKey].lotKeys;
    }

    function overrideFrameRate(uint frameKey, uint avgPrice) external {

        //Only owner can update frame close price
        require(msg.sender == owner, "Only owner can update frame close price");
        //Frame must exists
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        //Frame must not be in CLAIMED state
        require(frames[frameKey].claimedBy == address(0), "Frame reward was already claimed");
        frames[frames[frameKey].frameKey].rate = avgPrice;
    }

    //Calculate amount of tax to be collected from the owner of the lot
    function clcTax(uint frameKey, uint256 acquisitionPrice) public view returns (uint) {
        //Require frameKey to be in the future
        require(frameKey + period > block.timestamp, "Frame has to be in the future");
        //Calculate tax per second and correct for 18 decimals because of wei multiplication
        //Tax per second is calculated as taxMarket [wei %] * acquisitionPrice [wei DAI] / period [seconds]
        uint256 taxPerSecond = (taxMarket * 1e18) / period;

        uint256 duration = (frameKey + period) - block.timestamp;

        uint256 tax = (duration * taxPerSecond * acquisitionPrice) / 1e24; // 1e18 + 1e6 = 1e24

        return tax;
    }

    //Calculate reward fund for the frame from lots
    function clcRewardFund(uint frameKey) public view returns (uint) {
        uint rewardFund = 0;
        for (uint i = 0; i < frames[frameKey].lotKeys.length; i++) {
            Lot memory lot = lots[frames[frameKey].frameKey][frames[frameKey].lotKeys[i]];
            for (uint j = 0; j < lot.states.length; j++) {
                //Add tax charged to the reward fund
                rewardFund += lot.states[j].taxCharged;
                //Subtract tax refunded from the reward fund
                rewardFund -= lot.states[j].taxRefunded;
            }
        }
        return rewardFund;
    }

    //Function for trading lots with referral
    function tradeLot(uint timestamp, uint rate, uint acquisitionPrice) external {
        //Calculate frame key
        uint frameKey = clcFrameKey(timestamp);
        //Calculate lot key
        uint lotKey = clcLotKey(rate);

        //If lot doesn't exist, create new lot
        if (lots[frameKey][lotKey].lotKey == 0) {
            //If Frame doesn't exist, create new frame
            if (frames[frameKey].frameKey == 0) {
                createFrame(timestamp);
            }
            purchaseLot(frameKey, lotKey, acquisitionPrice);
        } else { // Existing lot

            if (lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].owner == msg.sender) {
                // If lot owner is same update price
                revaluateLot(frameKey, lotKey, acquisitionPrice);
            } else {
                // Lot is sold to a new owner
                resaleLot(frameKey, lotKey, acquisitionPrice);
            }
        }
        
        // Trigger event
        emit LotUpdate(lots[frameKey][lotKey]);
    }

    function purchaseLot(uint frameKey, uint lotKey, uint acquisitionPrice) internal {
        //Calculate tax amount
        uint tax = clcTax(frameKey, acquisitionPrice);

        //Tax has to be greater than 0
        require(tax > 0, "Tax has to be greater than 0. Increase the acquisition price");
        //Approved amount has to be at least equal to tax
        require(accountingToken.allowance(msg.sender, address(this)) >= tax, "Allowance to spend set too low");

        //this check is because with the concat function, the lotKey is not limited to full uint256 range anymore
        require(lotKey < 10000000000000000000000000000000000000000000000000000000000000000000000000000, "Lot key too big");
        //Reject if lot already exists
        require(lots[frameKey][lotKey].lotKey == 0, "Lot already exists");
        //Create lot
        LotState memory state = LotState(block.number, block.timestamp, msg.sender, acquisitionPrice, tax, 0);

        Lot storage lot = lots[frameKey][lotKey];
        lot.frameKey = frameKey;
        lot.lotKey = lotKey;
        lot.states.push(state);

        // Add lot to lots
        lots[frameKey][lotKey] = lot;

        // Add lot to lotsArray
        uint lotKeyConcat = concatenate(frameKey, lotKey);
        lotsArray.push(lotKeyConcat);

        // Add lot to frame
        frames[frameKey].lotKeys.push(lot.lotKey);

        //Transfer tax amount to the market contract
        accountingToken.transferFrom(msg.sender, address(this), tax);
    }

    function revaluateLot(uint frameKey, uint lotKey, uint acquisitionPrice) internal {
        //Calculate tax with old acquisitionPrice
        uint tax1 = clcTax(frameKey, lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].acquisitionPrice);
        //Calculate tax with new acquisitionPrice
        uint tax2 = clcTax(frameKey, acquisitionPrice);
        //If tax1 is greater than tax2, refund the difference
        if (tax1 > tax2) {
            //Calculate tax difference
            uint taxRefund = tax1 - tax2;
            //Transfer tax difference to the lot owner
            accountingToken.transfer(lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].owner, taxRefund);
            //Add new lot state
            lots[frameKey][lotKey].states.push(LotState(block.number, block.timestamp, msg.sender, acquisitionPrice, 0, taxRefund));
        } else {
            //If tax2 is greater than tax1, charge the difference
            uint taxCharge = tax2 - tax1;

            require(accountingToken.allowance(msg.sender, address(this)) >= taxCharge, "Allowance to spend set too low");
            //Transfer tax difference to the market contract
            accountingToken.transferFrom(msg.sender, address(this), taxCharge);
            //Add new lot state
            lots[frameKey][lotKey].states.push(LotState(block.number, block.timestamp, msg.sender, acquisitionPrice, taxCharge, 0));
        }
    }

    function resaleLot(uint frameKey, uint lotKey, uint acquisitionPrice) internal {
        address previousOwner = lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].owner;
        //Calculate tax amount
        uint tax = clcTax(frameKey, acquisitionPrice);
        //Tax has to be greater than 0
        require(tax > 0, "Tax has to be greater than 0. Increase the acquisition price");
        //Approved amount has to be at least equal to price of the
        //Get last acquisition price + tax
        uint lastAcquisitionPrice = lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].acquisitionPrice;
        require(accountingToken.allowance(msg.sender, address(this)) >= tax + lastAcquisitionPrice, "Allowance to spend set too low");
        //Transfer tax amount to the market contract
        accountingToken.transferFrom(msg.sender, address(this), tax);
        // Transfer from new owner lastAcquisitionPrice to the previous owner
        accountingToken.transferFrom(msg.sender, previousOwner, lastAcquisitionPrice);
        // Transfer the remaining tax to previous owner
        uint taxRefund = clcTax(frameKey, lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].acquisitionPrice);
        accountingToken.transfer(previousOwner, taxRefund);

        // Update previous lot state
        lots[frameKey][lotKey].states.push(LotState(block.number, block.timestamp, previousOwner, lastAcquisitionPrice, 0, taxRefund));
        //Add new lot state
        lots[frameKey][lotKey].states.push(LotState(block.number, block.timestamp, msg.sender, acquisitionPrice, tax, 0));
    }

    /* Calculate the current price of the pool
    *  @return price - the current price of the pool
    */
    function clcRate() public view returns (uint) {
        //Get the current price from the pool
        (uint160 sqrtPriceX96, , , , , ,) = uniswapPool.slot0();

        uint256 price = uint256(sqrtPriceX96 * 1e12);

        price = price / 2**96;
        price = price ** 2; // Square the price to get the actual price
        price = price * 1e6;
        price =  (1 * 1e48) / price; // Adjust for 18 decimal places (18 + 12 + 18 = 48)

        return price;
    }

    /* Calculate the average price of the pool from a given timestamp minus 10 minutes to the current timestamp
    *  @param timestamp - the timestamp of the frame
    *  @return price - the average price of the pool over the given time interval
    */
    function clcRateAvg(uint timestamp) public view returns (uint){
        uint32 t1 = uint32(block.timestamp - timestamp + tSettle);
        uint32 t2 = uint32(block.timestamp - timestamp);

        // Create a dynamically-sized array for observe
        uint32[] memory timeIntervals = new uint32[](2);
        timeIntervals[0] = t1;
        timeIntervals[1] = t2;

        // Assuming observe returns cumulative price values directly
        (int56[] memory tickCumulatives,) = uniswapPool.observe(timeIntervals);

        // Calculate the tick difference and time elapsed
        int256 tickCumulativeDeltaInt = int256(tickCumulatives[1]) - int256(tickCumulatives[0]);
        require(tickCumulativeDeltaInt >= 0, "Negative tick delta");
        uint256 tickCumulativeDelta = uint256(tickCumulativeDeltaInt);
        uint timeElapsed = uint(t1) - uint(t2); // Ensure this calculation makes sense in your context

        // Calculate the average tick
        uint averageTick = tickCumulativeDelta / timeElapsed;

        // Calculate the sqrtPriceX96 (Calculates sqrt(1.0001^tick) * 2^96) from the average tick with a fixed point Q64.96
        uint160 sqrtPriceX96 = getSqrtRatioAtTick(averageTick);

        uint256 price = uint256(sqrtPriceX96 * 1e12);

        price = price / 2**96;
        price = price ** 2; // Square the price to get the actual price
        price = price * 1e6;
        price =  (1 * 1e48) / price; // Adjust for 18 decimal places (18 + 12 + 18 = 48)

        return price;
    }

    function getSqrtRatioAtTick(uint tick) internal pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(- int256(tick)) : uint256(int256(tick));
        require(absTick <= uint256(887272), 'T');

        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick > 0) ratio = type(uint256).max / ratio;

        // this divides by 1<<32 rounding up to go from a Q128.128 to a Q128.96.
        // we then downcast because we know the result always fits within 160 bits due to our tick input constraint
        // we round up in the division so getTickAtSqrtRatio of the output price is always consistent
        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }

    function setFrameRate(uint frameKey) public {
        //Frame has to be in state CLOSED
        //console log frameKey + period

        require(frames[frameKey].frameKey + period <= block.timestamp, "Frame has to be in the past");
        //Calculate the average price of the frame
        uint rate = clcRateAvg(frameKey);
        //Update frame
        frames[frameKey].rate = rate;
        emit FrameUpdate(frames[frameKey]);
    }

    function settleFrame(uint frameKey) public returns (uint){
        //Reject of frame don't exist
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        //Reject if frame is not in state RATED
        require(getStateFrame(frameKey) == SFrame.RATED, "Frame does not have a close rate set");
        //Calculate the winning lot key based on the frame's close rate
        uint lotKeyWon = clcLotKey(frames[frameKey].rate);
        Lot memory lotWon = lots[frameKey][lotKeyWon];
        //Reject if lot is in state LOST

        // require(getStateLot(frameKey, lotKeyWon) == SLot.WON, "No winning lot in this frame");
        //Transfer winnings to last owner
        //total reward fund
        uint rewardFund = clcRewardFund(frameKey);
        //Calculate protocol fee
        uint fee = rewardFund * feeProtocol / (1e6);
        frames[frameKey].feeSettle = fee;
        frames[frameKey].rewardSettle = rewardFund - fee;
        
        //Check if lot has an owner, at least one state has to exist
        if (lotWon.states.length > 0) {
            accountingToken.transfer(lotWon.states[lotWon.states.length - 1].owner, frames[frameKey].rewardSettle);
            frames[frameKey].claimedBy = lotWon.states[lotWon.states.length - 1].owner;

            //transfer protocol fee to owner
            accountingToken.transfer(owner, frames[frameKey].feeSettle);

        } else {
            //transfer protocol fee + reward fund to owner
            accountingToken.transfer(owner, frames[frameKey].rewardSettle + frames[frameKey].feeSettle);
            frames[frameKey].claimedBy = owner;
        }

        frames[frameKey].rateSettle = frames[frameKey].rate;
        
        emit LotUpdate(lotWon);
        emit FrameUpdate(frames[frameKey]);

        return frames[frameKey].rewardSettle;
    }

   function withdrawAccountingToken(uint amount) external {
       require(msg.sender == owner, "Only owner can withdraw accounting token");
       accountingToken.transfer(owner, amount);
   }

   function changeTaxPercentage(uint256 newTax) external {
       require(msg.sender == owner, "Only owner can change tax percentage");
       taxMarket = newTax;
   }

   function changeProtocolFee(uint256 newFee) external {
       require(msg.sender == owner, "Only owner can change protocol fee");
       feeProtocol = newFee;
   }

}
