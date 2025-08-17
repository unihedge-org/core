// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
//pragma experimental ABIEncoderV2;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "hardhat/console.sol";

/// @author UniHedge
contract Market {
    //Length of a frame in [seconds] (1 day)
    uint public period = 86400; //64b
    //Market begin timestamp 1.1.2024 [seconds]
    uint public initTimestamp = 1704124800; //64b
    //Protocol fee 3.00% per frame [wei] writen with 6 decimals = 0.03
    uint256 public feeProtocol = 0; //256b
    //Settle interval for average price calculation in [seconds] (10 minutes)
    uint public tSettle = 600;
    //Uniswap pool
    IUniswapV3Pool public uniswapPool; // Sepolia: 0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50 // Polygon: 0x45dDa9cb7c25131DF268515131f647d726f50608
    //Range of a lot [wei ETH/USDC], 
    uint256 public dPrice = 0; // 100 USDC
    //Tax on lots in the market 1% per period [wei] = 0.01
    uint256 public taxMarket = 0; //256b
    //ERC20 token used for buying lots in this contract
    IERC20Metadata public accountingToken; //256b // USDC token address on Polygon
    //Max tax denominator for dynamic tax calculation
    uint256 constant MAX_TAX_DENOMINATOR = 4; // 25% = 1/4
    // Reward pool for the market
    uint256 public rewardPool; //256b
    // Last settled frame key
    uint public lastSettledFrameIndex;
    // ERC20 token decimals	
    uint8 public accountingTokenDecimals;
    // Base unit for calculations
    uint256 public immutable baseUnit;   // 10 ** accountingTokenDecimals
    //Owner of this market
    address public owner; //256b
    // Track total taxes ever collected
    uint256 public totalTaxesCollected;  
    // Track total rewards distributed
    uint256 public totalRewardsDistributed;  
    uint256 public lastActiveFrameKey;  // Track the current active frame
    // Rollover percentage (in basis points, where 1000 = 10%)
    uint256 public rolloverPercentage = 9000; // Default 90%

    mapping(uint => uint256) public taxesCollectedInFrame; // Track taxes collected in each frame
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
        // reward pool for the frame
        uint rewardPool;
    }

    //Frames
    mapping(uint => Frame) public frames;
    uint[] public framesKeys;
    mapping(uint => uint) public frameKeyToIndex; 

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

    mapping(address => uint256) public userTotalTaxPaid;  // Track tax per user
    mapping(address => uint256) public userTotalWinnings;  // Track winnings per user

    event TaxCollected(address indexed user, uint256 amount, uint256 frameKey);
    event RewardDistributed(address indexed winner, uint256 amount, uint256 frameKey);
    event FrameRollover(uint256 fromFrame, uint256 toFrame, uint256 amount);

    constructor(address _acct, uint256 _feeProtocol, uint256 _taxMarket, uint256 _dPrice, address _uniswapPool) {
        owner = msg.sender;
        uniswapPool = IUniswapV3Pool(_uniswapPool);
        accountingToken = IERC20Metadata(_acct);
        accountingTokenDecimals = accountingToken.decimals(); 
        baseUnit = 10 ** uint256(accountingTokenDecimals);

        feeProtocol = toQ96(baseUnit * _feeProtocol / 100);
        taxMarket = toQ96(baseUnit * _taxMarket / 100);
        dPrice = toQ96(baseUnit * _dPrice);
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

    function clcLotKey(uint valueQ96) public view returns (uint){
        if (valueQ96 < dPrice) return dPrice;

        // Calculate how many lots (whole number): value / dPrice → no decimals
        uint256 no_lots = valueQ96 / dPrice;

        // Multiply back: lots * dPrice → Q96
        return mulDiv(no_lots, dPrice, 1); 
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

    function getUserStats(address user) external view returns (
        uint256 totalTaxPaid,
        uint256 totalWinnings,
        uint256 netPosition
    ) {
        totalTaxPaid = userTotalTaxPaid[user];
        totalWinnings = userTotalWinnings[user];
        netPosition = totalWinnings > totalTaxPaid ? 
            totalWinnings - totalTaxPaid : 0;
    }

    function toQ96(uint256 amount) public view returns (uint256) {
        return mulDiv(amount, FixedPoint96.Q96, baseUnit);
    }

    function fromQ96(uint256 x96) public view returns (uint256) {
        return mulDiv(x96, baseUnit, FixedPoint96.Q96);
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
        //Check if frame is in the future for at leas 1 period
        require(frameKey + period >= block.timestamp, "Frame has to be in the future");
        //Add frame
        frames[frameKey].frameKey = frameKey;
        uint index = framesKeys.length;
        framesKeys.push(frameKey);
        frameKeyToIndex[frameKey] = index;  
        emit FrameUpdate(frames[frameKey]);
        return frameKey;
    }

    function getLotsKeysInFrame(uint frameKey) public view returns (uint[] memory){
        return frames[frameKey].lotKeys;
    }

    function getFrameIndex(uint frameKey) public view returns (uint){
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        return frameKeyToIndex[frameKey];
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
    function clcTax(uint frameKey, uint256 acquisitionPriceQ96) public view returns (uint256) {
        uint256 settlement = frameKey + period;
        require(settlement > block.timestamp, "Frame has to be in the future");  
        
        console.log("=== TAX CALCULATION DEBUG ===");
        console.log("Frame key:", frameKey);
        console.log("Period:", period);
        console.log("Settlement timestamp:", settlement);
        console.log("Current timestamp:", block.timestamp);
        console.log("Raw seconds left:", settlement - block.timestamp);
        console.log("Settlement days remaining:", (settlement - block.timestamp) / 86400);

        // 1) Compute daysRemaining
        uint256 secondsLeft = settlement - block.timestamp;
        uint256 daysRemaining = secondsLeft / 86400;

        // 2) Horizon calculation
        uint256 horizon = daysRemaining + 1;

        console.log("Days remaining:", daysRemaining);
        console.log("Horizon:", horizon);
        console.log("=== END DEBUG ===");

        // 3) Calculate sqrt(horizon) with fixed-point precision
        uint256 SCALE_FACTOR = 1e12; // Use 1e12 for good precision without overflow
        uint256 horizonScaled = horizon * SCALE_FACTOR;
        uint256 sqrtHorizonScaled = Math.sqrt(horizonScaled);
        
        // Now sqrtHorizonScaled = sqrt(horizon * 1e12) = sqrt(horizon) * 1e6
        // So sqrt(horizon) = sqrtHorizonScaled / 1e6
        
        // 4) Tax rate = 25% / sqrt(horizon) in Q96 format
        // We want: (FixedPoint96.Q96 / 4) / sqrt(horizon)
        // = (FixedPoint96.Q96 / 4) * 1e6 / sqrtHorizonScaled
        uint256 quarterQ96 = FixedPoint96.Q96 / MAX_TAX_DENOMINATOR; // 25% in Q96
        uint256 SQRT_SCALE_FACTOR = 1e6; // sqrt(1e12) = 1e6
        
        uint256 dynamicTaxRateQ96 = mulDiv(quarterQ96, SQRT_SCALE_FACTOR, sqrtHorizonScaled);

        // 5) One-time tax = dynamicRate × price
        uint256 taxQ96 = mulDiv(dynamicTaxRateQ96, acquisitionPriceQ96, FixedPoint96.Q96);

        return taxQ96;
    }

    function convertToTokenDecimals(uint256 amount18Dec, bool round) public view returns (uint256) {
        uint256 scaleDown = 10 ** (18 - accountingTokenDecimals);
        
        if (round) {
            // Round to nearest integer
            return (amount18Dec + (scaleDown / 2)) / scaleDown;
        } else {
            // Simple truncation
            return amount18Dec / scaleDown;
        }
    }

    // Get the current global reward pool
    function getGlobalRewardPool() public view returns (uint256) {
        uint256 totalPool = 0;
        
        // Add rollover from last settled frame (configurable % that wasn't distributed)
        if (lastSettledFrameIndex > 0 && lastSettledFrameIndex <= framesKeys.length) {
            uint lastSettledFrameKey = framesKeys[lastSettledFrameIndex - 1];
            totalPool += mulDiv(frames[lastSettledFrameKey].rewardPool, rolloverPercentage, 10000);
        }
        
        // Add taxes collected in all active frames that haven't been settled yet
        for (uint i = lastSettledFrameIndex; i < framesKeys.length; i++) {
            uint frameKey = framesKeys[i];
            totalPool += taxesCollectedInFrame[frameKey];
        }
        
        return totalPool;
    }

    // Get pending rewards for the next settlement
    function getPendingRewardForNextSettlement() public view returns (uint256) {
        if (lastSettledFrameIndex >= framesKeys.length) {
            return 0;
        }
        
        uint frameKey = framesKeys[lastSettledFrameIndex];
        if (getStateFrame(frameKey) == SFrame.RATED) {
            // Calculate what the total reward pool would be for this frame
            uint256 taxesThisFrame = taxesCollectedInFrame[frameKey];
            uint256 totalFrameReward = taxesThisFrame;
            
            // Add rollover from previous frame if exists
            if (lastSettledFrameIndex > 0) {
                uint previousFrameKey = framesKeys[lastSettledFrameIndex - 1];
                uint256 previousFrameTotal = frames[previousFrameKey].rewardPool;
                uint256 rollover = mulDiv(previousFrameTotal, rolloverPercentage, 10000);
                totalFrameReward += rollover;
            }
            
            // Configurable % of the total pool goes to settlement (remaining goes to next frame)
            return mulDiv(totalFrameReward, 10000 - rolloverPercentage, 10000);
        }
        
        return 0;
    }

    //Function for trading lots with referral
    function tradeLot(uint timestamp, uint rate, uint acquisitionPrice) external {
        //Calculate frame key
        uint frameKey = clcFrameKey(timestamp);
        // Require that the frame is in OPENED state
        require(block.timestamp < frameKey + period, "Frame is not open for trading");
        //Calculate lot key
        uint lotKey = clcLotKey(rate);

        // Calculate the CURRENT active frame (not the lot's frame)
        uint currentActiveFrame = clcFrameKey(block.timestamp);
        
        // Ensure we're tracking the current active frame
        if (currentActiveFrame != lastActiveFrameKey) {
            lastActiveFrameKey = currentActiveFrame;
            if (frames[currentActiveFrame].frameKey == 0) {
                createFrame(block.timestamp);
            }
        }

        //If lot doesn't exist, create new lot
        if (lots[frameKey][lotKey].lotKey == 0) {
            //If Frame doesn't exist, create new frame
            if (frames[frameKey].frameKey == 0) {
                createFrame(timestamp);
            }
            purchaseLot(frameKey, lotKey, acquisitionPrice, currentActiveFrame);
        } else { // Existing lot

            if (lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].owner == msg.sender) {
                // If lot owner is same update price
                revaluateLot(frameKey, lotKey, acquisitionPrice, currentActiveFrame );
            } else {
                // Lot is sold to a new owner
                resaleLot(frameKey, lotKey, acquisitionPrice, currentActiveFrame );
            }
        }
        
        // Trigger event
        emit LotUpdate(lots[frameKey][lotKey]);
    }

    function purchaseLot(uint frameKey, uint lotKey, uint acquisitionPriceQ96, uint activeFrameKey) internal {
        //Calculate tax amount
        uint taxQ96 = clcTax(frameKey, acquisitionPriceQ96);
        // Convert tax to token decimals
        uint taxToken = fromQ96(taxQ96);
        console.log("Tax amount in token decimals", taxToken);
        //Tax has to be greater than 0
        require(taxToken > 0, "Tax has to be greater than 0. Increase the acquisition price");
        //Approved amount has to be at least equal to tax
        console.log("Allowance to spend", accountingToken.allowance(msg.sender, address(this)));
        require(accountingToken.allowance(msg.sender, address(this)) >= taxToken, "Allowance to spend set too low");

        //this check is because with the concat function, the lotKey is not limited to full uint256 range anymore
        require(lotKey < 10000000000000000000000000000000000000000000000000000000000000000000000000000, "Lot key too big");
        //Reject if lot already exists
        require(lots[frameKey][lotKey].lotKey == 0, "Lot already exists");
        //Create lot
        LotState memory state = LotState(
            block.number, 
            block.timestamp, 
            msg.sender, 
            acquisitionPriceQ96, 
            toQ96(taxToken)); 

        Lot storage lot = lots[frameKey][lotKey];
        lot.frameKey = frameKey;
        lot.lotKey = lotKey;
        lot.states.push(state);
        // Add lot to lotsArray
        uint lotKeyConcat = concatenate(frameKey, lotKey);
        lotsArray.push(lotKeyConcat);

        // Add lot to frame
        frames[frameKey].lotKeys.push(lot.lotKey);

        taxesCollectedInFrame[activeFrameKey] += toQ96(taxToken);

        //Update total taxes collected
        totalTaxesCollected += toQ96(taxToken);
        //Update user total tax paid
        userTotalTaxPaid[msg.sender] += toQ96(taxToken);

        //Transfer tax amount to the market contract
        accountingToken.transferFrom(msg.sender, address(this), taxToken);
        
        emit TaxCollected(msg.sender, taxToken, activeFrameKey);
    }

    function revaluateLot(uint frameKey, uint lotKey, uint acquisitionPriceQ96, uint activeFrameKey) internal {        //Calculate tax with new acquisitionPrice
        uint taxQ96 = clcTax(frameKey, acquisitionPriceQ96);
        //Convert tax difference to token decimals
        uint taxChargeToken = fromQ96(taxQ96);

        require(accountingToken.allowance(msg.sender, address(this)) >= taxChargeToken, "Allowance to spend set too low");
        //Transfer tax difference to the market contract
        accountingToken.transferFrom(msg.sender, address(this), taxChargeToken);
        //Add new lot state
        lots[frameKey][lotKey].states.push(
            LotState(
                block.number, 
                block.timestamp, 
                msg.sender, 
                acquisitionPriceQ96, 
                toQ96(taxChargeToken))
            );

        // Add to global pool and track for active frame
        taxesCollectedInFrame[activeFrameKey] += toQ96(taxChargeToken);
        //Update total taxes collected
        totalTaxesCollected += toQ96(taxChargeToken);
        //Update user total tax paid
        userTotalTaxPaid[msg.sender] += toQ96(taxChargeToken);

        emit TaxCollected(msg.sender, taxChargeToken, activeFrameKey);
    }

    function resaleLot(uint frameKey, uint lotKey, uint acquisitionPriceQ96, uint activeFrameKey) internal {
        address previousOwner = lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].owner;
        //Calculate tax amount
        uint taxQ96 = clcTax(frameKey, acquisitionPriceQ96);
        //Tax has to be greater than 0
        require(taxQ96 > 0, "Tax has to be greater than 0. Increase the acquisition price");
        //Approved amount has to be at least equal to price of the
        //Get last acquisition price + tax
        uint lastAcquisitionPrice = lots[frameKey][lotKey].states[lots[frameKey][lotKey].states.length - 1].acquisitionPrice;

        // Convert last acquisition price to token decimals
        uint lastAcquisitionPriceToken = fromQ96(lastAcquisitionPrice);

        uint taxToken = fromQ96(taxQ96);
        
        require(accountingToken.allowance(msg.sender, address(this)) >= taxToken + lastAcquisitionPriceToken, "Allowance to spend set too low");
        //Transfer tax amount to the market contract
        accountingToken.transferFrom(msg.sender, address(this), taxToken);
        // Transfer from new owner lastAcquisitionPrice to the previous owner
        accountingToken.transferFrom(msg.sender, previousOwner, lastAcquisitionPriceToken);
        //Add new lot state

        lots[frameKey][lotKey].states.push(LotState(block.number, block.timestamp, msg.sender, acquisitionPriceQ96, toQ96(taxToken)));

        // Add to global pool and track for active frame
        taxesCollectedInFrame[activeFrameKey] += toQ96(taxToken);
        //Update total taxes collected
        totalTaxesCollected += toQ96(taxToken);
        //Update user total tax paid
        userTotalTaxPaid[msg.sender] += toQ96(taxToken);

        emit TaxCollected(msg.sender, taxToken, activeFrameKey);
    }

    /* Calculate the current price of the pool
    *  @return price - the current price of the pool
    */
    function clcRate() public view returns (uint256) {
        (uint160 sqrtPriceX96, , , , , ,) = uniswapPool.slot0();

        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 priceQ96 = priceX192 >> 96;

        address token0 = uniswapPool.token0();
        address token1 = uniswapPool.token1();

        uint8 decimals0 = IERC20Metadata(token0).decimals();
        uint8 decimals1 = IERC20Metadata(token1).decimals();

        // Adjust for decimal difference between token0 and token1
        if (decimals0 > decimals1) {
            priceQ96 = mulDiv(priceQ96, 10 ** (decimals0 - decimals1), 1);
        } else if (decimals1 > decimals0) {
            priceQ96 = mulDiv(priceQ96, 1, 10 ** (decimals1 - decimals0));
        }

        priceQ96 = mulDiv(FixedPoint96.Q96, FixedPoint96.Q96, priceQ96);

        return priceQ96; // Final price, scaled for decimals, in Q96
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
        (int56[] memory tickCumulatives, ) = uniswapPool.observe(timeIntervals);

        // Calculate the tick difference and time elapsed
        int256 tickCumulativeDeltaInt = int256(tickCumulatives[1]) - int256(tickCumulatives[0]);
        require(tickCumulativeDeltaInt >= 0, "Negative tick delta");
        uint256 tickCumulativeDelta = uint256(tickCumulativeDeltaInt);
        uint timeElapsed = uint(t1) - uint(t2); // Ensure this calculation makes sense in your context

        // Calculate the average tick
        uint averageTick = tickCumulativeDelta / timeElapsed;

        // Calculate the sqrtPriceX96 (Calculates sqrt(1.0001^tick) * 2^96) from the average tick with a fixed point Q64.96
        uint160 sqrtPriceX96 = getSqrtRatioAtTick(averageTick);

        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 priceQ96 = priceX192 >> 96;

        address token0 = uniswapPool.token0();
        address token1 = uniswapPool.token1();

        uint8 decimals0 = IERC20Metadata(token0).decimals();
        uint8 decimals1 = IERC20Metadata(token1).decimals();

        // Adjust for decimal difference between token0 and token1
        if (decimals0 > decimals1) {
            priceQ96 = mulDiv(priceQ96, 10 ** (decimals0 - decimals1), 1);
        } else if (decimals1 > decimals0) {
            priceQ96 = mulDiv(priceQ96, 1, 10 ** (decimals1 - decimals0));
        }

        // Divide by 1, because we want the rate in token0
        priceQ96 = mulDiv(FixedPoint96.Q96, FixedPoint96.Q96, priceQ96);

        return priceQ96; // Final price, scaled for decimals, in Q96
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
        // Check if frameKey exists
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        //Frame has to be in state CLOSED
        require(frames[frameKey].frameKey + period <= block.timestamp, "Frame has to be in the past");
        //Calculate the average price of the frame
        uint rate = clcRateAvg(frameKey);
        //Update frame
        frames[frameKey].rate = rate;
        emit FrameUpdate(frames[frameKey]);
    }

    function settleFrame() public returns (uint) {
        require(lastSettledFrameIndex < framesKeys.length, "No frame to settle");

        uint frameKey = framesKeys[lastSettledFrameIndex];
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");

        require(getStateFrame(frameKey) == SFrame.RATED, "Frame is not in RATED state");

        // Calculate this frame's total reward pool
        uint256 taxesThisFrame = taxesCollectedInFrame[frameKey];
        uint256 totalFrameReward = taxesThisFrame;
        
        // Add rollover from previous frame if exists
        if (lastSettledFrameIndex > 0) {
            uint previousFrameKey = framesKeys[lastSettledFrameIndex - 1];
            // Previous frame keeps rolloverPercentage%, so we get the rest
            uint256 previousFrameTotal = frames[previousFrameKey].rewardPool;
            uint256 rollover = mulDiv(previousFrameTotal, rolloverPercentage, 10000);
            totalFrameReward += rollover;
        }
        
        // Store the total reward pool for this frame
        frames[frameKey].rewardPool = totalFrameReward;
        
        // Calculate settlement (configurable % goes to rollover, rest goes to settlement)
        uint256 settlementAmount = mulDiv(totalFrameReward, 10000 - rolloverPercentage, 10000);
        uint256 fee = mulDiv(settlementAmount, feeProtocol, FixedPoint96.Q96);
        uint256 payout = settlementAmount - fee;

        frames[frameKey].feeSettle = fee;
        frames[frameKey].rewardSettle = payout;

        // The rolloverPercentage automatically stays in the frame's pool for next frame's rollover
        // This is implicit - we don't need to move it anywhere!

        // Determine winner
        uint lotKeyWon = clcLotKey(frames[frameKey].rate);
        Lot storage lotWon = lots[frameKey][lotKeyWon];

        if (lotWon.states.length > 0) {
            // Has winner
            address recipient = lotWon.states[lotWon.states.length - 1].owner;
            
            accountingToken.transfer(recipient, fromQ96(payout));
            frames[frameKey].claimedBy = recipient;
            
            totalRewardsDistributed += fromQ96(payout);
            userTotalWinnings[recipient] += fromQ96(payout);
            emit RewardDistributed(recipient, fromQ96(payout), frameKey);
        } else {
            // No winner - the payout amount becomes additional rollover for next frame
            frames[frameKey].claimedBy = address(1);
            
            // Note: The entire unsettled amount (50% base + payout) will be available for next frame
            uint256 totalRollover = totalFrameReward - fee; // Everything except protocol fee
            emit FrameRollover(frameKey, frameKey + period, fromQ96(totalRollover));
        }
        
        // Always pay protocol fee
        accountingToken.transfer(owner, fromQ96(fee));

        frames[frameKey].rateSettle = frames[frameKey].rate;

        if (lotWon.states.length > 0) {
            emit LotUpdate(lotWon);
        }
        emit FrameUpdate(frames[frameKey]);

        lastSettledFrameIndex += 1;

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

   function setRolloverPercentage(uint256 newRolloverPercentage) external {
       require(msg.sender == owner, "Only owner can change rollover percentage");
       require(newRolloverPercentage <= 9000, "Rollover percentage cannot exceed 90%");
       rolloverPercentage = newRolloverPercentage;
   }

   function seedRewardPool(uint256 amount) external {
       require(msg.sender == owner, "Only owner can seed reward pool");
       require(amount > 0, "Amount must be greater than 0");
       
       // Transfer tokens from owner to contract
       accountingToken.transferFrom(msg.sender, address(this), amount);
       
       // Add to the current active frame's tax collection or global pool
       uint currentFrameKey = clcFrameKey(block.timestamp);
       if (frames[currentFrameKey].frameKey == 0) {
           createFrame(block.timestamp);
       }
       
       // Add the seeded amount to the current frame's tax collection
       taxesCollectedInFrame[currentFrameKey] += toQ96(amount);
       totalTaxesCollected += toQ96(amount);
   }

    // Uniswap V3 mulDiv function
    // This function is used to multiply two numbers and then divide by a third number, all in a single operation.
    // It's converted to solidity v.0.8.0 from the original Uniswap V3 code.
   function mulDiv(
        uint256 a,
        uint256 b,
        uint256 denominator
    ) internal pure returns (uint256 result) {
        // 512-bit multiply [prod1 prod0] = a * b
        // Compute the product mod 2**256 and mod 2**256 - 1
        // then use the Chinese Remainder Theorem to reconstruct
        // the 512 bit result. The result is stored in two 256
        // variables such that product = prod1 * 2**256 + prod0
        uint256 prod0; // Least significant 256 bits of the product
        uint256 prod1; // Most significant 256 bits of the product
        assembly {
            let mm := mulmod(a, b, not(0))
            prod0 := mul(a, b)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }

        // Handle non-overflow cases, 256 by 256 division
        if (prod1 == 0) {
            require(denominator > 0);
            assembly {
                result := div(prod0, denominator)
            }
            return result;
        }

        // Make sure the result is less than 2**256.
        // Also prevents denominator == 0
        require(denominator > prod1);

        ///////////////////////////////////////////////
        // 512 by 256 division.
        ///////////////////////////////////////////////

        // Make division exact by subtracting the remainder from [prod1 prod0]
        // Compute remainder using mulmod
        uint256 remainder;
        assembly {
            remainder := mulmod(a, b, denominator)
        }
        // Subtract 256 bit number from 512 bit number
        assembly {
            prod1 := sub(prod1, gt(remainder, prod0))
            prod0 := sub(prod0, remainder)
        }

        // Factor powers of two out of denominator
        // Compute largest power of two divisor of denominator.
        // Always >= 1.
        uint256 twos = (~denominator + 1) & denominator;
        // Divide denominator by power of two
        assembly {
            denominator := div(denominator, twos)
        }

        // Divide [prod1 prod0] by the factors of two
        assembly {
            prod0 := div(prod0, twos)
        }
        // Shift in bits from prod1 into prod0. For this we need
        // to flip `twos` such that it is 2**256 / twos.
        // If twos is zero, then it becomes one
        assembly {
            twos := add(div(sub(0, twos), twos), 1)
        }
        prod0 |= prod1 * twos;

        // Invert denominator mod 2**256
        // Now that denominator is an odd number, it has an inverse
        // modulo 2**256 such that denominator * inv = 1 mod 2**256.
        // Compute the inverse by starting with a seed that is correct
        // correct for four bits. That is, denominator * inv = 1 mod 2**4
        uint256 inv = (3 * denominator) ^ 2;
        // Now use Newton-Raphson iteration to improve the precision.
        // Thanks to Hensel's lifting lemma, this also works in modular
        // arithmetic, doubling the correct bits in each step.
        inv *= 2 - denominator * inv; // inverse mod 2**8
        inv *= 2 - denominator * inv; // inverse mod 2**16
        inv *= 2 - denominator * inv; // inverse mod 2**32
        inv *= 2 - denominator * inv; // inverse mod 2**64
        inv *= 2 - denominator * inv; // inverse mod 2**128
        inv *= 2 - denominator * inv; // inverse mod 2**256

        // Because the division is now exact we can divide by multiplying
        // with the modular inverse of denominator. This will give us the
        // correct result modulo 2**256. Since the precoditions guarantee
        // that the outcome is less than 2**256, this is the final result.
        // We don't need to compute the high bits of the result and prod1
        // is no longer required.
        result = prod0 * inv;
        return result;
    }
}
