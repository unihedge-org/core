// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
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
contract MarketContract {

    using SafeMath for uint;
    //Contract for creating markets
    MarketFactory public factory;
    //ERC20 token used for buyng parcels in this contract 
    IERC20 public accountingToken;
    //Owner of this market
    address payable public ownerMarket;
    //Length of a frame
    uint public period;
    //Contract creation time
    uint public initTimestamp; 
    //Token pair on Uniswap
    IUniswapV2Pair public uniswapPair;
    //Range of a parcel
    uint public dPrice;
    //Fee that gets to market owner
    uint public feeMarket;
    //Tax on parcels
    uint public taxMarket;
    //Protocol fee
    uint public feeProtocol = 100;
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
        uint price0CumulativeEnd;
        uint oracleTimestampStart;
        uint oracleTimestampEnd;
        uint lastBlockNum;
        mapping(uint => Parcel) parcels;
        uint[] parcelKeys;
    }

    event FrameUpdate(uint frameKey);

    mapping(uint => Frame) public frames;
    uint[] public framesKeys;

    struct ParcelOwner {
        address payable owner;
        uint blockNum;
    }

    enum SParcel {NULL, BOUGHT, RESOLVED}
    struct Parcel {
        uint parcelKey;
        ParcelOwner[] parcelOwners;
        uint currentPrice;
        SParcel state;
    }

    event ParcelUpdate(uint frameKey, uint parcelKey);

    constructor(MarketFactory _factory, IERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _initTimestamp, uint _taxMarket, uint _feeMarket, uint _dPrice ) {
        accountingToken = _token;
        ownerMarket = payable(msg.sender);
        period = _period;
        initTimestamp = _initTimestamp; 
        taxMarket = _taxMarket;
        feeMarket = _feeMarket;
        uniswapPair = _uniswapPair;
        dPrice = _dPrice;
        factory = _factory;
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
        //Check if frame startParcel number is before current Parcel number
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
        return ((timestamp.sub(initTimestamp)).div(period)).mul(period).add(initTimestamp);
    }

    /// @notice Calculate bottom boundary of a parcel
    /// @param value Arbitary price of market's Uniswap pair
    /// @return parcel key (bottom boundary)
    function clcParcelInterval(uint value) public view returns (uint){
        if (value <= 0) return dPrice;
        return value.div(dPrice).mul(dPrice).add(dPrice);
    }

    /// @notice Calculate how many frames there are left untill given frame in input
    /// @param frameKey Timestamp of an arbitary frame in the future
    /// @return number of frames (whole numbers: n=0,1,2...)
    function clcFramesLeft(uint frameKey) public view returns (uint){                      
        return (frameKey.sub(block.timestamp)).div(period).add(1);
    }

    /// @notice Get current price of a parcel in a frame
    /// @param frameKey Frame's timestamp
    /// @param parcelKey Parcel's key 
    /// @return price that the current owner set
    function getCurrentPrice(uint frameKey, uint parcelKey) public view returns (uint){                 
        return frames[frameKey].parcels[parcelKey].currentPrice;
    }

    /// @notice Get msg senders approved amount of accounting token to this contract (market)
    /// @return approved amount
    function getApprovedAmount() public view returns (uint) {                         
        uint approvedAmount = accountingToken.allowance(msg.sender, address(this));
        return approvedAmount;
    }

    /// @notice Get frame's award amount (accumulation of different parcel taxes)
    /// @notice Remaining tax of a parcel owner get's returned after a sale (change of ownership). So the award amount isn't for sure untill the frame get's closed.
    /// @param frameKey Frame's timestamp
    /// @return award amount
    function getRewardAmount(uint frameKey) public view returns (uint) {                         
        return frames[frameKey].rewardFund;
    }

    /// @notice Get number of accounts that owned a specific parcel
    /// @param frameKey Frame's timestamp
    /// @param parcelKey Parcel's key 
    /// @return number of owners
    function getNumberOfParcelOwners(uint frameKey, uint parcelKey) public view returns (uint){
        return frames[frameKey].parcels[parcelKey].parcelOwners.length ;
    }

    /// @notice Get number of frames
    /// @return number frames
    function getNumberOfFrameKeys() public view returns (uint){
        return framesKeys.length ;
    }

    /// @notice Calculate parcel owner's index in the array of owners of the parcel
    /// @param frameKey Frame's timestamp
    /// @param parcelKey Parcel's key 
    /// @param owner Owners account address
    /// @return owner's index
    function getParcelOwnerIndex(uint frameKey, uint parcelKey, address owner) public view returns (uint) {   

        //if (parcelCount == 0) return 0;

        for (uint i=0; i< getNumberOfParcelOwners(frameKey, parcelKey); i++) {
            if (frames[frameKey].parcels[parcelKey].parcelOwners[i].owner == owner) return i;
        }

        return getNumberOfParcelOwners(frameKey, parcelKey); 
    }

    /// @notice Create a parcel
    /// @param frameKey Frame's timestamp
    /// @param pairPrice Price is the trading pair's price
    /// @return parcelKey
    function getOrCreateParcel(uint frameKey, uint pairPrice) internal returns(uint){

        uint parcelKey = clcParcelInterval(pairPrice);

        if (frames[frameKey].parcels[parcelKey].state != SParcel.NULL) return parcelKey;
        
        frames[frameKey].parcels[parcelKey].parcelKey = parcelKey;
        frames[frameKey].parcelKeys.push(parcelKey);
        return parcelKey;
    }

    /// @notice Calculate amout required to approve to buy a parcel
    /// @param frameKey Frame's timestamp
    /// @param pairPrice Value is trading pair's price (to get correct parcel key) 
    /// @param newSellPrice New sell price is required to calculate tax
    /// @return amoun to approve
    function AmountToApprove(uint frameKey, uint pairPrice, uint newSellPrice) public view returns (uint) {             

        uint parcelKey = clcParcelInterval(pairPrice);
        
        uint numOfFrames = clcFramesLeft(frameKey);
        uint tax = newSellPrice.mul(taxMarket).div(100000).mul(numOfFrames);

        uint price = frames[frameKey].parcels[parcelKey].currentPrice.add(tax);

        return price;
    }

    /// @notice Calculate amout required to approve to buy a parcel
    /// @param timestamp Frame's timestamp get's calculated from this value
    /// @param pairPrice Is trading pair's price (to get correct parcel key) 
    /// @param newSellPrice New sell price is required to calculate tax
    function buyParcel(uint timestamp, uint pairPrice, uint newSellPrice) public payable {
        uint frameKey =  getOrCreateFrame(timestamp);                          
        
        uint parcelKey = getOrCreateParcel(frameKey, pairPrice);

        //Calculate tax from the propoed new price (newSellPrice)
        uint numOfFramesLeft = clcFramesLeft(timestamp);
        uint tax = newSellPrice.mul(taxMarket).div(100000).mul(numOfFramesLeft);

        //Approved amount has to be at leat equal to price of the Parcel(with tax)
        require(accountingToken.allowance(msg.sender, address(this)) >= frames[frameKey].parcels[parcelKey].currentPrice.add(tax), "APPROVED AMOUNT IS NOT ENOUGH");
        
        //Transfer complete tax amount to the frame rewardFund
        accountingToken.transferFrom(msg.sender, address(this), frames[frameKey].parcels[parcelKey].currentPrice.add(tax));
        frames[frameKey].rewardFund = frames[frameKey].rewardFund.add(tax);



        if (frames[frameKey].parcels[parcelKey].state == SParcel.BOUGHT) {
            //Pay the Parcel price to current owner + return tax
            uint oldTaxToReturn = frames[frameKey].parcels[parcelKey].currentPrice.mul(taxMarket).div(100000).mul(numOfFramesLeft);
            uint amount = (oldTaxToReturn.add(frames[frameKey].parcels[parcelKey].currentPrice));
            accountingToken.transfer(frames[frameKey].parcels[parcelKey].parcelOwners[getNumberOfParcelOwners(frameKey, parcelKey).sub(1)].owner, amount);
            frames[frameKey].rewardFund = frames[frameKey].rewardFund.sub(oldTaxToReturn);
        }
       
        frames[frameKey].parcels[parcelKey].parcelOwners.push(ParcelOwner(payable(msg.sender), block.number));
        frames[frameKey].parcels[parcelKey].state = SParcel.BOUGHT;
        frames[frameKey].parcels[parcelKey].currentPrice = newSellPrice;
    }

    /// @notice Update trading pair's prices in the frame
    /// @param PriceCumulative Cumulative price
    /// @dev For developement purposes the new price is added as an input
    /// @dev Final version should use uniswap's oracles
    function updateFramePrices(uint PriceCumulative) public {
        uint frameKey = clcFrameTimestamp(block.timestamp);
        frames[frameKey].lastBlockNum = block.number;
        //Correct price if outside settle interval
        if (block.timestamp <= ((frameKey.add(period)).sub(21600))) {
            frames[frameKey].oraclePrice0CumulativeStart = PriceCumulative;
            frames[frameKey].oracleTimestampStart = block.timestamp;
            emit FrameUpdate(frameKey);
        }
        else if (block.timestamp <= frameKey.add(period)) {
            frames[frameKey].oraclePrice0CumulativeEnd = PriceCumulative;
            frames[frameKey].oracleTimestampEnd = block.timestamp;
            emit FrameUpdate(frameKey);
        }
    }

    /// @notice Close frame
    /// @param frameKey Frame's timestamp
    function closeFrame(uint frameKey) public {
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
        frames[frameKey].priceAverage = (frames[frameKey].priceAverage >> 112).mul(scalar); 
        frames[frameKey].priceAverage = (frames[frameKey].priceAverage << 112).div(1e49);

        //Subtract fees from the reward amount and send them to Owners of the market and protocol
        uint marketOwnerFees = frames[frameKey].rewardFund.mul(feeMarket).div(100000);
        uint protocolOwnerFees = frames[frameKey].rewardFund.mul(feeProtocol).div(100000);

        frames[frameKey].rewardFund = frames[frameKey].rewardFund.sub(marketOwnerFees).sub(protocolOwnerFees);
        accountingToken.transfer(ownerMarket, marketOwnerFees);
        accountingToken.transfer(factory.owner(), protocolOwnerFees);

        emit FrameUpdate(frameKey);
    }

    /// @notice Settle parcel for a owner. Owner's share of the reward amount get's transfered to owner's account
    /// @param frameKey Frame's timestamp
    /// @param owner Owner's address
    function settleParcel(uint frameKey, address owner) public {  
        //Check if frame is closed
        require(frames[frameKey].state == SFrame.CLOSED, "FRAME NOT CLOSED");    
        uint parcelKeyWin = (clcParcelInterval(frames[frameKey].priceAverage));

        uint amount = clcSettleAmount(frameKey, parcelKeyWin, owner);
        accountingToken.transfer(owner, amount);
    }

    /// @notice Calculate owner's share based on the number of blocks the account owned the parcel
    /// @param frameKey Frame's timestamp
    /// @param parcelKey Parcel's key
    /// @param owner Owner's address
    /// @return Owner's precentage
    function clcShare(uint frameKey, uint parcelKey, address owner) public view returns (uint) {
        uint ownerIndex = getParcelOwnerIndex(frameKey, parcelKey, owner);
        require(ownerIndex < getNumberOfParcelOwners(frameKey, parcelKey), "OWNER DOES NOT EXIST"); 

        Parcel memory parcel = frames[frameKey].parcels[parcelKey];

        uint ownerBlock= parcel.parcelOwners[ownerIndex].blockNum;
        uint endBlock = frames[frameKey].lastBlockNum;
        uint firstOwnerBlock= parcel.parcelOwners[0].blockNum;
        uint nextOwnerBlock;

        if (getNumberOfParcelOwners(frameKey, parcelKey)-1 == ownerIndex) nextOwnerBlock = endBlock;
        else nextOwnerBlock = parcel.parcelOwners[ownerIndex + 1].blockNum;

        //nextOwnerBlock = parcels[parcelIndex].parcelOwners[ownerIndex + 1].blockNum;
    
        uint ownerBlocks = nextOwnerBlock.sub(ownerBlock);
        uint allBlocks = endBlock.sub(firstOwnerBlock);

        uint share = ownerBlocks.mul(scalar).div(allBlocks);
        return share;     
    }

    /// @notice Calculate owner's winning amount
    /// @param frameKey Frame's timestamp
    /// @param parcelKey Parcel's key
    /// @param owner Owner's address
    /// @return Owner's winnings
    function clcSettleAmount(uint frameKey, uint parcelKey, address owner) public view returns (uint){
        
        return clcShare(frameKey, parcelKey, owner).mul(frames[frameKey].rewardFund).div(scalar);

    }




}