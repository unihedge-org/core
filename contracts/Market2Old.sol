// // SPDX-License-Identifier: MIT
// pragma solidity ^0.7.0;
// //pragma experimental ABIEncoderV2;
// pragma experimental ABIEncoderV2;

// import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import '@uniswap/v3-core/contracts/libraries/TickMath.sol';
// import "@openzeppelin/contracts/math/SafeMath.sol"; //SafeMath needed for solidity versions lower than 0.8.0

// import "hardhat/console.sol";

// /// @author UniHedge
// /// @dev All function calls are currently implemented without side effects
// contract Market {
//     using SafeMath for uint;
//     //Length of a frame in seconds (1 day)
//     uint public period = 86400; //64b
//     //Market begin timestamp 1.1.2024
//     uint public initTimestamp = 1704124800; //64b
//     //Protocol fee 0.05% writen with 18 decimals
//     uint public feeProtocol = 500000000000000; //256b
//     //Settle interval for average price calculation in seconds (10 minutes)
//     uint public tReporting = 600;
//     //Uniswap pool
//     IUniswapV3Pool public uniswapPool = IUniswapV3Pool(0x67a9FE12fa6082D9D0203c84C6c56D3c4B269F28);
//     //Range of a lot in the format of tokens decimals 100 and 18 decimals
//     uint public dPrice = 1e20;
//     //Tax on lots in the market 0.5% per period write with 18 decimals
//     uint public taxMarket = 5000000000000000; //256b
//     //ERC20 token used for buying lots in this contract
//     // IERC20 public accountingToken = IERC20(0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063); //256b
//     IERC20 public accountingToken; //256b
//     //Owner of this market
//     address public owner; //256b

//     /*
//     *   Frame enum

//     *   NULL - Frame is not created
//     *   OPENED - Frame is opened and ready for trading
//     *   CLOSED - Frame is closed and ready for rate calculation
//     *   RATED - Frame close rate was set
//     *   SETTLED - Frame reward was claimed
//     *   UNCLAIMABLE - Frame has no lot that won
//     */
//     enum SFrame {NULL, OPENED, CLOSED, RATED, SETTLED}

//     struct Frame {
//         uint frameKey;
//         uint rate;
//         uint[] lotKeys;
//         //Reward claimed by user
//         address rewardClaimedBy;
//     }

//     //Frames
//     mapping(uint => Frame) public frames;
//     uint[] public framesKeys;

//     event FrameUpdate(Frame frame);

//     /* Lot enum
//     *   NULL - Lot is not created
//     *   TAKEN - Lot is taken
//     *   WON - Lot has won
//     *   LOST - Lot has lost
//     */

//     enum SLot {NULL, TAKEN, WON, LOST}

//     struct LotState {
//         uint timestamp;
//         address owner;
//         uint acquisitionPrice;
//         uint taxCharged;
//         uint taxRefunded;
//     }

//     struct Lot {
//         uint frameKey;
//         uint lotKey;
//         LotState[] states;
//     }

//     //Lots
//     //2 level mapping to store lots. 1 level mapping is frameKey, 2 level mapping is lotKey
//     mapping(uint => mapping(uint => Lot)) public lots;

//     event LotUpdate(Lot lot);

//     constructor(IERC20 _token) {
//         owner = msg.sender;
//         accountingToken = _token;
//     }

//     function getStateFrame(uint frameKey) public view returns (SFrame){
//         Frame memory frame = frames[frameKey];
//         //NULL If frame doesn't exist, return SFrame.NULL
//         if (frame.frameKey == 0) return SFrame.NULL;
//         //CLAIMED If reward is claimed, return SFrame.CLAIMED
//         if (frame.rewardClaimedBy != address(0)) return SFrame.SETTLED;
//         //OPENED If frameKey+period is in the future, return SFrame.OPENED
//         if (block.timestamp < frame.frameKey + period) return SFrame.OPENED;
//         // //If there is no lot that won, return SFrame.UNCLAIMABLE
//         // if (frame.rate > 0 && getStateLot(frameKey, clcLotKey(frame.rate)) == SLot.NULL) return SFrame.UNCLAIMABLE;
//         //RATED if average price is set, return SFrame.RATED
//         if (frame.rate > 0) return SFrame.RATED;
//         //CLOSED if no other condition is met, return SFrame.CLOSED
//         return SFrame.CLOSED;
//     }


//     function getStateLot(uint frameKey, uint lotKey) public view returns (SLot){
//         Lot memory lot = lots[frameKey][lotKey];
//         //NULL If lot doesn't exist, return SLot.NULL
//         if (lot.lotKey == 0) return SLot.NULL;
//         //If frame state is null, return SLot.NULL
//         if (getStateFrame(frameKey) == SFrame.NULL) return SLot.NULL;
//         //If frame state is OPENED or CLOSED, return SLot.TAKEN
//         if (getStateFrame(frameKey) == SFrame.OPENED || getStateFrame(frameKey) == SFrame.CLOSED) return SLot.TAKEN;
//         //Frame state is RATED decide if lot state is WON or LOST
//         //WON if frame average price is in interval of lot key and lotKey+dPrice
//         if (frames[lot.frameKey].rate >= lot.lotKey && frames[lot.frameKey].rate < lot.lotKey + dPrice) return SLot.WON;
//         //LOST if no other condition is met,
//         return SLot.LOST;
//     }

//     function clcFrameKey(uint timestamp) public view returns (uint){
//         if (timestamp <= initTimestamp) return initTimestamp;
//         return timestamp - ((timestamp - initTimestamp) % (period));
//     }

//     function clcLotKey(uint value) public view returns (uint){
//         if (value < dPrice) return dPrice;
//         //Division cast to uint rounds down
//         return value / (dPrice) * (dPrice);
//     }

//     function getFrame(uint frameKey) public view returns (Frame memory){
//         //Reject if frame doesn't exist
//         // require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
//         return (frames[frameKey]);
//     }

//     //For market getter
//     function getFrameLotKeys(uint frameKey) public view returns (uint[] memory){
//         return frames[frameKey].lotKeys;
//     }

//     function getLot(uint frameKey, uint lotKey) public view returns (Lot memory){
//         //Reject if lot doesn't exist
//         require(lots[frameKey][lotKey].lotKey != 0, "Lot doesn't exist");
//         return lots[frameKey][lotKey];
//     }

//     //Function to get lot states for market getter
//     function getLotStates(uint frameKey, uint lotKey) public view returns (LotState[] memory){
//         return lots[frameKey][lotKey].states;
//     }

//     function createFrame(uint timestamp) internal returns (Frame memory){
//         //Get frame's timestamp - frame key
//         uint frameKey = clcFrameKey(timestamp);
//         //Reject if frame already exists
//         require(frames[frameKey].frameKey == 0, "Frame already exists");
//         //Create frame
//         //Check if frame is in the future for at leas 1 period
//         console.log("SOL: frameKey: ", frameKey);
//         console.log("SOL: block.timestamp: ", block.timestamp);
//         console.log("SOL: block + period: ", block.timestamp + period);
//         require(frameKey >= clcFrameKey(block.timestamp + period), "Can't create frame in the past");
//         //Add frame
//         frames[frameKey].frameKey = frameKey;
//         framesKeys.push(frameKey);
//         return frames[frameKey];
//     }

//     function createLot(Frame memory frame, uint rate, address _owner, uint acquisitionPrice, uint taxCharged) internal returns (Lot memory){
//         //Reject if lot already exists
//         uint lotKey = clcLotKey(rate);
//         require(lots[frame.frameKey][lotKey].lotKey == 0, "Lot already exists");
//         //Reject if acquisitionPrice less than 0
//         require(acquisitionPrice > 0, "Acquisition price has to be greater than 0");
//         //Reject if taxCharged less than 0
//         require(taxCharged > 0, "Tax charged has to be greater than 0");
//         //Create lot
//         LotState memory state = LotState(block.timestamp, _owner, acquisitionPrice, taxCharged, 0);
//         LotState[] memory states = new LotState[](1);
//         states[0] = state;
//         lots[frame.frameKey][lotKey].frameKey = frame.frameKey;
//         lots[frame.frameKey][lotKey].lotKey = lotKey;
//         lots[frame.frameKey][lotKey].states.push(state);
        

//         //Add lot to frame
//         frames[frame.frameKey].lotKeys.push(lotKey);

//         return Lot(frame.frameKey, lotKey, states);
//     }

//     function updateLot(Lot memory lot, address _owner, uint acquisitionPrice, uint taxCharged, uint taxRefunded) internal returns (Lot memory){
//         //Reject if lot doesn't exist
//         require(lot.lotKey != 0, "Lot doesn't exist");
//         //Reject if acquisitionPrice less than 0
//         require(acquisitionPrice > 0, "Acquisition price has to be greater than 0");
//         //Update lot
//         LotState memory state = LotState(block.timestamp, _owner, acquisitionPrice, taxCharged, taxRefunded);
//         lots[lot.frameKey][lot.lotKey].states.push(state);
//         return lot;
//     }

//     function getLotsKeysInFrame(uint frameKey) public view returns (uint[] memory){
//         return frames[frameKey].lotKeys;
//     }

//     function overrideFrameRate(Frame memory frame, uint avgPrice) external {
//         //Only owner can update frame close price
//         require(msg.sender == owner, "Only owner can update frame close price");
//         //Frame must exist
//         require(frame.frameKey != 0, "Frame doesn't exist");
//         //Frame must not be in CLAIMED state
//         require(frame.rewardClaimedBy == address(0), "Frame reward was already claimed");
//         frames[frame.frameKey].rate = avgPrice;
//     }

//     //Calculate amount of tax to be collected from the owner of the lot
//     function clcTax(uint frameKey, uint acquisitionPrice) public view returns (uint tax) {
//         uint taxPerSecond = taxMarket.mul(acquisitionPrice).div(1e18) / period;
//         return ((frameKey + period) - block.timestamp) * taxPerSecond;
//     }

//     function clcFee(uint rewardFund) public view returns (uint fee) {
//         //Multiply reward fund by protocol fee, 18 decimals
//         fee = rewardFund.mul(feeProtocol).div(1e18);
//         return fee;
//     }

//     //Calculate reward fund for the frame from lots
//     function clcRewardFund(uint framekey) public view returns (uint) {
//         Frame memory frame = getFrame(framekey);
//         uint rewardFund = 0;
//         for (uint i = 0; i < frame.lotKeys.length; i++) {
//             Lot memory lot = lots[frame.frameKey][frame.lotKeys[i]];
//             for (uint j = 0; j < lot.states.length; j++) {
//                 //Add tax charged to the reward fund
//                 rewardFund += lot.states[j].taxCharged;
//                 //Subtract tax refunded from the reward fund
//                 rewardFund -= lot.states[j].taxRefunded;
//             }
//         }
//         return rewardFund;
//     }


//     function purchaseLot(uint timestamp, uint rate, uint acquisitionPrice) external returns (Lot memory){

        
//         //Calculate frame key
//         uint frameKey = clcFrameKey(timestamp);
        
//         //Get frame
//         Frame memory frame = getFrame(frameKey);
//         //print frame state with console.sol
//         //get frame state into stateFrame
//         SFrame stateFrame = getStateFrame(frame.frameKey);
//         if (stateFrame == SFrame.OPENED) {
//             console.log("Frame state: OPENED");
//         }if (stateFrame == SFrame.CLOSED) {
//             console.log("Frame state: CLOSED");
//         }if (stateFrame == SFrame.RATED) {
//             console.log("Frame state: RATED");
//         }if (stateFrame == SFrame.SETTLED) {
//             console.log("Frame state: SETTLED");
//         }if (stateFrame == SFrame.NULL) {
//             console.log("Frame state: NULL");
//         }
        
//         require(stateFrame == SFrame.OPENED || stateFrame == SFrame.NULL, "Frame is not opened for trading");
//         //If new lot is purchased
//         if (frame.frameKey == 0 ) {
//             frame = createFrame(timestamp);
//         }

//         //If lot is purchased for the first time
//         if (lots[frame.frameKey][clcLotKey(rate)].lotKey == 0){
//             uint lotKey = clcLotKey(rate);
//             Lot memory lot = purchaseLotFresh(frame, lotKey, acquisitionPrice);
//             emit LotUpdate(lot);
//             return lot;
//         }
        
//         if (frame.frameKey != 0) {
//             uint lotKey = clcLotKey(rate);
//             //Get Lot
//             Lot memory lot = getLot(frame.frameKey, lotKey);
//             //Get last LotState from Lot
//             LotState memory currentLotState = lot.states[lot.states.length - 1];

//             //If lot is updated with no owner change
//             if (msg.sender == currentLotState.owner) {
//                 lot = purchaseLotUpdatePrice(lot, acquisitionPrice);
//                 emit LotUpdate(lot);
//                 return lot;
//             }

//             //If lot is updated with owner change
//             if(msg.sender != currentLotState.owner){
//                 lot = purchaseLotOwnerChange(lot, msg.sender, acquisitionPrice);
//                 emit LotUpdate(lot);
//                 return lot;
//             }
                
//            return lot;
//         }
        
//         // return lot;
//     }

//     function purchaseLotFresh(Frame memory frame, uint lotKey, uint acquisitionPrice) internal returns (Lot memory){
//         //Calculate tax amount
//         uint tax = clcTax(frame.frameKey, acquisitionPrice);
//         //Tax has to be greater than 0
//         require(tax > 0, "Tax has to be greater than 0. Increase the acquisition price");
//         //Approved amount has to be at least equal to price of the
//         require(accountingToken.allowance(msg.sender, address(this)) >= tax, "Allowance to spend set too low");
//         //Transfer tax amount to the market contract
//         accountingToken.transferFrom(msg.sender, address(this), tax);
//         //Create new lot
//         return createLot(frame, lotKey, msg.sender, acquisitionPrice, tax);
//     }

//     function purchaseLotUpdatePrice(Lot memory lot, uint acquisitionPrice) internal returns (Lot memory){
//         //Check if new price is different from the current price
//         require(acquisitionPrice != lot.states[lot.states.length - 1].acquisitionPrice, "Price has to be different");
//         //Calculate tax amount
//         uint taxNew = clcTax(lot.frameKey, acquisitionPrice);
//         uint taxOld = clcTax(lot.frameKey, lot.states[lot.states.length - 1].acquisitionPrice);
//         //Tax has to be greater than 0
//         require(taxNew > 0, "Tax has to be greater than 0. Increase the acquisition price");
//         //Compare new tax and fee with old tax and fee
//         if (taxNew > taxOld) {
//             //Approved amount has to be at least equal to price of tax
//             require(accountingToken.allowance(msg.sender, address(this)) >= taxNew - taxOld, "Allowance to spend set too low");
//             //Transfer tax difference to the market contract
//             accountingToken.transferFrom(msg.sender, address(this), taxNew - taxOld);
//         }
//         else {
//             //Transfer tax difference to owner
//             accountingToken.transfer(msg.sender, taxOld - taxNew);
//         }

//         return updateLot(lot, msg.sender, acquisitionPrice, taxNew, taxOld - taxNew);
//     }
    
//     function purchaseLotOwnerChange(Lot memory lot, address _owner, uint acquisitionPrice) internal returns (Lot memory){
//         uint tax = clcTax(lot.frameKey, acquisitionPrice);
//         //Tax has to be greater than 0
//         require(tax > 0, "Tax has to be greater than 0. Increase the acquisition price");
//         //Approved amount has to be at least equal to price of tax + acquisitionPrice
//         require(accountingToken.allowance(msg.sender, address(this)) >= tax + acquisitionPrice, "Allowance to spend set too low");
//         //Transfer tax and acquisition price to the market contract
//         accountingToken.transferFrom(msg.sender, address(this), tax + acquisitionPrice);
//         //Calculate old owner tax
//         uint taxOld = clcTax(lot.frameKey, lot.states[lot.states.length - 1].acquisitionPrice);
//         //Pay the current owner + return leftover tax
//         accountingToken.transfer(lot.states[lot.states.length - 1].owner, lot.states[lot.states.length - 1].acquisitionPrice + taxOld - tax);

//         //updateLot with new owner
//         return updateLot(lot, _owner, acquisitionPrice, tax, taxOld);
//     }

//     function setFrameRate(uint frameKey) public {
//         //Frame has to be in state CLOSE
//         uint rate = clcRateAvg(frameKey);
//         //Frame must exist
//         require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
//         //Update frame
//         frames[frameKey].rate = rate;
//         emit FrameUpdate(frames[frameKey]);
//     }

//     function clcRateAvg(uint timestamp) public view returns(uint){
//         uint32 t1 = uint32(block.timestamp - timestamp + tReporting);
//         uint32 t2 = uint32(block.timestamp - timestamp);

//         // Create a dynamically-sized array for observe
//         uint32[] memory timeIntervals = new uint32[](2);
//         timeIntervals[0] = t1;
//         timeIntervals[1] = t2;

//         // Assuming observe returns cumulative price values directly
//         (int56[] memory tickCumulatives,) = uniswapPool.observe(timeIntervals);

//         // Calculate the tick difference and time elapsed
//         uint tickCumulativeDelta = uint(tickCumulatives[1]) - uint(tickCumulatives[0]);
//         uint timeElapsed = uint(t1) - uint(t2); // Ensure this calculation makes sense in your context

//         // Calculate the average tick
//         uint averageTick = tickCumulativeDelta.div(timeElapsed);

//         // Calculate the sqrtPriceX96 (Calculates sqrt(1.0001^tick) * 2^96) from the average tick with a fixed point Q64.96
//         uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(int24(averageTick));

//         // Step 1: Convert sqrtPriceX96 back to a regular price format by dividing by 2^96
//         // This reduces its magnitude, helping avoid overflow in subsequent steps
//         uint price = uint(sqrtPriceX96).div(2**48);

//         // Step 2: Square the price to get price squared (in regular format)
//         // Since 'price' is significantly smaller than 'sqrtPriceX96', this reduces the risk of overflow
//         uint256 priceSquared = price.mul(price);

//         // Step 3: Adjust for 18 decimal places if necessary
//         // Depending on your needs, this step may adjust 'priceSquared' to represent the final value in 18 decimals
//         uint256 priceIn18Decimals = priceSquared.mul(1e18).div(2**96);

//         return priceIn18Decimals;
//     }

//     function settleFrame(uint frameKey) public {
        
//         //Reject if frame is not in state RATED
//         require(getStateFrame(frameKey) == SFrame.RATED, "Frame does not have a close rate set");

//         //Calculate the winning lot key based on the frame's close rate
//         uint lotKeyWon = clcLotKey(frames[frameKey].rate);
//         //Reject if lot doesn't exist
//         require(getStateLot(frameKey, lotKeyWon) == SLot.WON, "Lot doesn't exist");

//         //Calculate reward fund for the frame
//         uint rewardFundPure = clcRewardFund(frameKey);
//         //Calculate protocol fee
//         uint fee = clcFee(rewardFundPure);
//         //Calculate reward fund for the frame after fee
//         uint rewardFund = rewardFundPure - fee;

//         //Transfer fee to the market owner
//         accountingToken.transfer(owner, fee);

//         //Get the winning lot
//         Lot memory lotWon = lots[frameKey][lotKeyWon];
//         LotState memory winningLotState = lotWon.states[lotWon.states.length - 1]; //last lot state
//         accountingToken.transfer(winningLotState.owner, rewardFund);
//         console.log("Owner: ", winningLotState.owner);
//         frames[frameKey].rewardClaimedBy = winningLotState.owner;

//         // Frame memory frame = frames[frameKey];

//         emit LotUpdate(lotWon);
//         emit FrameUpdate(frames[frameKey]);
//     }

//     function clcUnClaimableFunds() public view returns (uint){
//         uint unClaimableFunds = 0;
//         for (uint i = 0; i < framesKeys.length; i++) {
//             Frame memory frame = frames[framesKeys[i]];
//             //Frame has to be RATED
//             if (getStateFrame(frame.frameKey) == SFrame.RATED) {
//             //Frame must not have lot that won
//                 Lot memory lotWon = lots[frame.frameKey][clcLotKey(frame.rate)];
//                 if (getStateLot(frame.frameKey, lotWon.lotKey) != SLot.WON)
//                     unClaimableFunds += clcRewardFund(frame.frameKey);
//             }
//         }
//         return unClaimableFunds;
//     }

//     function withdrawAccountingToken(uint amount) external {
//         require(msg.sender == owner, "Only owner can withdraw accounting token");
//         accountingToken.transfer(owner, amount);
//     }
// }