// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "./Market.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

/// @title TWPM Market getter contract
/// @author UniHedge
contract MarketGetter {

    function getFrameStruct(Market market, uint frameKey) public view returns (Market.Frame memory){
        Market.Frame memory frame;
        // uint tmp;
        (frame.frameKey,frame.rate,frame.claimedBy, frame.rateSettle, frame.feeSettle, frame.rewardSettle, frame.feeReferral) = market.frames(frameKey);
        frame.lotKeys = market.getFrameLotKeys(frameKey);
        return frame;
    }

    function getLotStruct(Market market, uint frameKey, uint lotKey) public view returns (Market.Lot memory){
        Market.Lot memory lot;
        lot.frameKey = frameKey;
        lot.lotKey = lotKey;
        Market.LotState[] memory lotStates = market.getLotStates(frameKey,lotKey);
        if(lotStates.length == 0) {
            //Create an empty lotState if there are no states
            lot.states = new Market.LotState[](1);

            return (lot);
        }
        //Loop through all lot states and add them to the lot struct states array
        lot.states = new Market.LotState[](lotStates.length);

        for(uint i = 0; i < lotStates.length; i++) {
            lot.states[i] = (lotStates[i]);
        }
        return (lot);
    }

    /// @notice Get no. of created lots in a frame 
    /// @param frameKey Frame's timestamp
    /// @return lot count
    function getLotsCount(Market market, uint frameKey) external view returns (uint){ 
        uint[] memory lotKeys = market.getFrameLotKeys(frameKey);                
        return lotKeys.length;
    }

    /// @notice Get lotKey from index in lotKeys array
    /// @param frameKey Frame's timestamp
    /// @param index frameKeys array index 
    /// @return lotKey
    function getLotKey(Market market, uint frameKey, uint index) public view returns (uint){  
        uint[] memory lotKeys = market.getFrameLotKeys(frameKey);                
        return lotKeys[index];
    }


    function getOpenFrameKeys(Market market, uint startFrame, uint numOfFrames) external view returns (uint[] memory openFrames){
        openFrames = new uint[](numOfFrames);

        uint counter = 0;

        Market.Frame memory frame;

        for(uint i = 0; i <= numOfFrames; i++) {
            uint frameKey = startFrame+(market.period()*i);
            frame = getFrameStruct(market, frameKey);
            Market.SFrame frameState = market.getStateFrame(frame.frameKey);
            if(frameState == Market.SFrame.OPENED || frameState == Market.SFrame.RATED){
                openFrames[counter] = frameKey;
                counter++;
            }
        }

        return openFrames;
    }


    function getLots(Market market, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (Market.Lot[] memory lots, uint pagesLeft){
        require(frameKey_start <= frameKey_end, "frameKey_start must be smaller or equal to frameKey_end");
        lots = new Market.Lot[](perPage);

        uint[] memory lotKeys;
        //0 - counter; 1 - arrayCounter, 2 - period
        uint[] memory uintVariables = new uint[](3);

        uintVariables[2] = market.period();
        for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
            //
            lotKeys = market.getFrameLotKeys (frameKey);
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

    }

    // Function to split the concatenated number back into timestamp and 18-decimal number
    function splitLotsArrayElement(uint256 concatenated) public pure returns (uint256 frameKey, uint256 lotKey) {
        frameKey = concatenated % 1e10;
        lotKey = concatenated / 1e10;
    }

    function getLotsByIndex(Market market, uint startIndex, uint endIndex) external view returns (Market.Lot[] memory lots) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");
        uint lotArrayLength = market.getLotsArrayLength();
        require(lotArrayLength > 0, "No lots in the market");
        uint[] memory lotsArray = new uint[](lotArrayLength);
        lotsArray = market.getLotsArray();

        require(startIndex < lotArrayLength, "startIndex is out of bounds");
        
        if (endIndex >= lotArrayLength) endIndex = lotArrayLength - 1;
        
        // Define the size of lots array by start and end index 
        lots = new Market.Lot[](endIndex - startIndex + 1);

        for (uint i = startIndex; i <= endIndex; i++) {
            uint frameKey;
            uint lotKey;
            console.log("SOL: lotsArray[i]: ", lotsArray[i]);
            (frameKey, lotKey) = splitLotsArrayElement(lotsArray[i]);
            console.log("SOL: frameKey: ", frameKey);
            console.log("SOL: lotKey: ", lotKey);
            Market.Lot memory lot = market.getLot(frameKey, lotKey);
            lots[i] = getLotStruct(market, lot.frameKey, lot.lotKey);
        }

        return lots;
    }

    function getFramesByIndex(Market market, uint startIndex, uint endIndex) external view returns (Market.Frame[] memory frames){
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");

        uint frameKeysLength = market.getFramesLength();
        require(frameKeysLength > 0, "No frames in the market");
        require(frameKeysLength > startIndex, "startIndex is out of bounds");

        if(frameKeysLength < endIndex) endIndex = frameKeysLength - 1;

        frames = new Market.Frame[](endIndex - startIndex + 1);

        for(uint i = startIndex; i <= endIndex; i++) {
            uint frameKey = market.framesKeys(i);
            frames[i] = getFrameStruct(market, frameKey);
        }
        return frames;
    }

    /// @notice Get users lots in the specified time frame
    /// @dev There were a lot of problems with the limit of 16 local variables
    /// @dev had to use 'tricks' with arrays that hold multiple variables to avoid stack too deep problem
    /// @param market Market's address
    /// @param user User's address
    /// @param mode 0-all lots (in present, future and past frames (first open then closed)), 1 - only lots in OPEN frames, 2 - only lots in CLOSED frames
    /// @param frameKey_start Start frameKey
    /// @param frameKey_end End framekey
    /// @param page Which page to print
    /// @param perPage How many lots should be printed on a page
    /// @return userLots Returns array of users lots 
    /// @return pagesLeft How many pages are left to print
    /// @dev Array's size is fixed no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getLotsUser(Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (Market.Lot[] memory userLots, uint pagesLeft){
        userLots = new Market.Lot[](perPage+1);
        
        Market.SFrame frameState;
        uint[] memory lotKeys;
        //0 - counter; 1 - arracCounter, 2 - period
        uint[] memory uintVariables = new uint[](3);

        uintVariables[2] = market.period();

        if (mode <= 1) {
            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frameState = market.getStateFrame(frameKey);

                if (frameState == Market.SFrame.OPENED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getFrameLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {

                        userLots[perPage] = (getLotStruct(market, frameKey, lotKeys[j]));

                        //Get lots current state
                        Market.LotState[] memory lotStates = market.getLotStates(frameKey, lotKeys[j]);
                        
                        
                        if(lotStates[lotStates.length - 1].owner == user) {
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
                frameState = market.getStateFrame(frameKey);

                if (frameState == Market.SFrame.CLOSED || frameState == Market.SFrame.SETTLED || frameState == Market.SFrame.RATED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getFrameLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {
                        userLots[perPage] = (getLotStruct(market, frameKey, lotKeys[j]));

                        Market.LotState[] memory lotStates = market.getLotStates(frameKey, lotKeys[j]);
                        
                        if(lotStates[lotStates.length - 1].owner == user) {
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
        else pagesLeft = 0;

        return(userLots, pagesLeft);

    }

    /// @notice Get users lots in the specified time frame that the user sold
    /// @param market Market's address
    /// @param user User's address
    /// @param mode 0-all lots (in present, future and past frames (first open then closed)), 1 - only lots in OPEN frames, 2 - only lots in CLOSED frames
    /// @param frameKey_start Start frameKey
    /// @param frameKey_end End framekey
    /// @param page Which page to print
    /// @param perPage How many lots should be printed on a page
    /// @return userLots Returns array of users lots 
    /// @return pagesLeft How many pages are left to print
    /// @dev Array's size is 100 no mather how many lots this user actually has. 
    /// @dev So the results have to be filtered before use
    function getLotsSoldUser(Market market, address user,uint mode, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (Market.Lot[] memory userLots, uint pagesLeft){
        userLots = new Market.Lot[](perPage+1);
        
        Market.SFrame frameState;
        uint[] memory lotKeys;
        //0 - counter; 1 - arracCounter, 2 - period
        uint[] memory uintVariables = new uint[](3);

        uintVariables[2] = market.period();

        if (mode <= 1) {
            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frameState = market.getStateFrame(frameKey);

                if (frameState == Market.SFrame.OPENED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getFrameLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {

                        userLots[perPage] = (getLotStruct(market, frameKey, lotKeys[j]));

                        //Get lots current state
                        Market.LotState[] memory lotStates = market.getLotStates(frameKey, lotKeys[j]);

                        //Loop through past states and check if the user was the owner
                        for (uint k = 0; k < lotStates.length-1; k++) {
                            if(lotStates[k].owner == user) {
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
                                }

        if(mode == 2 || mode == 0) {
            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frameState = market.getStateFrame(frameKey);

                if (frameState == Market.SFrame.CLOSED || frameState == Market.SFrame.SETTLED || frameState == Market.SFrame.RATED) {
                    //more bit tako ločeno za getLotKeys, ker se ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getFrameLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {
                        userLots[perPage] = (getLotStruct(market, frameKey, lotKeys[j]));

                        Market.LotState[] memory lotStates = market.getLotStates(frameKey, lotKeys[j]);

                        //Loop through past states and check if the user was the owner
                        for (uint k = 0; k < lotStates.length-1; k++) {
                            if(lotStates[k].owner == user) {
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
    function getFrames(Market market, uint frameKey_start,uint frameKey_end, uint page, uint perPage) external view returns (Market.Frame[] memory frames, uint pagesLeft) { 
        frames = new Market.Frame[](perPage);
        Market.Frame memory frame;
        
        uint[] memory uintVariables = new uint[](3);
        uintVariables[2] = market.period();

            for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {
                frame = getFrameStruct(market, frameKey);
                if (market.getStateFrame(frame.frameKey) != Market.SFrame.NULL) {
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
    function getFramesUser(Market market, address user, uint frameKey_start, uint frameKey_end, uint page, uint perPage) external view returns (Market.Frame[] memory userFrames, uint pagesLeft){
        userFrames = new Market.Frame[](perPage);
        Market.SFrame frameState;

        //uintVariables[0] - counter; uintVariables[1] - arrayCounter, uintVariables[2] - period, uintVariables[3] - LastFrameKey
        uint[] memory uintVariables = new uint[](4);
        
        uintVariables[2] = market.period();
        uint[] memory lotKeys;

        for(uint frameKey = frameKey_start; frameKey <= frameKey_end; frameKey = frameKey + uintVariables[2]) {

                frameState = market.getStateFrame(frameKey);           

                //TODO: Should there be an option to only return frames in specific states?
                if (frameState != Market.SFrame.NULL) {
                    //more bit tako ločeno za getLotKeys, ker ti noče vrnit dinamičnega array, ko kličeš cel Frame struct- Moreš posebej vrnit
                    lotKeys = market.getFrameLotKeys(frameKey);
                    for (uint j=0; j < lotKeys.length; j++) {
                        Market.LotState[] memory lotStates = market.getLotStates(frameKey, lotKeys[j]);
                        //Check if lot owner is the user and if the frame is not already in the array
                        if(lotStates[lotStates.length - 1].owner == user && uintVariables[3] != frameKey) {
                            if(uintVariables[0] >= (page*perPage) && (uintVariables[0] < (page+1)*perPage) ) {
                                userFrames[uintVariables[1]]=  getFrameStruct(market, frameKey);
                                uintVariables[1]= uintVariables[1] + 1;
                            }
                            uintVariables[0]= uintVariables[0] + 1;
                            uintVariables[3] = frameKey;
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
        Market.Frame memory frame = getFrameStruct(market, frameKey);
        uint rewardPure = market.clcRewardFund(frameKey);  
        uint feeProtocol = market.feeProtocol();
        //Subtract protocol fee and referral fee from the reward
        uint reward = rewardPure - feeProtocol - frame.feeReferral;                 
        return reward; 
    }

    function getRewardAmountMin(Market market, uint frameKey) external view returns (uint rewardFund) {     
        Market.Frame memory frame = getFrameStruct(market, frameKey);
        uint feeReferral = frame.feeReferral;
        for(uint i = 0; i < frame.lotKeys.length; i++) {
            Market.Lot memory lot = getLotStruct(market, frameKey, frame.lotKeys[i]);
            for (uint j = 0; j < lot.states.length; j++) {
                //-------> TAX CHARGED <---------
                rewardFund += lot.states[j].taxCharged;
                //-------> TAX REFUNDED <---------
                rewardFund -= lot.states[j].taxRefunded;    
                //-------> TAX CURRENT <---------
                if (j == lot.states.length - 1) {
                    uint taxCurrent = market.clcTax(frameKey, lot.states[j].acquisitionPrice);
                    rewardFund -= taxCurrent;   

                    //Load users referredBy address, get it from markets users mapping
                    (, address referredBy) = market.users(lot.states[j].owner);
                    (bool referralUserExists,) = market.users(referredBy);
                    if(referralUserExists) {
                        uint referralPct = market.referralPct();
                        feeReferral += taxCurrent * referralPct / 1e18;
                    }
                }
            }
        }
        rewardFund = rewardFund - feeReferral;
        return rewardFund;
    }

    /// @notice Calculate amount required to approve to buy a lot
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return approvalAmnt complete price of a lot
    function clcAmountToApprove(Market market, uint timestamp, uint pairPrice, uint acqPrice) external view returns (uint approvalAmnt) {    
        uint frameKey = market.clcFrameKey(timestamp); 
        //Check if the lot is in a current or future frame, otherwise the calculation results in an overflow/underflow.
        require(frameKey + market.period() >= block.timestamp, "Frame has to be in the future");        
        uint lotKey = market.clcLotKey(pairPrice);
        uint tax = market.clcTax(frameKey, acqPrice);
        Market.Lot memory lot = getLotStruct(market, frameKey, lotKey);
        approvalAmnt = lot.states[lot.states.length - 1].acquisitionPrice + tax;
        return approvalAmnt;
    }

    /// @notice Calculate amount required to change lot's price.
    /// @dev Calculate difference in tax values with old and new acquisition price
    /// @param timestamp Timestamp that determins which frame it is
    /// @param pairPrice Value is trading pair's price (to get correct lot key) 
    /// @param acqPrice New sell price is required to calculate tax
    /// @return amnt complete price of a lot
    function clcAmountToApproveForUpdate(Market market, uint timestamp, uint pairPrice, uint acqPrice) external view returns (uint amnt) {   
        uint frameKey = market.clcFrameKey(timestamp);
        require(frameKey >= market.clcFrameKey(block.timestamp), "THIS LOT IS IN A PAST FRAME");   
        uint oldAcqPrice;
        // (oldAcqPrice,) = market.getLotArrays(frameKey, market.clcLotKey(pairPrice));
        Market.Lot memory lot = getLotStruct(market, frameKey, market.clcLotKey(pairPrice));
        oldAcqPrice = lot.states[lot.states.length - 1].acquisitionPrice;
        uint tax1 = market.clcTax(frameKey, oldAcqPrice);
        uint tax2 = market.clcTax(frameKey, acqPrice);
        if(tax1 >= tax2) amnt = 0;
        else amnt = tax2-tax1;
    }

    function getUsersReferrals(Market market, address user) external view returns (address[] memory referrals, uint16 length) {
        address[] memory referralsRaw = new address[](market.getUsersArrayLength());
        uint16 counter = 0;
        for(uint i = 0; i < market.getUsersArrayLength(); i++) {
            address userAddress = market.usersArray(i);
            (, address referredBy) = market.users(userAddress);
            if (referredBy == user) {
                referralsRaw[counter] = (userAddress);
                counter++;
        }
        }
        
        referrals = new address[](counter);
        for(uint i = 0; i < counter; i++) {
            referrals[i] = referralsRaw[i];
        }
        return (referrals, length);
    }

    //TODO: Add a limit to the number of frames that can be returned
    function getUserRewards(Market market, address user, uint frameKeyStart, uint frameKeyEnd) external view returns (uint reward) {
        uint period = market.period();
        for(uint frameKey = frameKeyStart; frameKey <= frameKeyEnd; frameKey += period) {
            reward += market.getUserReward(user, frameKey);
        }
        return reward;
    }

    function getMultipleUsersRewards(Market market, uint firstUserIndex, uint lastUserIndex, uint frameKeyStart, uint frameKeyEnd) external view returns (uint comulativeReward, uint[] memory rewards) {
        require(firstUserIndex < lastUserIndex, "firstUserIndex must be smaller or equal to lastUserIndex");
        uint usersLength = market.getUsersArrayLength();
        require(firstUserIndex < usersLength, "firstUserIndex is out of bounds");
        console.log("usersLength: ", usersLength);
        if (lastUserIndex > usersLength) lastUserIndex = usersLength;
        console.log("lastUserIndex: ", lastUserIndex);
        rewards = new uint[](lastUserIndex - firstUserIndex);
        uint period = market.period();
        console.log("period: ", period);
        for(uint i = firstUserIndex; i < lastUserIndex-1; i++) {
            address user = market.usersArray(i);
            console.log("user: ", user);
             for(uint frameKey = frameKeyStart; frameKey < frameKeyEnd; frameKey += period) {
                rewards[i] += market.getUserReward(user, frameKey);
                console.log("rewards: ", rewards[i]);
                comulativeReward += rewards[i];
                console.log("comulativeReward: ", comulativeReward);
             }
        }
        console.log("Returning rewards: ");
        return (comulativeReward, rewards);
    }

}
