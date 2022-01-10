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
    //Average price calculation
    bool public avgPriceSwitch = false;
    //Scalar number used for calculating precentages
    uint scalar = 1e24; //256b
    

    enum SFrame {NULL, OPENED, CLOSED}
    struct Frame {
        uint frameKey; 
        uint oracleTimestampStart;
        uint oracleTimestampEnd;
        uint rewardFund;
        uint priceAverage;
        uint oraclePrice0CumulativeStart;
        uint oraclePrice0CumulativeEnd;
        uint oraclePrice1CumulativeStart;
        uint oraclePrice1CumulativeEnd;
        SFrame state;
        uint[] lotKeys;
        mapping(uint => Lot) lots;
    }

    event FrameUpdate(uint frameKey, uint oracleTimestampStart, uint oracleTimestampEnd, uint oraclePrice0CumulativeStart, uint oraclePrice0CumulativeEnd, uint oraclePrice1CumulativeStart, uint oraclePrice1CumulativeEnd, uint rewardFund);

    mapping(uint => Frame) public frames;
    mapping(address => uint[]) public userFrames;
    uint[] public framesKeys;

    enum SLot {NULL, BOUGHT, SETTLED}
    struct Lot {
        uint frameKey;
        uint lotKey;
        address lotOwner;
        uint acquisitionPrice;
        SLot state;
    }

    event LotUpdate(uint frameKey, Lot lotStruct);
    constructor(MarketFactory _factory, IERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _initTimestamp, uint _taxMarket, uint _feeMarket, uint _dPrice, uint _tReporting, uint _minTax, bool _avgPriceSwitch) {
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
        avgPriceSwitch = _avgPriceSwitch;
    }

    modifier isFactoryOwner() {
        require(msg.sender == factory.owner(), "NOT THE FACTORY OWNER");
        _;
    }


    //TODO: add Price1 or not?
    function hasValidPrices(uint frameKey) private view{
        //require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
        if (frames[frameKey].oraclePrice0CumulativeStart <= 0 || frames[frameKey].oraclePrice0CumulativeEnd <= 0) {
            //frames[framekey].state = SFrame.INVALID;
            revert("INVALID FRAME PRICE");
        }
        if (frames[frameKey].oraclePrice0CumulativeStart == frames[frameKey].oraclePrice0CumulativeEnd) {
            //frames[framekey].state = SFrame.INVALID;
            revert("INVALID FRAME PRICE");
        }
    }

    //TODO: it should watch time untill the endframe
    function minTaxCheck(uint frameKey, uint acqPrice) private view{
        uint tax = clcTax(frameKey, acqPrice);  //acqPrice * (taxMarket) / (100000);
        require(tax >= minTax, "PRICE IS TOO LOW");
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
    function clcLotKey(uint value) public view returns (uint){
        if (value <= 0) return dPrice;
        return value / (dPrice) * (dPrice);
    }

    /// @notice Calculate how many frames there are left untill given frame in input
    /// @param frameKey Timestamp of an arbitary frame in the future
    /// @return number of frames (whole numbers: n=0,1,2...)
    function clcFramesLeft(uint frameKey) private view returns (uint){     
        if (frameKey == clcFrameTimestamp(block.timestamp)) return 0;                 
        return (((frameKey - (block.timestamp)) / period));
    }

/*     /// @notice Calculate average price of a frame
    /// @param frameKey Timestamp of an arbitary frame 
    /// @return avgPrice Time weighted aveage price */
    function clcPrice(uint frameKey) external view returns(uint avgPrice) {       
        hasValidPrices(frameKey); 
        //Calculate time-weighted average price -- UQ112x112 encoded
        uint timeDiff = frames[frameKey].oracleTimestampEnd - frames[frameKey].oracleTimestampStart;
        avgPrice;
        if (avgPriceSwitch) avgPrice = (FixedPoint.decode(FixedPoint.uq112x112(uint224((frames[frameKey].oraclePrice0CumulativeEnd - frames[frameKey].oraclePrice0CumulativeStart) / (timeDiff)))));
        else avgPrice = (FixedPoint.decode(FixedPoint.uq112x112(uint224((frames[frameKey].oraclePrice1CumulativeEnd - frames[frameKey].oraclePrice1CumulativeStart) / (timeDiff)))));
        avgPrice = avgPrice*scalar;
    }

    /// @notice Calculate amount required to approve to buy a lot
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return cmpltAmnt complete price of a lot
    function clcAmountToApprove(uint timestamp, uint pairPrice, uint acqPrice) external view returns (uint cmpltAmnt) {    
        uint frameKey = clcFrameTimestamp(timestamp); 
        //Check if the lot is in a current or future frame, otherwise the calculation results in an overflow/underflow.
        require(frameKey >= clcFrameTimestamp(block.timestamp), "THIS LOT IS IN A PAST FRAME");        
        uint lotKey = clcLotKey(pairPrice);
        uint tax = clcTax(frameKey, acqPrice);
        cmpltAmnt = frames[frameKey].lots[lotKey].acquisitionPrice + tax;
    }

    /// @notice Calculate amount required to change lot's price.
    /// @dev Calculate difference in tax values with old and new acquisition price
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return amnt complete price of a lot
    function clcAmountToApproveForUpdate(uint timestamp, uint pairPrice, uint acqPrice) external view returns (uint amnt) {   
        uint frameKey = clcFrameTimestamp(timestamp);
        //require(frameKey >= clcFrameTimestamp(block.timestamp), "THIS LOT IS IN A PAST FRAME");   
        uint tax1 = clcTax(frameKey, frames[frameKey].lots[clcLotKey(pairPrice)].acquisitionPrice);
        uint tax2 = clcTax(frameKey, acqPrice);
        if(tax1 >= tax2) amnt = 0;
        else amnt = tax2-tax1;
    }

    /// @notice Get created and still open frames
    /// @dev You can't get (current) frame's index in the framesKeys array,
    /// @dev so for-loop through the whole array is needed
    /// @dev other option would be with additional parameter: startIndex
    /// @param numOfFrames Timestamp that determins which frame it is
    /// @return openFrames array of frame keys
    function getOpenFrameKeys(uint startFrame, uint numOfFrames) external view returns (uint[] memory openFrames){
        openFrames = new uint[](numOfFrames);
        for(uint i = 0; i <= numOfFrames; i++) {
            uint frameKey = startFrame+(period*i);
            if(frames[frameKey].state != SFrame.NULL) {
                openFrames[i] = frameKey;
            }
        }
    }

    /// @notice Get users lots in the nex 50 frames and previous 50 frames
    /// @dev First version, it works, but need code optimisation probably :P
    /// @param user User's address
    /// @return userLots Returns array of users lots (whole structs)
    /// @dev Array's size is 100 no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getUserLots(address user) external view returns (Lot[] memory userLots){
        uint currentFrame = clcFrameTimestamp(block.timestamp);
        userLots = new Lot[](2000);
        Lot memory lot;
        uint counter = 0;
        uint frameKey;

        for(uint i = 1; i <= 100; i++) {
            if (i >= 50) frameKey = (currentFrame + period*(i-50));
            else frameKey = (currentFrame - period*i);

            if (frames[frameKey].state == SFrame.OPENED) {
                for (uint j=0; j<frames[frameKey].lotKeys.length; j++) {
                    lot = frames[frameKey].lots[frames[frameKey].lotKeys[j]];
                    if(lot.lotOwner == user) {
                        userLots[counter]= lot;
                        counter ++;
                        if(counter >= 2000) break;
                    } 
                }
            }
        }

        for(uint i = 1; i <= 49; i++) {
            frameKey = (currentFrame - period*i);
            if (frames[frameKey].state == SFrame.CLOSED) {
                for (uint j=0; j<frames[frameKey].lotKeys.length; j++) {
                    lot = frames[frameKey].lots[frames[frameKey].lotKeys[j]];
                    if(lot.lotOwner == user) {
                        if(counter >= 2000) break;
                        userLots[counter]= lot;
                        counter ++; 
                    } 
                }
            }
        }
    }

    //TODO: Should we delete frames from the array if user doesn't own any lots after somebody buys them etc?
    // or is it okay if it shows frames in which the user used to own lots
    /// @notice Get number of frame's that the address has bought lots in
    /// @param user User's address
    /// @return number of frames
    function getNumOfUserFrames(address user) external view returns (uint){
        return userFrames[user].length;
    }

    /// @notice Get frame's that the address has bought lots in
    /// @param user User's address
    /// @return frame keys
    function getUserFrames(address user) external view returns(uint[] memory)  {
        return userFrames[user];
    }

    /// @notice Get lot struct
    /// @param frameKey Frame's timestamp
    /// @param lotKey lot's key 
    /// @return lot struct
    function getLot(uint frameKey, uint lotKey) external view returns (Lot memory){                 
        return frames[frameKey].lots[lotKey];
    }

    /// @notice Get lotKey from index in lotKeys array
    /// @param frameKey Frame's timestamp
    /// @param index frameKeys array index 
    /// @return lotKey
    function getLotKey(uint frameKey, uint index) public view returns (uint){                 
        return frames[frameKey].lotKeys[index];
    }

    /// @notice Get no. of created lots in a frame 
    /// @param frameKey Frame's timestamp
    /// @return lot count
    function getLotsCount(uint frameKey) external view returns (uint){                 
        return frames[frameKey].lotKeys.length;
    }

    /// @notice Get frame's award amount (accumulation of different lot taxes)
    /// @notice Remaining tax of a lot owner get's returned after a sale (change of ownership). So the award amount isn't for sure untill the frame get's closed.
    /// @param frameKey Frame's timestamp
    /// @return award amount
    function getRewardAmount(uint frameKey) external view returns (uint) {                         
        return frames[frameKey].rewardFund; 
    }

    /// @notice Get number of frames
    /// @return number frames
    function getNumberOfFrameKeys() external view returns (uint){
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
        require(frameKey >= clcFrameTimestamp(block.timestamp), "FRAME IN PAST");
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
        uint lotKey = clcLotKey(pairPrice);
        if (frames[frameKey].lots[lotKey].state != SLot.NULL) return lotKey;
        frames[frameKey].lots[lotKey].frameKey = frameKey;
        frames[frameKey].lots[lotKey].lotKey = lotKey;
        frames[frameKey].lotKeys.push(lotKey);
        return lotKey;
    }

    function clcTax(uint frameKey, uint acquisitionPrice) internal view returns (uint tax) {             
        uint dFrame = (clcFrameTimestamp(block.timestamp) + (period)) - (block.timestamp); 
        uint dFrameP = scalar * dFrame / period;
        tax = acquisitionPrice * taxMarket / 100000;
        tax = (tax*(clcFramesLeft(frameKey)) + (tax * dFrameP / scalar));
        return tax;
    }

    /// @notice Calculate amout required to approve to buy a lot
    /// @param timestamp Frame's timestamp get's calculated from this value
    /// @param pairPrice Is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    function buyLot(uint timestamp, uint pairPrice, uint acqPrice) external {
        //Get frameKey and lotKey values
        uint frameKey =  getOrCreateFrame(timestamp);        
        minTaxCheck(frameKey, acqPrice);                  
        uint lotKey = getOrCreateLot(frameKey, pairPrice);
        require(frameKey >= clcFrameTimestamp(block.timestamp), "LOT IN PAST");
        require(msg.sender != frames[frameKey].lots[lotKey].lotOwner, "ALREADY OWNER");

        uint tax = clcTax(frameKey, acqPrice);

        //Approved amount has to be at leat equal to price of the Lot(with tax)
        require(accountingToken.allowance(msg.sender, address(this)) >= (frames[frameKey].lots[lotKey].acquisitionPrice + tax), "APPROVED AMOUNT TOO SMALL");
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

        updateFramePrices();

        emit FrameUpdate(frameKey, 
                         frames[frameKey].oracleTimestampStart,
                         frames[frameKey].oracleTimestampEnd,
                         frames[frameKey].oraclePrice0CumulativeStart,
                         frames[frameKey].oraclePrice0CumulativeEnd,
                         frames[frameKey].oraclePrice1CumulativeStart,
                         frames[frameKey].oraclePrice1CumulativeEnd,
                         frames[frameKey].rewardFund);
        emit LotUpdate(frameKey, frames[frameKey].lots[lotKey]);
    }

    /// @notice Owner can update lot's price. Has to pay additional tax, or leftover tax gets' returned to him if the new price is lower
    /// @param timestamp Frame's timestamp get's calculated from this value
    /// @param pairPrice Is trading pair's price (to get correct lot key) 
    /// @param acqPrice New acquisition price
    function updateLotPrice(uint timestamp, uint pairPrice, uint acqPrice) external {
        uint frameKey = getOrCreateFrame(timestamp); 
        minTaxCheck(frameKey,acqPrice);
        uint lotKey = getOrCreateLot(frameKey, pairPrice); 
        require(frames[frameKey].lots[lotKey].lotOwner == msg.sender, "NOT LOT OWNER");
        require(frameKey >= clcFrameTimestamp(block.timestamp), "LOT IN PAST FRAME");

        uint taxNew = clcTax(frameKey, acqPrice);
        uint taxOld = clcTax(frameKey, frames[frameKey].lots[lotKey].acquisitionPrice);

        if (taxNew > taxOld) {
            require(accountingToken.allowance(msg.sender, address(this)) >= (taxNew - taxOld), "APPROVED AMOUNT TOO SMALL");
            //Transfer complete tax amount to the frame rewardFund
            accountingToken.transferFrom(msg.sender, address(this), (taxNew - taxOld));
            frames[frameKey].rewardFund = frames[frameKey].rewardFund + (taxNew- taxOld);
        }
        else if (taxNew < taxOld) {
            accountingToken.transfer(msg.sender, taxOld - taxNew);
            frames[frameKey].rewardFund = frames[frameKey].rewardFund - (taxOld - taxNew);
        }
        frames[frameKey].lots[lotKey].acquisitionPrice = acqPrice;

        updateFramePrices();
        emit LotUpdate(frameKey, frames[frameKey].lots[lotKey]);
    }

    /// @notice Update trading pair's prices in the frame
    function updateFramePrices() public {
        uint frameKey = clcFrameTimestamp(block.timestamp);
        //Correct price if outside settle interval
        if (block.timestamp < ((frameKey + (period)) - (tReporting))) {
            (frames[frameKey].oraclePrice0CumulativeStart, frames[frameKey].oraclePrice1CumulativeStart, frames[frameKey].oracleTimestampStart) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
            (frames[frameKey].oraclePrice0CumulativeEnd, frames[frameKey].oraclePrice1CumulativeEnd, frames[frameKey].oracleTimestampEnd) = (frames[frameKey].oraclePrice0CumulativeStart, frames[frameKey].oraclePrice1CumulativeStart, frames[frameKey].oracleTimestampStart); 
        }
        else if (block.timestamp >= ((frameKey + (period)) - (tReporting))) {
            (frames[frameKey].oraclePrice0CumulativeEnd, frames[frameKey].oraclePrice1CumulativeEnd, frames[frameKey].oracleTimestampEnd) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
        }

        emit FrameUpdate(frameKey, 
                         frames[frameKey].oracleTimestampStart,
                         frames[frameKey].oracleTimestampEnd,
                         frames[frameKey].oraclePrice0CumulativeStart,
                         frames[frameKey].oraclePrice0CumulativeEnd,
                         frames[frameKey].oraclePrice1CumulativeStart,
                         frames[frameKey].oraclePrice1CumulativeEnd,
                         frames[frameKey].rewardFund);
    }

    /// @notice Close frame
    /// @param frameKey Frame's timestamp
    function closeFrame(uint frameKey) private{
        hasValidPrices(frameKey);
        require( (frameKey + period) <= block.timestamp, "FRAME END TIME NOT REACHED");
        frames[frameKey].state = SFrame.CLOSED;
        
        //Calculate time-weighted average price -- UQ112x112 encoded
        uint timeDiff = frames[frameKey].oracleTimestampEnd - frames[frameKey].oracleTimestampStart;
        if (avgPriceSwitch) frames[frameKey].priceAverage = FixedPoint.decode(FixedPoint.uq112x112(uint224((frames[frameKey].oraclePrice0CumulativeEnd - frames[frameKey].oraclePrice0CumulativeStart) / (timeDiff))));
        else frames[frameKey].priceAverage = FixedPoint.decode(FixedPoint.uq112x112(uint224((frames[frameKey].oraclePrice1CumulativeEnd - frames[frameKey].oraclePrice1CumulativeStart) / (timeDiff))));
        frames[frameKey].priceAverage = frames[frameKey].priceAverage*scalar;
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
                         frames[frameKey].oraclePrice1CumulativeStart,
                         frames[frameKey].oraclePrice1CumulativeEnd,
                         frames[frameKey].rewardFund);
    }

    /// @notice Settle lot for a owner. Owner's share of the reward amount get's transfered to owner's account
    /// @param frameKey Frame's timestamp
    function settleLot(uint frameKey) private{  
        //Check if frame is closed
        require(frames[frameKey].state == SFrame.CLOSED, "FRAME NOT CLOSED");    
        //Calcualte the winning lot key
        //uint avgPrice = FixedPoint.decode(frames[frameKey].priceAverage); 
        uint lotKeyWin = (clcLotKey(frames[frameKey].priceAverage));
        //Check if the lot is already settled
        require(frames[frameKey].lots[lotKeyWin].state != SLot.SETTLED, "LOT ALREADY SETTLED");
        //Transfer winnings to last owner
        require(frames[frameKey].lots[lotKeyWin].lotOwner != 0x0000000000000000000000000000000000000000, "NO OWNER");
        accountingToken.transfer(frames[frameKey].lots[lotKeyWin].lotOwner, frames[frameKey].rewardFund);
        //State is changed to settled
        frames[frameKey].lots[lotKeyWin].state = SLot.SETTLED;

        emit LotUpdate(frameKey, frames[frameKey].lots[lotKeyWin]);
    }

    /// @notice User can claim the reward if he owns the winning lot
    /// @param frameKey Frame's timestamp
    function claimReward(uint frameKey) external{
        closeFrame(frameKey);
        settleLot(frameKey);
    }

    // /// @notice Withdraw any amount out of the contract. Only to be used in extreme cases!
    // /// @param amount Amount you want to withdraw
    // function emptyFunds(uint amount) external isFactoryOwner {  
    //     accountingToken.transfer(factory.owner(), amount);
    // }


}
