// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
//pragma experimental ABIEncoderV2;

import "./MarketFactory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/// @title TWPM Market
/// @author UniHedge
/// @dev All function calls are currently implemented without side effects
contract Market {

    using SafeMath for uint;
    //Contract for creating markets
    MarketFactory public factory;
    //ERC20 token used for buyng lots in this contract 
    IERC20 public accountingToken;
    //Owner of this market
    address payable public ownerMarket;
    //Length of a frame
    uint public period;
    //Contract creation time
    uint public initTimestamp; 
    //Token pair on Uniswap
    IUniswapV2Pair public uniswapPair;
    //Range of a lot
    uint public dPrice;
    //Fee that gets to market owner
    uint public feeMarket;
    //Tax on lots
    uint public taxMarket;
    //Protocol fee
    uint public feeProtocol = 100;
    //Reporting time for pair price
    uint public tReporting;
    //Minimal lot tax per frame
    uint public minTax;
    //Scalar number used for calculating precentages
    uint scalar = 1e24;

    enum SFrame {NULL, OPENED, CLOSED, INVALID}
    struct Frame {
        uint frameKey;
        SFrame state;
        uint priceAverage;
        uint rewardFund;
        uint oraclePrice0CumulativeStart;
        uint oraclePrice0CumulativeEnd;
        uint oracleTimestampStart;
        uint oracleTimestampEnd;
        uint lastBlockNum;
        mapping(uint => Lot) lots;
        uint[] lotKeys;
    }

    event FrameUpdate(uint frameKey);

    mapping(uint => Frame) public frames;
    uint[] public framesKeys;

    struct LotOwner {
        address payable owner;
        uint blockNum;
    }

    enum SLot {NULL, BOUGHT, SETTLED}
    struct Lot {
        uint lotKey;
        LotOwner[] lotOwners;
        uint acquisitionPrice;
        SLot state;
    }

    event LotUpdate(uint frameKey, uint lotKey);

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
        uint tax = acqPrice.mul(taxMarket).div(100000);
        require(tax >= minTax, "PRICE IS TOO LOW");
        _;
    }

    /// @notice Create a frame
    /// @param timestamp In second.
    /// @return frameTimestamp Frame's key (timestamp that indicated the beggining of a frame).
    function getOrCreateFrame(uint timestamp) public returns (uint){
        require(timestamp >= initTimestamp, "TIMESTAMP BEFORE INITIAL TIMESTAMP OF MARKET");
        //Get start timestamp of a frame
        uint frameTimestamp = clcFrameTimestamp(timestamp);
        //Check if frame exists
        if (frames[frameTimestamp].state != SFrame.NULL) return frameTimestamp;
        //Check if frame startLot number is before current Lot number
        require(frameTimestamp >= clcFrameTimestamp(block.timestamp), "CAN'T CREATE FRAME IN PAST");
        //Add frame
        frames[frameTimestamp].frameKey = frameTimestamp;
        frames[frameTimestamp].state = SFrame.OPENED; //check if other parameters are at zero
        framesKeys.push(frameTimestamp);
        emit FrameUpdate(frameTimestamp);
        return frameTimestamp;
    }

    /// @notice Calculate frames timestamp (beggining of frame)
    /// @param timestamp In seconds
    /// @return frame's timestamp (key)
    function clcFrameTimestamp(uint timestamp) public view returns (uint){
        if (timestamp <= initTimestamp) return initTimestamp;
        return timestamp.sub((timestamp.sub(initTimestamp)).mod(period));
    }

    /// @notice Calculate top boundary of a lot
    /// @param value Arbitary price of market's Uniswap pair
    /// @return lot key (top boundary)
    function clcLotInterval(uint value) public view returns (uint){
        if (value <= 0) return dPrice;
        return value.div(dPrice).mul(dPrice).add(dPrice);
    }

    /// @notice Calculate how many frames there are left untill given frame in input
    /// @param frameKey Timestamp of an arbitary frame in the future
    /// @return number of frames (whole numbers: n=0,1,2...)
    function clcFramesLeft(uint frameKey) public view returns (uint){                      
        return (frameKey.sub(block.timestamp)).div(period).add(1);
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

    /// @notice Get lot's owner
    /// @param frameKey Frame's timestamp
    /// @param lotKey Lot's key 
    /// @return lot's owner
    function getLotOwner(uint frameKey, uint lotKey) public view returns (address){ 
        if (getNumberOfLotOwners(frameKey, lotKey) == 0) return address(this);
        return frames[frameKey].lots[lotKey].lotOwners[getNumberOfLotOwners(frameKey, lotKey).sub(1)].owner;
    }

    /// @notice Get frame's award amount (accumulation of different lot taxes)
    /// @notice Remaining tax of a lot owner get's returned after a sale (change of ownership). So the award amount isn't for sure untill the frame get's closed.
    /// @param frameKey Frame's timestamp
    /// @return award amount
    function getRewardAmount(uint frameKey) public view returns (uint) {                         
        return frames[frameKey].rewardFund; 
    }

    /// @notice Get number of accounts that owned a specific lot
    /// @param frameKey Frame's timestamp
    /// @param lotKey Lot's key 
    /// @return number of owners
    function getNumberOfLotOwners(uint frameKey, uint lotKey) public view returns (uint){
        return frames[frameKey].lots[lotKey].lotOwners.length;
    }

    /// @notice Get number of frames
    /// @return number frames
    function getNumberOfFrameKeys() public view returns (uint){
        return framesKeys.length ;
    }

    /// @notice Calculate lot owner's index in the array of owners of the lot
    /// @param frameKey Frame's timestamp
    /// @param lotKey Lot's key 
    /// @param owner Owners account address
    /// @return i owner's index
    function getLotOwnerIndex(uint frameKey, uint lotKey, address owner) public view returns (uint i) {   
        for (i=0; i< getNumberOfLotOwners(frameKey, lotKey); i++) {
            if (frames[frameKey].lots[lotKey].lotOwners[i].owner == owner) return i;
        }
        revert("OWNER DOES NOT EXIST");
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

    //TODO: Run extensive tests on tax calculations
    /// @notice Calculate amout required to approve to buy a lot
    /// @param frameKey Frame's timestamp
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acquisitionPrice New sell price is required to calculate tax
    /// @return amoun to approve
    function AmountToApprove(uint frameKey, uint pairPrice, uint acquisitionPrice) public view returns (uint) {             
        uint lotKey = clcLotInterval(pairPrice);
        uint dFrame = (clcFrameTimestamp(block.timestamp.add(period))).sub(block.timestamp); 
        uint dFrameP = scalar.mul(dFrame).div(period);
        //Calculate tax from the propoed new price (acquisitionPrice)
        uint numOfFramesLeft = clcFramesLeft(frameKey);
        uint tax = acquisitionPrice.mul(taxMarket).div(100000).mul(numOfFramesLeft);
        uint dtax = acquisitionPrice.mul(taxMarket).div(100000);
        dtax = dtax.mul(dFrameP).div(scalar);
        tax = tax.add(dtax);
        uint amount = frames[frameKey].lots[lotKey].acquisitionPrice.add(tax);
        return amount;
    }

    /// @notice Calculate amout required to approve to buy a lot
    /// @param timestamp Frame's timestamp get's calculated from this value
    /// @param pairPrice Is trading pair's price (to get correct lot key) 
    /// @param acquisitionPrice New sell price is required to calculate tax
    function buyLot(uint timestamp, uint pairPrice, uint acquisitionPrice) public payable minTaxCheck(acquisitionPrice) {
        uint frameKey =  getOrCreateFrame(timestamp);                          
        uint lotKey = getOrCreateLot(frameKey, pairPrice);
        require(msg.sender != getLotOwner(frameKey, lotKey), "ADDRESS ALREADY OWNS THE PARCEL");
        uint dFrame = block.timestamp.sub(clcFrameTimestamp(block.timestamp));
        uint dFrameP = scalar.mul(dFrame).div(period);
        uint dtax = acquisitionPrice.mul(taxMarket).div(100000).mul(dFrameP).div(scalar);
        //Calculate tax from the proposed new price (acquisitionPrice)
        uint numOfFramesLeft = clcFramesLeft(timestamp);
        uint tax = acquisitionPrice.mul(taxMarket).div(100000).mul(numOfFramesLeft);
        tax = tax.add(dtax);
        //Approved amount has to be at leat equal to price of the Lot(with tax)
        require(accountingToken.allowance(msg.sender, address(this)) >= frames[frameKey].lots[lotKey].acquisitionPrice.add(tax), "APPROVED AMOUNT IS TOO SMALL");
        //Transfer complete tax amount to the frame rewardFund
        accountingToken.transferFrom(msg.sender, address(this), frames[frameKey].lots[lotKey].acquisitionPrice.add(tax));
        frames[frameKey].rewardFund = frames[frameKey].rewardFund.add(tax);

        //Pay the Lot price to current owner + return tax
        if (frames[frameKey].lots[lotKey].state == SLot.BOUGHT) {
            //Calculate tax to return. acquisitionPrice/marketTax * number_of_frames_left:
            uint aPrice = frames[frameKey].lots[lotKey].acquisitionPrice;
            uint dFrameTax = aPrice.mul(taxMarket).div(100000).mul(dFrameP).div(scalar);
            uint taxToReturn = aPrice.mul(taxMarket).div(100000).mul(numOfFramesLeft);
            taxToReturn = taxToReturn.add(dFrameTax);
            //add acquisition price valut to left over tax
            uint amount = (taxToReturn.add(frames[frameKey].lots[lotKey].acquisitionPrice));
            //transfer funds
            uint previousOwner = getNumberOfLotOwners(frameKey, lotKey).sub(1);
            accountingToken.transfer(frames[frameKey].lots[lotKey].lotOwners[previousOwner].owner, amount);
            //change reward value
            frames[frameKey].rewardFund = frames[frameKey].rewardFund.sub(taxToReturn);
        }
       
        frames[frameKey].lots[lotKey].lotOwners.push(LotOwner(payable(msg.sender), block.number));
        frames[frameKey].lots[lotKey].state = SLot.BOUGHT;
        frames[frameKey].lots[lotKey].acquisitionPrice = acquisitionPrice;
    }

    /// @notice Owner can update lot's price. Has to pay additional tax, or leftover tax gets' returned to him if the new price is lower
    /// @param timestamp Frame's timestamp get's calculated from this value
    /// @param pairPrice Is trading pair's price (to get correct lot key) 
    /// @param acquisitionPrice New acquisition price
    function updateLotPrice(uint timestamp, uint pairPrice, uint acquisitionPrice) public payable minTaxCheck(acquisitionPrice) {
        uint frameKey =  getOrCreateFrame(timestamp); 
        uint lotKey = getOrCreateLot(frameKey, pairPrice); 
        
        require(getLotOwner(frameKey, lotKey) == msg.sender, "THIS ADDRESS IS NOT THE OWNER");
                      
        uint numOfFramesLeft = clcFramesLeft(timestamp);

        uint dFrame = block.timestamp.sub(clcFrameTimestamp(block.timestamp));
        uint dFrameP = scalar.mul(dFrame).div(period);
        uint dtax = acquisitionPrice.mul(taxMarket).div(100000).mul(dFrameP);
        dtax = dtax.div(scalar);

        uint taxNew = acquisitionPrice.mul(taxMarket).div(100000);
        taxNew = taxNew.mul(numOfFramesLeft);
        taxNew = taxNew.add(dtax);

        uint oldPrice = frames[frameKey].lots[lotKey].acquisitionPrice;
        dtax = oldPrice.mul(taxMarket).div(100000).mul(dFrameP).div(scalar);
        uint taxOld = acquisitionPrice.mul(taxMarket).div(100000);
        taxOld = taxOld.mul(numOfFramesLeft);
        taxOld = taxOld.add(dtax);

        if (taxNew > taxOld) {
            require(accountingToken.allowance(msg.sender, address(this)) >= (taxNew.sub(taxOld)), "APPROVED AMOUNT IS TOO SMALL");
            //Transfer complete tax amount to the frame rewardFund
            accountingToken.transferFrom(msg.sender, address(this), (taxNew.sub(taxOld)));
            frames[frameKey].rewardFund = frames[frameKey].rewardFund.add(taxNew.sub(taxOld));
        }
        else if (taxNew < taxOld) {
            accountingToken.transfer(msg.sender, taxOld.sub(taxNew));
            frames[frameKey].rewardFund = frames[frameKey].rewardFund.sub(taxOld.sub(taxNew));
        }
        frames[frameKey].lots[lotKey].acquisitionPrice = acquisitionPrice;
    }

    // /// @notice Update trading pair's prices in the frame
    function updateFramePrices() public {
        uint tmp;
        uint frameKey = clcFrameTimestamp(block.timestamp);
        frames[frameKey].lastBlockNum = block.number;
        //Correct price if outside settle interval
        if (block.timestamp >= ((frameKey.add(period)).sub(tReporting)) && frames[frameKey].oraclePrice0CumulativeStart == 0) {
            (frames[frameKey].oraclePrice0CumulativeStart, tmp, frames[frameKey].oracleTimestampStart) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
            emit FrameUpdate(frameKey);
        }
        else if (block.timestamp <= frameKey.add(period) && block.timestamp >= ((frameKey.add(period)).sub(tReporting))) {
            (frames[frameKey].oraclePrice0CumulativeEnd, tmp, frames[frameKey].oracleTimestampEnd) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
            emit FrameUpdate(frameKey);
        }
    }

    // /// @notice Update trading pair's prices in the frame
    // /// @param PriceCumulative Cumulative price
    // /// @dev For developement purposes the new price is added as an input
    // /// @dev Final version should use uniswap's oracles
    // function updateFramePrices(uint PriceCumulative) public {
    //     uint frameKey = clcFrameTimestamp(block.timestamp);
    //     frames[frameKey].lastBlockNum = block.number;
    //     //Correct price if outside settle interval
    //     if (block.timestamp >= ((frameKey.add(period)).sub(tReporting)) && frames[frameKey].oraclePrice0CumulativeStart == 0) {
    //         frames[frameKey].oraclePrice0CumulativeStart = PriceCumulative;
    //         frames[frameKey].oracleTimestampStart = block.timestamp;
    //         emit FrameUpdate(frameKey);
    //     }
    //     else if (block.timestamp <= frameKey.add(period) && block.timestamp >= ((frameKey.add(period)).sub(tReporting))) {
    //         frames[frameKey].oraclePrice0CumulativeEnd = PriceCumulative;
    //         frames[frameKey].oracleTimestampEnd = block.timestamp;
    //         emit FrameUpdate(frameKey);
    //     }
    // }

    /// @notice Close frame
    /// @param frameKey Frame's timestamp
    function closeFrame(uint frameKey) public payable {
        //Check if frame is opened
        require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        //Check if frame timing is correct
        require(frameKey.add(period) <= block.timestamp, "FRAME END TIME NOT REACHED");
        //Check if frame has valid prices
        if (frames[frameKey].oraclePrice0CumulativeStart <= 0 || frames[frameKey].oraclePrice0CumulativeEnd <= 0) {
            frames[frameKey].state = SFrame.INVALID;
        }
        if (frames[frameKey].oraclePrice0CumulativeStart == frames[frameKey].oraclePrice0CumulativeEnd) {
            frames[frameKey].state = SFrame.INVALID;
        }
        frames[frameKey].state = SFrame.CLOSED;

        //UQ112x112 encoded
        uint priceDiff = frames[frameKey].oraclePrice0CumulativeEnd.sub(frames[frameKey].oraclePrice0CumulativeStart);
        uint timeDiff = frames[frameKey].oracleTimestampEnd.sub(frames[frameKey].oracleTimestampStart);
        //Calculate time-weighted average price -- UQ112x112 encoded
        frames[frameKey].priceAverage = uint(((FixedPoint.div(FixedPoint.uq112x112(uint224(priceDiff)), (uint112(timeDiff)))))._x);

        //Decode to scalar value
        frames[frameKey].priceAverage = (frames[frameKey].priceAverage >> 112).mul(scalar) + (frames[frameKey].priceAverage << 112).div(1e49); 
        //frames[frameKey].priceAverage = (frames[frameKey].priceAverage << 112).div(1e49);

        //Subtract fees from the reward amount and send them to Owners of the market and protocol
        uint marketOwnerFees = frames[frameKey].rewardFund.mul(feeMarket).div(100000);
        uint protocolOwnerFees = frames[frameKey].rewardFund.mul(feeProtocol).div(100000);

        frames[frameKey].rewardFund = frames[frameKey].rewardFund.sub(marketOwnerFees).sub(protocolOwnerFees);
        accountingToken.transfer(ownerMarket, marketOwnerFees);
        accountingToken.transfer(factory.owner(), protocolOwnerFees);

        emit FrameUpdate(frameKey);
    }

    /// @notice Settle lot for a owner. Owner's share of the reward amount get's transfered to owner's account
    /// @param frameKey Frame's timestamp
    function settleLot(uint frameKey) public payable {  
        //Check if frame is closed
        require(frames[frameKey].state == SFrame.CLOSED, "FRAME NOT CLOSED");    
        //Get winning lot key
        uint lotKeyWin = (clcLotInterval(frames[frameKey].priceAverage));
        Lot memory lot = frames[frameKey].lots[lotKeyWin];
        require(lot.state != SLot.SETTLED, "PARCEL ALREADY SETTLED");
        //Get last owners index in the lot owner array
        uint ownerIndex = getNumberOfLotOwners(frameKey, lotKeyWin);
        //Transfer winnings to last owner 
        accountingToken.transfer(lot.lotOwners[ownerIndex.sub(1)].owner, frames[frameKey].rewardFund);
        // frames[frameKey].lots[lotKeyWin].state = SLot.SETTLED;
    }

}