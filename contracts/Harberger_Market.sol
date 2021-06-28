// SPDX-License-Identifier: MIT
pragma solidity ^0.5.0;
//pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "./MarketFactory_3.sol";

contract Harberger_Market {
    using SafeMath for uint;

    MarketFactory_3 public factory;
    IERC20 public accountingToken;
    address public ownerMarket;
    uint public period;
    uint public initTimestamp; 
    IUniswapV2Pair public uniswapPair;
    uint public dPrice;
    uint public feeMarket;

    uint public taxMarket;
    uint public feeProtocol = 100;
    uint scalar = 1e24;
    uint num = 100000;

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
        uint[] parcels;
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
        uint frameKey;
        uint parcelKey;
        ParcelOwner[] parcelOwners;
        uint currentPrice;
        SParcel state;
    }

    event ParcelUpdate(uint index);

    mapping(uint => Parcel) public parcels;
    uint[] public parcelKeys;


    constructor(MarketFactory_3 _factory, IERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _initTimestamp, uint _taxMarket, uint _feeMarket, uint _dPrice ) public {
        accountingToken = _token;
        ownerMarket = msg.sender;
        period = _period;
        initTimestamp = _initTimestamp; 
        taxMarket = _taxMarket;
        feeMarket = _feeMarket;
        uniswapPair = _uniswapPair;
        dPrice = _dPrice;
        factory = _factory;
    }

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

    function clcFrameTimestamp(uint timestamp) public view returns (uint){
        if (timestamp <= initTimestamp) return initTimestamp;
        return ((timestamp.sub(initTimestamp)).div(period)).mul(period).add(initTimestamp);
    }

    function clcParcelInterval(uint value) public view returns (uint){
        if (value <= 0) return dPrice;
        return value.div(dPrice).mul(dPrice).add(dPrice);
    }

    function clcFramesLeft(uint frameKey) public view returns (uint){                      
        return (frameKey.sub(block.timestamp)).div(period).add(1);
    }

    //Change to 1 input: only parcelKey
    function getCurrentPrice(uint parcelKey) public view returns (uint){                 
        return parcels[parcelKey].currentPrice;
    }

    function getApprovedAmount() public view returns (uint) {                         
        uint approvedAmount = accountingToken.allowance(msg.sender, address(this));
        //parcels[frameKey][intervalKey].state = SParcel.APPROVED;
        return approvedAmount;
    }

    function getParcelOwnerBlockNum(uint parcelKey, uint owner) public view returns (uint) {                         
        return parcels[parcelKey].parcelOwners[owner].blockNum;
    }

    function getRewardAmount(uint frameKey) public view returns (uint) {                         
        return frames[frameKey].rewardFund;
    }

    function getParcelCount() public view returns (uint){
        return parcelKeys.length;
    }

    function getNumberOfParcelOwners(uint parcelIndex) public view returns (uint){
        return parcels[parcelIndex].parcelOwners.length ;
    }

    function getBlockNum() public view returns (uint){
        return block.number;
    }



    function getParcelIndex(uint frameKey, uint parcelKey) public view returns (uint) {   

        uint parcelCount = getParcelCount();

        //if (parcelCount == 0) return 0;

        for (uint i=0; i < parcelCount; i++) {
            if (parcels[i].parcelKey == parcelKey && parcels[i].frameKey == frameKey) return i;
        }

        return getParcelCount(); 
    }

    function getParcelOwnerIndex(uint parcelIndex, address owner) public view returns (uint) {   

        //if (parcelCount == 0) return 0;

        for (uint i=0; i<getNumberOfParcelOwners(parcelIndex); i++) {
            if (parcels[parcelIndex].parcelOwners[i].owner == owner) return i;
        }

        return getNumberOfParcelOwners(parcelIndex); 
    }

    

    // function getAmounfOfparcelOwners(uint parcelKey) public view returns (uint) {                         
    //     uint onwersLenght = parcels[parcelKey].parcelOwners.lenght
    //     parcels[frameKey][intervalKey].state = SParcel.APPROVED;
    //     return approvedAmount;
    // }

    function CreateParcel(uint frameKey, uint parcelKey) internal {

        //if (parcels[frameKey][intervalKey].state != SParcel.NULL) return (frameKey, intervalKey);
        
        parcels[getParcelCount()].parcelKey = parcelKey;
        parcels[getParcelCount()].frameKey = frameKey;
        parcelKeys.push(parcelKey);
    }

    function AmountToApprove(uint frameKey, uint priceInterval, uint newSellPrice) public view returns (uint) {                         
        uint parcelKey = clcParcelInterval(priceInterval);
       
        
        uint numOfFrames = clcFramesLeft(frameKey);
        uint tax = newSellPrice.mul(taxMarket).div(100000).mul(numOfFrames);

        uint price = parcels[getParcelIndex(frameKey, parcelKey)].currentPrice.add(tax);

        return price;
    }


    function buyParcel(uint timestamp, uint priceInterval, uint newSellPrice) public payable {
        uint frameKey =  getOrCreateFrame(timestamp);                          
        uint parcelKey = clcParcelInterval(priceInterval);

        if (getParcelIndex(frameKey, parcelKey) == getParcelCount()) CreateParcel(frameKey, parcelKey);

        //Calculate tax from the propoed new price (newSellPrice)
        uint numOfFramesLeft = clcFramesLeft(timestamp);
        uint tax = newSellPrice.mul(taxMarket).div(100000).mul(numOfFramesLeft);

        uint parcelIndex = getParcelIndex(frameKey, parcelKey);

        //Approved amount has to be at leat equal to price of the Parcel(with tax)
        require(accountingToken.allowance(msg.sender, address(this)) >= parcels[parcelIndex].currentPrice.add(tax), "APPROVED AMOUNT IS NOT ENOUGH");
        
        //Transfer complete tax amount to the frame rewardFund
        accountingToken.transferFrom(msg.sender, address(this), parcels[parcelIndex].currentPrice.add(tax));
        frames[frameKey].rewardFund = frames[frameKey].rewardFund.add(tax);



        if (parcels[parcelIndex].state == SParcel.BOUGHT) {
            //Pay the Parcel price to current owner + return tax
            uint oldTaxToReturn = parcels[parcelIndex].currentPrice.mul(taxMarket).div(100000).mul(numOfFramesLeft);
            uint amount = (oldTaxToReturn.add(parcels[parcelIndex].currentPrice));
            accountingToken.transfer(parcels[parcelIndex].parcelOwners[getNumberOfParcelOwners(parcelIndex).sub(1)].owner, amount);
            frames[frameKey].rewardFund = frames[frameKey].rewardFund.sub(oldTaxToReturn);
        }
       
        parcels[parcelIndex].parcelOwners.push(ParcelOwner(msg.sender, block.number));
        parcels[parcelIndex].state = SParcel.BOUGHT;
        parcels[parcelIndex].currentPrice = newSellPrice;
    }

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


    function settleParcel(uint frameKey, address owner) public {  
        //Check if frame is closed
        require(frames[frameKey].state == SFrame.CLOSED, "FRAME NOT CLOSED");    
        uint parcelKeyWin = (clcParcelInterval(frames[frameKey].priceAverage));

        uint parcelIndex = getParcelIndex(frameKey, parcelKeyWin);

        uint amount = clcSettleAmount(parcelIndex, owner);
        accountingToken.transfer(owner, amount);

    }

    function clcShare(uint parcelIndex, address owner) public view returns (uint) {
        uint ownerIndex = getParcelOwnerIndex(parcelIndex, owner);
        require(ownerIndex < getNumberOfParcelOwners(parcelIndex), "OWNER DOES NOT EXIST"); 

        Parcel memory parcel = parcels[parcelIndex];

        uint ownerBlock= parcel.parcelOwners[ownerIndex].blockNum;
        uint endBlock = frames[parcel.frameKey].lastBlockNum;
        uint firstOwnerBlock= parcel.parcelOwners[0].blockNum;
        uint nextOwnerBlock;

        if (getNumberOfParcelOwners(parcelIndex)-1 == ownerIndex) nextOwnerBlock = endBlock;
        else nextOwnerBlock = parcel.parcelOwners[ownerIndex + 1].blockNum;

        //nextOwnerBlock = parcels[parcelIndex].parcelOwners[ownerIndex + 1].blockNum;
    
        uint ownerBlocks = nextOwnerBlock.sub(ownerBlock);
        uint allBlocks = endBlock.sub(firstOwnerBlock);

        uint share = ownerBlocks.mul(scalar).div(allBlocks);
        return share;     
    }

    function clcSettleAmount(uint parcelIndex, address owner) public view returns (uint){
        
        return clcShare(parcelIndex, owner).mul(frames[parcels[parcelIndex].frameKey].rewardFund).div(scalar);

    }




}