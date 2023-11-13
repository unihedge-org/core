// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
//pragma experimental ABIEncoderV2;

import "./MarketFactory.sol";
import "./Market.sol";
import "./MLib.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/libraries/UQ112x112.sol";


/// @title TWPM Market getter contract
/// @author UniHedge
contract MarketGetter {

    /// @notice Get frame struct from the main contract
    /// @dev When calling a public struct from another contract, the values from inside the struct are returned as TUPLE instead of as a whole struct...
    /// @dev that is why this function is needed
    /// @param market User's address
    /// @param frameKey FrameKey timestamp
    /// @return Frame Frame struct
    function getFrameStruct(Market market, uint frameKey) public view returns (MLib.Frame memory){
        MLib.Frame memory frame;
        // uint tmp;
        (frame.frameKey,frame.oracleTimestampStart,frame.oracleTimestampEnd,,,,,,,) = market.frames(frameKey);
        (,,,frame.rewardFund,frame.priceAverage, frame.oraclePrice0CumulativeStart, frame.oraclePrice0CumulativeEnd,,,) = market.frames(frameKey);
        (,,,,,,, frame.oraclePrice1CumulativeStart, frame.oraclePrice1CumulativeEnd, frame.state) = market.frames(frameKey);

        return frame;
    }

    /// @notice Get lot struct from the main contract
    /// @dev When calling a public struct from another contract, the values from inside the struct are returned as TUPLE instead of as a whole struct...
    /// @dev that is why this function is needed
    /// @param market User's address
    /// @param frameKey FrameKey timestamp
    /// @param lotKey LotKey value
    /// @return Lot Lot struct
    function getLotStruct(Market market, uint frameKey, uint lotKey) public view returns (MLib.Lot memory){
        MLib.Lot memory lot;
        (lot.frameKey, lot.lotKey, lot.lotOwner, lot.acquisitionPrice, lot.state) = market.lots(frameKey, lotKey);

        return lot;
    }
    
    /// @notice Get no. of created lots in a frame 
    /// @param frameKey Frame's timestamp
    /// @return lot count
    function getLotsCount(Market market, uint frameKey) external view returns (uint){ 
        uint[] memory lotKeys = market.getLotKeys(frameKey);                
        return lotKeys.length;
    }

    /// @notice Get lotKey from index in lotKeys array
    /// @param frameKey Frame's timestamp
    /// @param index frameKeys array index 
    /// @return lotKey
    function getLotKey(Market market, uint frameKey, uint index) public view returns (uint){  
        uint[] memory lotKeys = market.getLotKeys(frameKey);                
        return lotKeys[index];
    }

    /// @notice Get created and still open frames
    /// @dev You can't get (current) frame's index in the framesKeys array,
    /// @dev so for-loop through the whole array is needed
    /// @dev other option would be with additional parameter: startIndex
    /// @param numOfFrames Timestamp that determins which frame it is
    /// @return openFrames array of frame keys
    function getOpenFrameKeys(Market market, uint startFrame, uint numOfFrames) external view returns (uint[] memory openFrames){
        openFrames = new uint[](numOfFrames);
        //SharedStructs.Frame memory frame;
        MLib.Frame memory frame;

        for(uint i = 0; i <= numOfFrames; i++) {
            uint frameKey = startFrame+(market.period()*i);
            frame = getFrameStruct(market, frameKey);
            if(frame.state != MLib.SFrame.NULL) {
                openFrames[i] = frameKey;
            }
        }
    }


    /// @notice Get all lots in the specified time frame
    /// @param market Market's address
    /// @param frameKey_start Start frameKey 
    /// @param frameKey_end End framekey
    /// @param page Which page to print
    /// @param perPage How many frames should be printed on a page
    /// @return lots Returns array of frames 
    /// @return pagesLeft How many pages are left to print
    /// @dev Array's size is 100 no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getLots(Market market, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (MLib.Lot[] memory lots, uint pagesLeft){
        lots = new MLib.Lot[](perPage);
        uint[] memory lotKeys;
        //0 - counter; 1 - arrayCounter, 2 - period
        uint[] memory uintVariables = new uint[](3);

        uintVariables[2] = market.period();

            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                lotKeys = market.getLotKeys(frameKey);
                for (uint j=0; j < lotKeys.length; j++) {                   
                    if(uintVariables[0] >= (page*perPage) && (uintVariables[0] < (page+1)*perPage) ) {
                        lots[uintVariables[1]]= (getLotStruct(market, frameKey, lotKeys[j]));
                        uintVariables[1]= uintVariables[1] + 1;
                    }
                    uintVariables[0]= uintVariables[0] + 1;
            }
        }


        if(uintVariables[0] > (page+1)*perPage) {
            pagesLeft = ((uintVariables[0]/perPage) - page);
        }
        else pagesLeft=0;

        return(lots, pagesLeft);

    }

    /// @notice Get users lots in the specified time frame
    /// @dev There were a lot of problems with the limit of 16 local variables
    /// @dev had to use 'tricks' with arrays that hold multiple variables to avoid stack too deep problem
    /// @param market Market's address
    /// @param user User's address
    /// @param mode 0-all lots (in present and future frames and past frames (first open then closed)), 1 - only lots in OPEN frames, 2 - only lots in CLOSED frames
    /// @param frameKey_start Start frameKey
    /// @param frameKey_end End framekey
    /// @param page Which page to print
    /// @param perPage How many lots should be printed on a page
    /// @return userLots Returns array of users lots 
    /// @return pagesLeft How many pages are left to print
    /// @dev Array's size is 100 no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getLotsUser(Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (MLib.Lot[] memory userLots, uint pagesLeft){
        userLots = new MLib.Lot[](perPage+1);
        
        MLib.SFrame frameState;
        uint[] memory lotKeys;
        //0 - counter; 1 - arracCounter, 2 - period
        uint[] memory uintVariables = new uint[](3);

        uintVariables[2] = market.period();

        if (mode <= 1) {
            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frameState = market.getFrameState(frameKey);
                

                if (frameState == MLib.SFrame.OPENED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {

                        userLots[perPage] = (getLotStruct(market, frameKey, lotKeys[j]));
                        
                        
                        if(userLots[perPage].lotOwner == user) {
                            if(uintVariables[0] >= (page*perPage) && (uintVariables[0] < (page+1)*perPage) ) {
                                userLots[uintVariables[1]]= userLots[perPage];
                                uintVariables[1]= uintVariables[1] + 1;
                            }
                            uintVariables[0]= uintVariables[0] + 1;
                        } 
                    }
                }
            }
        }

        if(mode == 2 || mode == 0) {
            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frameState = market.getFrameState(frameKey);
                if (frameState == MLib.SFrame.CLOSED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {
                        userLots[perPage] = (getLotStruct(market, frameKey, lotKeys[j]));
                        if(userLots[perPage].lotOwner == user) {
                            if(uintVariables[0] >= ((page)*perPage) && uintVariables[0] < (page+1)*perPage) {
                                userLots[uintVariables[1]]= userLots[perPage];
                                uintVariables[1]= uintVariables[1] + 1;
                            }
                            uintVariables[0]= uintVariables[0] + 1;
                        } 
                    }
                }
            }
        }

        if(uintVariables[0] > (page+1)*perPage) {
            pagesLeft = ((uintVariables[0]/perPage) - page);
        }
        else pagesLeft=0;

        return(userLots, pagesLeft);

    }


    /// @notice Get all open frames in the specified time frame
    /// @param market Market's address
    /// @param frameKey_start Start frameKey 
    /// @param frameKey_end End framekey
    /// @param page Which page to print
    /// @param perPage How many frames should be printed on a page
    /// @return frames Returns array of frames 
    /// @return pagesLeft How many pages are left to print
    /// @dev Array's size is 100 no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getFrames(Market market, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (MLib.Frame[] memory frames, uint pagesLeft) { 
        frames = new MLib.Frame[](perPage);
        MLib.Frame memory frame;
        
        uint[] memory uintVariables = new uint[](3);
        uintVariables[2] = market.period();

            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frame = getFrameStruct(market, frameKey);
                if (frame.state != MLib.SFrame.NULL) {
                    if(uintVariables[0] >= ((page)*perPage) && uintVariables[0] < (page+1)*perPage) {
                        frames[uintVariables[1]] = frame;
                        uintVariables[1]= uintVariables[1] + 1;
                    }
                    uintVariables[0]= uintVariables[0] + 1;
                } 
            }

        if(uintVariables[0] > (page+1)*perPage) {
            pagesLeft = ((uintVariables[0]/perPage) - page);
        }
        else pagesLeft=0;
        
        return(frames, pagesLeft);
    }


    /// @notice Get users frames in the specified time frame (frames in which the user owns lots)
    /// @param market Market's address
    /// @param user User's address
    /// @param frameKey_start Start frameKey
    /// @param frameKey_end End framekey
    /// @param page Which page to print
    /// @param perPage How many lots should be printed on a page
    /// @return userFrames Returns array of users frames 
    /// @return pagesLeft How many pages are left to print
    /// @dev Array's size is 100 no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getFramesUser(Market market, address user, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (MLib.Frame[] memory userFrames, uint pagesLeft){
        userFrames = new MLib.Frame[](perPage);
        address lotOwner;
        MLib.SFrame frameState;

        uint[] memory uintVariables = new uint[](3);
        uintVariables[2] = market.period();
        uint[] memory lotKeys;

        for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frameState = market.getFrameState(frameKey);
                

                if (frameState == MLib.SFrame.OPENED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {
                        (,,lotOwner,,) = market.lots(frameKey, lotKeys[j]);
                        if(lotOwner == user) {
                            if(uintVariables[0] >= (page*perPage) && (uintVariables[0] < (page+1)*perPage) ) {
                                userFrames[uintVariables[1]]=  getFrameStruct(market, frameKey);
                                uintVariables[1]= uintVariables[1] + 1;
                            }
                            uintVariables[0]= uintVariables[0] + 1;
                        } 
                    }
                }
            }

        if(uintVariables[0] > (page+1)*perPage) {
            pagesLeft = ((uintVariables[0]/perPage) - page);
        }
        else pagesLeft=0;
        
        return(userFrames, pagesLeft);

    }

    /// @notice Get frame's award amount (accumulation of different lot taxes)
    /// @notice Remaining tax of a lot owner get's returned after a sale (change of ownership). So the award amount isn't for sure untill the frame get's closed.
    /// @param frameKey MLib.Frame's timestamp
    /// @return award amount
    function getRewardAmount(Market market, uint frameKey) external view returns (uint) {     
        uint reward;
        (,,,reward,,,,,,) = market.frames(frameKey);                    
        return reward; 
    }

    // function getUserAddresses(Market market) external view returns (address[] memory) {
    //     return market.userAddresses();
    // }

        /// @notice Calculate amount required to approve to buy a lot
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return cmpltAmnt complete price of a lot
    function clcAmountToApprove(Market market, uint timestamp, uint pairPrice, uint acqPrice) external view returns (uint cmpltAmnt) {    
        uint frameKey = market.clcFrameTimestamp(timestamp); 
        //Check if the lot is in a current or future frame, otherwise the calculation results in an overflow/underflow.
        require(frameKey >= market.clcFrameTimestamp(block.timestamp), "THIS LOT IS IN A PAST FRAME");        
        uint lotKey = market.clcLotKey(pairPrice);
        uint tax = market.clcTax(frameKey, acqPrice);
        MLib.Lot memory lot = getLotStruct(market, frameKey, lotKey);
        cmpltAmnt = lot.acquisitionPrice + tax;
    }

    /// @notice Calculate amount required to change lot's price.
    /// @dev Calculate difference in tax values with old and new acquisition price
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return amnt complete price of a lot
    function clcAmountToApproveForUpdate(Market market, uint timestamp, uint pairPrice, uint acqPrice) external view returns (uint amnt) {   
        uint frameKey = market.clcFrameTimestamp(timestamp);
        require(frameKey >= market.clcFrameTimestamp(block.timestamp), "THIS LOT IS IN A PAST FRAME");   
        uint oldAcqPrice;
        (,,,oldAcqPrice,) = market.lots(frameKey, market.clcLotKey(pairPrice));
        uint tax1 = market.clcTax(frameKey, oldAcqPrice);
        uint tax2 = market.clcTax(frameKey, acqPrice);
        if(tax1 >= tax2) amnt = 0;
        else amnt = tax2-tax1;
    }

    /// @notice Calculate average price of a frame
    /// @param frameKey Timestamp of an arbitary frame 
    /// @return avgPrice Time weighted aveage price 
    function clcPrice(Market market, uint frameKey) external view returns(uint avgPrice) {       
        market.hasValidPrices(frameKey); 
        bool priceswitch = market.avgPriceSwitch();
        uint scalar = market.scalar();
        //Calculate time-weighted average price -- UQ112x112 encoded
        MLib.Frame memory frame = getFrameStruct(market, frameKey);

        uint timeDiff = frame.oracleTimestampEnd - frame.oracleTimestampStart;
        avgPrice;
        if (priceswitch) avgPrice = (FixedPoint.decode(FixedPoint.uq112x112(uint224((frame.oraclePrice0CumulativeEnd - frame.oraclePrice0CumulativeStart) / (timeDiff)))));
        else avgPrice = (FixedPoint.decode(FixedPoint.uq112x112(uint224((frame.oraclePrice1CumulativeEnd - frame.oraclePrice1CumulativeStart) / (timeDiff)))));
        avgPrice = avgPrice*scalar;
    }

}