// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
//pragma experimental ABIEncoderV2;

import "./MarketFactory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/libraries/UQ112x112.sol";


/// @title TWPM Market
/// @author UniHedge
/// @dev All function calls are currently implemented without side effects
contract Market {
    using UQ112x112 for uint224;
    //Length of a frame
    uint public period; //64b -- Data packing into storage slots (1 slot = 32 bytes) --> 4*64b = 32 bytes
    //Contract creation time
    uint public initTimestamp; //64b
    //Protocol fee
    uint public feeProtocol = 100; //64b
    //Reporting time for pair price
    uint public tReporting; //64b
    //Token pair on Uniswap
    IUniswapV2Pair public uniswapPair; //256b
    //Range of a lot
    uint public dPrice; //256b
    //Fee that gets to market owner
    uint public feeMarket; //256b
    //Tax on lots
    uint public taxMarket; //256b
    //Contract for creating markets
    MarketFactory public factory; //256b
    //ERC20 token used for buyng lots in this contract 
    IERC20 public accountingToken; //256b
    //Owner of this market
    address public ownerMarket; //256b
    //Minimal lot tax per frame
    uint public minTax; //256b
    //Scalar number used for calculating precentages
    uint scalar = 1e24; //256b

    enum SFrame {NULL, OPENED, CLOSED}
    struct Frame {
        uint frameKey; 
        uint oracleTimestampStart;
        uint oracleTimestampEnd;
        //uint lastBlockNum; 
        uint priceAverage;
        uint rewardFund;
        uint oraclePrice0CumulativeStart;
        uint oraclePrice0CumulativeEnd;
        SFrame state;
        uint[] lotKeys;
        mapping(uint => Lot) lots;
    }

    event FrameUpdate(uint frameKey, uint oracleTimestampStart, uint oracleTimestampEnd, uint oraclePrice0CumulativeStart, uint oraclePrice0CumulativeEnd, uint rewardFund);

    mapping(uint => Frame) public frames;
    mapping(address => uint[]) public userFrames;
    uint[] public framesKeys;

    enum SLot {NULL, BOUGHT, SETTLED}
    struct Lot {
        uint lotKey;
        address lotOwner;
        uint acquisitionPrice;
        SLot state;
    }

    event LotUpdate(uint frameKey, Lot lotStruct);

    constructor(MarketFactory _factory, IERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _initTimestamp, uint _taxMarket, uint _feeMarket, uint _dPrice, uint _tReporting, uint _minTax) {
        accountingToken = _token;
        ownerMarket = payable(msg.sender);
        period = _period;
        initTimestamp = _initTimestamp; 
        taxMarket = _taxMarket;
        feeMarket = _feeMarket;
        uniswapPair = _uniswapPair;
        dPrice = _dPrice;
        factory = _factory;
        tReporting = _tReporting;
        minTax = _minTax;
    }

    modifier minTaxCheck(uint acqPrice) {
        uint tax = acqPrice * (taxMarket) / (100000);
        require(tax >= minTax, "PRICE IS TOO LOW");
        _;
    }

    modifier isFactoryOwner() {
        require(msg.sender == factory.owner(), "NOT THE FACTORY OWNER");
        _;
    }

    modifier hasValidPrices(uint frameKey) {
        //require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        if (frames[frameKey].oraclePrice0CumulativeStart <= 0 || frames[frameKey].oraclePrice0CumulativeEnd <= 0) {
            //frames[framekey].state = SFrame.INVALID;
            revert("INVALID FRAME PRICE");
        }
        if (frames[frameKey].oraclePrice0CumulativeStart == frames[frameKey].oraclePrice0CumulativeEnd) {
            //frames[framekey].state = SFrame.INVALID;
            revert("INVALID FRAME PRICE");
        }
        _;
    }

    /// @notice Calculate frames timestamp (beggining of frame)
    /// @param timestamp In seconds
    /// @return frame's timestamp (key)
    function clcFrameTimestamp(uint timestamp) public view returns (uint){
        if (timestamp <= initTimestamp) return initTimestamp;
        return timestamp - ((timestamp - (initTimestamp)) % (period));
    }
    
    /// @notice Calculate top boundary of a lot
    /// @param value Arbitary price of market's Uniswap pair
    /// @return lot key (top boundary)
    function clcLotInterval(uint value) public view returns (uint){
        if (value <= 0) return dPrice;
        return value / (dPrice) * (dPrice);
    }

    /// @notice Calculate how many frames there are left untill given frame in input
    /// @param frameKey Timestamp of an arbitary frame in the future
    /// @return number of frames (whole numbers: n=0,1,2...)
    function clcFramesLeft(uint frameKey) internal view returns (uint){     
        if (frameKey == clcFrameTimestamp(block.timestamp)) return 0;                 
        return (((frameKey - (block.timestamp)) / period));
    }

    /// @notice Calculate average price of a frame
    /// @param frameKey Timestamp of an arbitary frame 
    /// @return avgPrice Time weighted aveage price
    function clcPrice(uint frameKey) public hasValidPrices(frameKey) view returns(uint avgPrice) {       
        // uint priceDiff = frames[frameKey].oraclePrice0CumulativeEnd - frames[frameKey].oraclePrice0CumulativeStart;
        // uint timeDiff = frames[frameKey].oracleTimestampEnd - frames[frameKey].oracleTimestampStart;
        // avgPrice = uint(((FixedPoint.div(FixedPoint.uq112x112(uint224(priceDiff)), (uint112(timeDiff)))))._x);
        // avgPrice = (avgPrice >> 112) * scalar + (avgPrice << 112) / (1e49);

        avgPrice = uint(UQ112x112.encode(uint112(frames[frameKey].oraclePrice0CumulativeEnd)).uqdiv(uint112(frames[frameKey].oraclePrice0CumulativeStart)));

    }

    /// @notice Calculate amount required to approve to buy a lot
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return cmpltAmnt complete price of a lot
    function clcAmountToApprove(uint timestamp, uint pairPrice, uint acqPrice) public view returns (uint cmpltAmnt) {    
        uint frameKey = clcFrameTimestamp(timestamp); 
        //Check if the lot is in a current or future frame, otherwise the calculation results in an overflow/underflow.
        require(frameKey >= clcFrameTimestamp(block.timestamp), "THIS LOT IS IN A PAST FRAME");        
        uint lotKey = clcLotInterval(pairPrice);
        uint tax = clcTax(frameKey, acqPrice);
        cmpltAmnt = frames[frameKey].lots[lotKey].acquisitionPrice + tax;
        return cmpltAmnt;
    }

    /// @notice Calculate amount required to change lot's price.
    /// @dev Calculate difference in tax values with old and new acquisition price
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return amnt complete price of a lot
    function clcAmountToApproveForUpdate(uint timestamp, uint pairPrice, uint acqPrice) public view returns (uint amnt) {   
        uint frameKey = clcFrameTimestamp(timestamp);
        //require(frameKey >= clcFrameTimestamp(block.timestamp), "THIS LOT IS IN A PAST FRAME");   
        uint lotKey = clcLotInterval(pairPrice);
        uint tax1 = clcTax(frameKey, frames[frameKey].lots[lotKey].acquisitionPrice);
        uint tax2 = clcTax(frameKey, acqPrice);
        if(tax1 >= tax2) amnt = 0;
        else amnt = tax2-tax1;
        return amnt;
    }

    /// @notice Get created and still open frames
    /// @dev You can't get (current) frame's index in the framesKeys array,
    /// @dev so for loop through the whole array is needed
    /// @dev other option would be with additional parameter: startIndex
    /// @param numOfFrames Timestamp that determins which frame it is
    /// @return uint[] array of frame keys
    function getOpenFrameKeys(uint startFrame, uint numOfFrames) public view returns (uint[] memory){
        uint[] memory openFrames = new uint[](numOfFrames);
        for(uint i = 0; i <= numOfFrames; i++) {
            uint frameKey = startFrame+(period*i);
            if(frames[frameKey].state != SFrame.NULL) {
                openFrames[i] = frameKey;
            }
        }
        return openFrames;
    }

    // function getUserLots(address user) public view returns (Lot[] memory){
    //     uint currentFrame = clcFrameTimestamp(block.timestamp);
    //     Lot[] memory userLots = new Lot[](100);
    //     Lot memory lot;
        
    //     for(uint i = 0; i <= 50; i++) {
    //         uint frameKey = (currentFrame + period*i);
    //         for (uint j=0; j<=frames[frameKey].lotKeys.length-1; j++) {
    //             lot = frames[frameKey].lots[j];
    //             if(lot.lotOwner == user) userLots[i] = lot;
    //         }
    //     }

    //     // for(uint i = 1; i <=50; i++) {
    //     //     uint frameKey = (currentFrame - period*i);
    //     //     for (uint j=0; j<=frames[frameKey].lotKeys.length-1; j++) {
    //     //         lot = frames[frameKey].lots[j];
    //     //         if(lot.lotOwner == user) userLots[i] = lot;
    //     //     }
    //     // }

    //     return userLots;
    // }

    /// @notice Get number of frame's that the address has bought lots in
    /// @param user User's address
    /// @return number of frames
    function getNumOfUserFrames(address user) public view returns (uint){
        return userFrames[user].length;
    }

    /// @notice Get frame's that the address has bought lots in
    /// @param user User's address
    /// @return frame keys
    function getUserFrames(address user) public view returns(uint[] memory)  {
        return userFrames[user];
    }

    /// @notice Get lot struct
    /// @param frameKey Frame's timestamp
    /// @param lotKey lot's key 
    /// @return lot struct
    function getLot(uint frameKey, uint lotKey) public view returns (Lot memory){                 
        return frames[frameKey].lots[lotKey];
    }

    /// @notice Get no. of created lots in a frame 
    /// @param frameKey Frame's timestamp
    /// @return lot count
    function getLotsCount(uint frameKey) public view returns (uint){                 
        return frames[frameKey].lotKeys.length;
    }

    /// @notice Get lotKey from index in lotKeys array
    /// @param frameKey Frame's timestamp
    /// @param index frameKeys array index 
    /// @return lotKey
    function getLotKey(uint frameKey, uint index) public view returns (uint){                 
        return frames[frameKey].lotKeys[index];
    }

    /// @notice Get frame's award amount (accumulation of different lot taxes)
    /// @notice Remaining tax of a lot owner get's returned after a sale (change of ownership). So the award amount isn't for sure untill the frame get's closed.
    /// @param frameKey Frame's timestamp
    /// @return award amount
    function getRewardAmount(uint frameKey) public view returns (uint) {                         
        return frames[frameKey].rewardFund; 
    }

    /// @notice Get number of frames
    /// @return number frames
    function getNumberOfFrameKeys() public view returns (uint){
        return framesKeys.length;
    }

    /// @notice Create a frame
    /// @param timestamp In second.
    /// @return frameTimestamp Frame's key (timestamp that indicated the beggining of a frame).
    function getOrCreateFrame(uint timestamp) internal returns (uint){
        //Get frame's timestamp - frame key
        uint frameKey = clcFrameTimestamp(timestamp);
        //Check if frame exists
        if (frames[frameKey].state != SFrame.NULL) return frameKey;
        require(frameKey >= clcFrameTimestamp(block.timestamp), "CANT CREATE FRAME IN PAST");
        //Add frame
        frames[frameKey].frameKey = frameKey;
        frames[frameKey].state = SFrame.OPENED;
        framesKeys.push(frameKey);
        return frameKey;
    }

    /// @notice Create a lot
    /// @param frameKey Frame's timestamp
    /// @param pairPrice Price is the trading pair's price
    /// @return lotKey
    function getOrCreateLot(uint frameKey, uint pairPrice) internal returns(uint){
        uint lotKey = clcLotInterval(pairPrice);
        if (frames[frameKey].lots[lotKey].state != SLot.NULL) return lotKey;
        frames[frameKey].lots[lotKey].lotKey = lotKey;
        frames[frameKey].lotKeys.push(lotKey);
        return lotKey;
    }

    function clcTax(uint frameKey, uint acquisitionPrice) internal view returns (uint tax) {             
        uint dFrame = (clcFrameTimestamp(block.timestamp) + (period)) - (block.timestamp); 
        uint dFrameP = scalar * dFrame / (period);
        //Calculate tax from the proposed acquisition price 
        uint numOfFramesLeft = clcFramesLeft(frameKey);
        tax = acquisitionPrice * taxMarket / 100000 * numOfFramesLeft;
        uint dtax = acquisitionPrice * taxMarket / 100000;
        dtax = dtax * dFrameP / scalar;
        tax = tax + dtax;
        return tax;
    }

    /// @notice Calculate amout required to approve to buy a lot
    /// @param timestamp Frame's timestamp get's calculated from this value
    /// @param pairPrice Is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    function buyLot(uint timestamp, uint pairPrice, uint acqPrice) public minTaxCheck(acqPrice) {
        //Get frameKey and lotKey values
        uint frameKey =  getOrCreateFrame(timestamp);                          
        uint lotKey = getOrCreateLot(frameKey, pairPrice);
        require(frameKey >= clcFrameTimestamp(block.timestamp), "CAN'T BUY A LOT FROM THE PAST");
        require(msg.sender != frames[frameKey].lots[lotKey].lotOwner, "ADDRESS ALREADY OWNS THE PARCEL");

        uint tax = clcTax(frameKey, acqPrice);

        //Approved amount has to be at leat equal to price of the Lot(with tax)
        require(accountingToken.allowance(msg.sender, address(this)) >= (frames[frameKey].lots[lotKey].acquisitionPrice + tax), "APPROVED AMOUNT IS TOO SMALL");
        //Transfer tax amount to the market contract
        accountingToken.transferFrom(msg.sender, address(this), (frames[frameKey].lots[lotKey].acquisitionPrice + tax));
        frames[frameKey].rewardFund = (frames[frameKey].rewardFund + tax);

        //Pay the current owner + return leftover tax
        if (frames[frameKey].lots[lotKey].state == SLot.BOUGHT) {
            uint taxRetrn = clcTax(frameKey, frames[frameKey].lots[lotKey].acquisitionPrice);
            //transfer funds
            accountingToken.transfer(frames[frameKey].lots[lotKey].lotOwner, (taxRetrn + frames[frameKey].lots[lotKey].acquisitionPrice));
            //update reward fund
            frames[frameKey].rewardFund = frames[frameKey].rewardFund - taxRetrn;
        }
        else {
            frames[frameKey].lots[lotKey].state = SLot.BOUGHT;
        }
       //Update lotKey values
        frames[frameKey].lots[lotKey].lotOwner = msg.sender;
        frames[frameKey].lots[lotKey].acquisitionPrice = acqPrice;
        userFrames[msg.sender].push(frameKey);

        //updateFramePrices();

        emit FrameUpdate(frameKey, 
                         frames[frameKey].oracleTimestampStart,
                         frames[frameKey].oracleTimestampEnd,
                         frames[frameKey].oraclePrice0CumulativeStart,
                         frames[frameKey].oraclePrice0CumulativeEnd,
                         frames[frameKey].rewardFund);
        emit LotUpdate(frameKey, frames[frameKey].lots[lotKey]);
    }

    /// @notice Owner can update lot's price. Has to pay additional tax, or leftover tax gets' returned to him if the new price is lower
    /// @param timestamp Frame's timestamp get's calculated from this value
    /// @param pairPrice Is trading pair's price (to get correct lot key) 
    /// @param acqPrice New acquisition price
    function updateLotPrice(uint timestamp, uint pairPrice, uint acqPrice) public minTaxCheck(acqPrice) {
        uint frameKey = getOrCreateFrame(timestamp); 
        uint lotKey = getOrCreateLot(frameKey, pairPrice); 
        require(frames[frameKey].lots[lotKey].lotOwner == msg.sender, "MUST BE LOT OWNER");
        require(frameKey >= clcFrameTimestamp(block.timestamp), "THIS LOT IS IN A TIME FRAME FROM THE PAST");

        uint taxNew = clcTax(frameKey, acqPrice);
        uint taxOld = clcTax(frameKey, frames[frameKey].lots[lotKey].acquisitionPrice);

        if (taxNew > taxOld) {
            require(accountingToken.allowance(msg.sender, address(this)) >= (taxNew - taxOld), "APPROVED AMOUNT IS TOO SMALL");
            //Transfer complete tax amount to the frame rewardFund
            accountingToken.transferFrom(msg.sender, address(this), (taxNew - taxOld));
            frames[frameKey].rewardFund = frames[frameKey].rewardFund + (taxNew- taxOld);
        }
        else if (taxNew < taxOld) {
            accountingToken.transfer(msg.sender, taxOld - taxNew);
            frames[frameKey].rewardFund = frames[frameKey].rewardFund - (taxOld - taxNew);
        }
        frames[frameKey].lots[lotKey].acquisitionPrice = acqPrice;

        //updateFramePrices();
        emit LotUpdate(frameKey, frames[frameKey].lots[lotKey]);
    }

    /// @notice Update trading pair's prices in the frame
    function updateFramePrices() public {
        //uint tmp;
        uint frameKey = clcFrameTimestamp(block.timestamp);
        //frames[frameKey].lastBlockNum = block.number;
        //Correct price if outside settle interval
        if (block.timestamp < ((frameKey + (period)) - (tReporting))) {
            (frames[frameKey].oraclePrice0CumulativeStart, frames[frameKey].oraclePrice0CumulativeEnd, frames[frameKey].oracleTimestampStart) = uniswapPair.getReserves();
            //(frames[frameKey].oraclePrice0CumulativeEnd, tmp, frames[frameKey].oracleTimestampEnd) = uniswapPair.getReserves();
            emit FrameUpdate(frameKey, 
                         frames[frameKey].oracleTimestampStart,
                         frames[frameKey].oracleTimestampEnd,
                         frames[frameKey].oraclePrice0CumulativeStart,
                         frames[frameKey].oraclePrice0CumulativeEnd,
                         frames[frameKey].rewardFund);
        }
        else if (block.timestamp >= ((frameKey + (period)) - (tReporting))) {
            (frames[frameKey].oraclePrice0CumulativeStart, frames[frameKey].oraclePrice0CumulativeEnd, frames[frameKey].oracleTimestampStart) = uniswapPair.getReserves();
            emit FrameUpdate(frameKey, 
                         frames[frameKey].oracleTimestampStart,
                         frames[frameKey].oracleTimestampEnd,
                         frames[frameKey].oraclePrice0CumulativeStart,
                         frames[frameKey].oraclePrice0CumulativeEnd,
                         frames[frameKey].rewardFund);
        }
    }

    function getFramePrice(uint frameKey) public view returns(uint, uint) {       
        return (frames[frameKey].oraclePrice0CumulativeStart,
                frames[frameKey].oraclePrice0CumulativeEnd);
    }
    

    // /// @notice Update trading pair's prices in the frame
    // /// @param PriceCumulative Cumulative price
    // /// @dev For developement purposes the new price is added as an input
    // /// @dev Final version should use uniswap's oracles
    // function updateFramePrices(uint PriceCumulative) public {
    //     uint frameKey = clcFrameTimestamp(uint(block.timestamp));
    //     //Correct price if outside settle interval
    //     if (block.timestamp < ((frameKey + (period)) - (tReporting))) {
    //         frames[frameKey].oraclePrice0CumulativeStart = PriceCumulative;
    //         frames[frameKey].oracleTimestampStart = uint(block.timestamp);
    //             frames[frameKey].oraclePrice0CumulativeEnd = PriceCumulative;
    //         frames[frameKey].oracleTimestampEnd = uint(block.timestamp);
    //         emit FrameUpdate(frameKey, 
    //                      frames[frameKey].oracleTimestampStart,
    //                      frames[frameKey].oracleTimestampEnd,
    //                      frames[frameKey].oraclePrice0CumulativeStart,
    //                      frames[frameKey].oraclePrice0CumulativeEnd,
    //                      frames[frameKey].rewardFund);
    //     }
    //     else if (block.timestamp >= ((frameKey + (period)) - (tReporting))) {
    //         frames[frameKey].oraclePrice0CumulativeEnd = PriceCumulative;
    //         frames[frameKey].oracleTimestampEnd = uint(block.timestamp);
    //         emit FrameUpdate(frameKey, 
    //                      frames[frameKey].oracleTimestampStart,
    //                      frames[frameKey].oracleTimestampEnd,
    //                      frames[frameKey].oraclePrice0CumulativeStart,
    //                      frames[frameKey].oraclePrice0CumulativeEnd,
    //                      frames[frameKey].rewardFund);
    //     }
    // }

    // temporarly removed hasValidPrices(frameKey)
    // TODO: Change back to internal
    /// @notice Close frame
    /// @param frameKey Frame's timestamp
    function closeFrame(uint frameKey) public {
        require( (frameKey + period) <= block.timestamp, "FRAME END TIME NOT REACHED");
        frames[frameKey].state = SFrame.CLOSED;
        //UQ112x112 encoded
        //uint priceDiff = frames[frameKey].oraclePrice0CumulativeEnd - frames[frameKey].oraclePrice0CumulativeStart;
        //uint timeDiff = frames[frameKey].oracleTimestampEnd - frames[frameKey].oracleTimestampStart;
        //Calculate time-weighted average price -- UQ112x112 encoded
        //frames[frameKey].priceAverage = uint(((FixedPoint.div(FixedPoint.uq112x112(uint224(priceDiff)), (uint112(timeDiff)))))._x);
        frames[frameKey].priceAverage = uint(UQ112x112.encode(uint112(frames[frameKey].oraclePrice0CumulativeEnd)).uqdiv(uint112(frames[frameKey].oraclePrice0CumulativeStart)));
        //Decode to scalar value
        //frames[frameKey].priceAverage = (frames[frameKey].priceAverage >> 112) * scalar + (frames[frameKey].priceAverage << 112) / (1e49); 
        //Subtract fees from the reward amount 
        uint marketOwnerFees = frames[frameKey].rewardFund * (feeMarket) / 100000;
        uint protocolOwnerFees = frames[frameKey].rewardFund * (feeProtocol) / 100000;
        frames[frameKey].rewardFund = frames[frameKey].rewardFund - marketOwnerFees - protocolOwnerFees;
        //Transfer fees to owners
        accountingToken.transfer(ownerMarket, marketOwnerFees);
        accountingToken.transfer(factory.owner(), protocolOwnerFees);
        emit FrameUpdate(frameKey, 
                         frames[frameKey].oracleTimestampStart,
                         frames[frameKey].oracleTimestampEnd,
                         frames[frameKey].oraclePrice0CumulativeStart,
                         frames[frameKey].oraclePrice0CumulativeEnd,
                         frames[frameKey].rewardFund);
    }

    /// @notice Settle lot for a owner. Owner's share of the reward amount get's transfered to owner's account
    /// @param frameKey Frame's timestamp
    function settleLot(uint frameKey) internal {  
        //Check if frame is closed
        require(frames[frameKey].state == SFrame.CLOSED, "FRAME NOT CLOSED");    
        //Calcualte the winning lot key
        uint lotKeyWin = (clcLotInterval(frames[frameKey].priceAverage));
        //Check if the lot is already settled
        require(frames[frameKey].lots[lotKeyWin].state != SLot.SETTLED, "LOT ALREADY SETTLED");
        //Transfer winnings to last owner 
        accountingToken.transfer(frames[frameKey].lots[lotKeyWin].lotOwner, frames[frameKey].rewardFund);
        //State is changed to settled
        frames[frameKey].lots[lotKeyWin].state = SLot.SETTLED;

        emit LotUpdate(frameKey, frames[frameKey].lots[lotKeyWin]);
    }

    /// @notice User can claim the reward if he owns the winning lot
    /// @param frameKey Frame's timestamp
    function claimReward(uint frameKey) public {
        closeFrame(frameKey);
        settleLot(frameKey);
    }

    /// @notice Withdraw any amount out of the contract. Only to be used in extreme cases!
    /// @param amount Amount you want to withdraw
    function emptyFunds(uint amount) public isFactoryOwner {  
        accountingToken.transfer(factory.owner(), amount);
    }


}