// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
//pragma experimental ABIEncoderV2;

import "./MarketFactory.sol";
import "./Market.sol";
import "./MLibrary.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/libraries/UQ112x112.sol";


/// @title TWPM Market getter contract
/// @author UniHedge
contract MarketGetter {


    //TODO: Skupen library, ki uporablja enake strukture. Obe pogodbi pol tako uporabljata enake strukture.
    //TODO: Funkcija, ki pokliče getter za strukturo iz main contracta in sestavi vse vrednosti v strukturo. A se da pol vrnit strukturo v memory strukture????

    //Ne vrne arrayev
    function getFrameStruct(Market market, uint frameKey) public view returns (MLib.Frame memory){
        MLib.Frame memory frame;
        uint tmp;
        (frame.frameKey,frame.oracleTimestampStart,frame.oracleTimestampEnd,tmp, tmp,tmp, tmp, tmp, tmp, frame.state) = market.frames(frameKey);
        (tmp,tmp,tmp, frame.rewardFund,frame.priceAverage, frame.oraclePrice0CumulativeStart, frame.oraclePrice0CumulativeEnd,tmp , tmp, frame.state) = market.frames(frameKey);
        (tmp,tmp,tmp,tmp,tmp, tmp, tmp, frame.oraclePrice1CumulativeStart, frame.oraclePrice1CumulativeEnd, frame.state) = market.frames(frameKey);
        return frame;
    }

    function getLotStruct(Market market, uint frameKey, uint lotKey) public view returns (MLib.Lot memory){
        MLib.Lot memory lot;
        (lot.frameKey, lot.lotKey, lot.lotOwner, lot.acquisitionPrice, lot.state) = market.lots(frameKey, lotKey);

        return lot;
    }

    /// @notice Get frame's that the address has bought lots in
    /// @param user User's address
    /// @return frame keys
    function getUserFrames(Market market, address user) external view returns(uint[] memory)  {
        return market.getUserFrames(user);
    }

        //TODO: Should we delete frames from the array if user doesn't own any lots after somebody buys them etc?
    // or is it okay if it shows frames in which the user used to own lots
    /// @notice Get number of frame's that the address has bought lots in
    /// @param user User's address
    /// @return number of frames
    function getNumOfUserFrames(Market market, address user) external view returns (uint){
        uint[] memory uFrames = market.getUserFrames(user);
        return uFrames.length;
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

    // function getFrameState(Market market, uint frameKey) internal view returns(MLib.SFrame state) {
    //     uint tmp;
    //     (tmp,tmp,tmp,tmp,tmp, tmp, tmp, tmp, tmp, state) = market.frames(frameKey);
    //     return state;
    // }

    /// @notice Get users lots in the nex 50 frames and previous 50 frames
    /// @dev First version, it works, but need code optimisation probably :P
    /// @param user User's address
    /// @return userLots Returns array of users lots (whole structs)
    /// @dev Array's size is 100 no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getLotsUser(Market market, address user,uint mode, uint timestamp_start,uint timestamp_end, uint page, uint perPage) external view returns (MLib.Lot[] memory userLots, uint pagesLeft){
        userLots = new MLib.Lot[](perPage);
        MLib.Lot memory lot;
        MLib.SFrame frameState;
        uint[] memory lotKeys;
        uint period = market.period();
        uint lotArrayCount = 0;
        uint counter = 0;

        if (mode <= 1) {
            for(uint frameKey = timestamp_start; frameKey <= timestamp_end; frameKey+=period) {

                frameState = market.getFrameState(frameKey);

                if (frameState == MLib.SFrame.OPENED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {
                        lot = getLotStruct(market, frameKey, lotKeys[j]);
                        if(lot.lotOwner == user) {
                            if(counter >= ((page-1)*perPage) && counter < page*perPage) {
                                userLots[lotArrayCount]= lot;
                                lotArrayCount++;
                            }
                            counter ++;
                        } 
                    }
                }
            }
        }

        if(mode == 2 || mode == 0) {
            for(uint frameKey = timestamp_start; frameKey <= timestamp_end; frameKey+=period) {
                frameState = market.getFrameState(frameKey);
                if (frameState == MLib.SFrame.CLOSED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {
                        lot = getLotStruct(market, frameKey, lotKeys[j]);
                        if(lot.lotOwner == user) {
                            if(counter >= ((page-1)*perPage) && counter < page*perPage) {
                                userLots[lotArrayCount]= lot;
                                lotArrayCount++;
                            }
                            counter ++;
                        } 
                    }
                }
            }
        }

        if(counter > page*perPage) {
            pagesLeft = ((counter/perPage) - page);
        }
        else pagesLeft=0;

        return(userLots, pagesLeft);

    }

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
        uint tmp;
        MLib.SLot state;
        address tmpAddr;
        uint oldAcqPrice;
        (tmp,tmp,tmpAddr,oldAcqPrice,state) = market.lots(frameKey, market.clcLotKey(pairPrice));
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
        //Calculate time-weighted average price -- UQ112x112 encoded
        MLib.Frame memory frame = getFrameStruct(market, frameKey);

        uint timeDiff = frame.oracleTimestampEnd - frame.oracleTimestampStart;
        avgPrice;
        if (market.avgPriceSwitch()) avgPrice = (FixedPoint.decode(FixedPoint.uq112x112(uint224((frame.oraclePrice0CumulativeEnd - frame.oraclePrice0CumulativeStart) / (timeDiff)))));
        else avgPrice = (FixedPoint.decode(FixedPoint.uq112x112(uint224((frame.oraclePrice1CumulativeEnd - frame.oraclePrice1CumulativeStart) / (timeDiff)))));
        avgPrice = avgPrice*market.scalar();
    }


    function getFrames(Market market, uint timestamp_start,uint timestamp_end, uint page, uint perPage) external view returns (MLib.Frame[] memory frames, uint pagesLeft) { 
        frames = new MLib.Frame[](perPage);
        uint counter = 0;
        MLib.Frame memory frame;
        uint period = market.period();
        uint frameCount = 0;

            for(uint i = timestamp_start; i <= timestamp_end; i=i+period) {
                frame = getFrameStruct(market, i);
                if (frame.state == MLib.SFrame.OPENED) {
                    if (counter >= ((page-1)*perPage) && counter < page*perPage) {
                        frames[frameCount] = frame;
                        frameCount++;
                    }
                    counter++;
                } 
            }
        if(counter > page*perPage) {
            pagesLeft = ((counter/perPage) - page);
        }
        else pagesLeft=0;
        
        return(frames, pagesLeft);
    }





}