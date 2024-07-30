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
    
    // --- Defining structs for easier data handling ---
    struct User {
        address user;
        address referredBy;
        // Mapping that stores total amount of reward for each frameKey:
        uint[] rewards;
        // Mapping that stores frame keys of frames that reward was collected from:
        uint[] collected;
    }

    // --- Functions to get structs from Market contract ---

    /// @notice Get frame struct by frameKey
    /// @param market Market contract address
    /// @param frameKey Frame's timestamp
    /// @return frame Frame struct
    function getFrameStruct(Market market, uint frameKey) public view returns (Market.Frame memory){
        Market.Frame memory frame;
        // uint tmp;
        (frame.frameKey,frame.rate,frame.claimedBy, frame.rateSettle, frame.feeSettle, frame.rewardSettle, frame.feeReferral) = market.frames(frameKey);
        frame.lotKeys = market.getFrameLotKeys(frameKey);
        return frame;
    }

    /// @notice Get lot struct by frameKey and lotKey
    /// @param market Market contract address
    /// @param frameKey Frame's timestamp
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

    /// @notice Get user struct by user address
    /// @param market Market contract address
    /// @param user User's address
    /// @return User struct
    /// @dev market.getUsersRewardArrays used to get rewards and collected arrays
    /// @dev it's not optimal, it loops throgh mappings
    function getUserStruct(Market market, address user) public view returns (User memory) {
        (, address refferedBy) = market.users(user);
        (uint[] memory rewards, uint[] memory collected) = market.getUsersRewardArrays(user);
        return User(user, refferedBy, rewards, collected);
    }

    // ----------------------------------------------------------------

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

    /// @notice Get frameKey from index in framesKeys array
    /// @param startFrame Start frameKey
    /// @param numOfFrames Number of frames to get
    /// @return openFrames Array of frameKeys
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

    /// @notice Get lotKey from index in framesKeys array
    /// @param frameKey_start Start frameKey
    /// @param frameKey_end End frameKey
    /// @param page Which page to print
    /// @param perPage How many frames should be printed on a page
    /// @return lots Array of frameKeys
    /// @return pagesLeft How many pages are left to print
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

    /// @notice Function to split the concatenated number back into timestamp and 18-decimal number
    /// @param concatenated Concatenated number
    /// @return frameKey Frame's timestamp
    /// @return lotKey Lot's 18-decimal number
    function splitLotsArrayElement(uint256 concatenated) public pure returns (uint256 frameKey, uint256 lotKey) {
        frameKey = concatenated % 1e10;
        lotKey = concatenated / 1e10;
    }

    /// @notice Get lots by index in lots array
    /// @param market Market's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @return lots Array of lots
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

    /// @notice Get frames by index in frames array
    /// @param market Market's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @return frames Array of frames
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

    /// @notice Get minimun guarantied frame's award amount (accumulation of different lot taxes)
    /// @notice Remaining tax of a lot owner get's returned after a sale (change of ownership). So the award amount isn't for sure untill the frame get's closed.
    /// @param frameKey Market.Frame's timestamp
    /// @return rewardFund amount 
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

    /// @notice Get all users in the market
    /// @param market Market's address
    /// @return referrals Array of users
    /// @return length Number of users
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

    // TODO: Add a limit to the number of frames that can be returned
    /// @notice Get users rewards 
    /// @param market Market's address
    /// @param user User's address
    /// @param frameKeyStart Start frameKey
    /// @param frameKeyEnd End frameKey
    /// @return reward Total reward
    function getUserRewards(Market market, address user, uint frameKeyStart, uint frameKeyEnd) external view returns (uint reward) {
        uint period = market.period();
        for(uint frameKey = frameKeyStart; frameKey <= frameKeyEnd; frameKey += period) {
            reward += market.getUserReward(user, frameKey);
        }
        return reward;
    }

    /// @notice Get multiple users rewards
    /// @param market Market's address
    /// @param firstUserIndex Start index
    /// @param lastUserIndex End index
    /// @param frameKeyStart Start frameKey
    /// @param frameKeyEnd End frameKey
    /// @return comulativeReward Total reward
    /// @return rewards Array of rewards
    function getMultipleUsersRewards(Market market, uint firstUserIndex, uint lastUserIndex, uint frameKeyStart, uint frameKeyEnd) external view returns (uint comulativeReward, uint[] memory rewards) {
        require(firstUserIndex < lastUserIndex, "firstUserIndex must be smaller or equal to lastUserIndex");
        uint usersLength = market.getUsersArrayLength();
        require(firstUserIndex < usersLength, "firstUserIndex is out of bounds");
        if (lastUserIndex > usersLength) lastUserIndex = usersLength;
        rewards = new uint[](lastUserIndex - firstUserIndex);
        uint period = market.period();
        for(uint i = firstUserIndex; i < lastUserIndex-1; i++) {
            address user = market.usersArray(i);
             for(uint frameKey = frameKeyStart; frameKey < frameKeyEnd; frameKey += period) {
                rewards[i] += market.getUserReward(user, frameKey);
                comulativeReward += rewards[i];
             }
        }
        return (comulativeReward, rewards);
    }

    /// @notice Get user's rewards length
    /// @param market Market's address
    /// @param user User's address
    /// @return rewards length
    function getUserRewardsLength(Market market, address user) public view returns (uint) {
        uint[] memory rewards;
        (rewards,) = market.getUsersRewardArrays(user);
        return rewards.length;
    }

    /// @notice Get users rewards by index
    /// @param market Market's address
    /// @param user User's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @return rewards Array of rewards
    function getUserRewardsByIndex(Market market, address user, uint startIndex, uint endIndex) public view returns (uint[] memory rewards) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");
        (rewards,) = market.getUsersRewardArrays(user);
        if (rewards.length == 0 || startIndex >= rewards.length) return rewards;
        if (endIndex >= rewards.length) endIndex = rewards.length - 1;

        for(uint i = startIndex; i <= endIndex; i++) {
            rewards[i] = rewards[i];
        }
        return rewards;
    }

    /// @notice Get user's collected rewards length
    /// @param market Market's address
    /// @param user User's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @return collected Array of collected rewards
    function getUserCollectedByIndex(Market market, address user, uint startIndex, uint endIndex) public view returns (uint[] memory collected) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");
    
        (, collected) = market.getUsersRewardArrays(user);
        if (collected.length == 0 || startIndex >= collected.length) return collected;
        if (endIndex >= collected.length) endIndex = collected.length - 1;

        for(uint i = startIndex; i <= endIndex; i++) {
            collected[i-startIndex] = collected[i];
        }
        return collected;
    }

    /// @notice Get users by index in users array
    /// @param market Market's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @param startIndexArray Start index of rewards and collected arrays
    /// @param endIndexArray End index of rewards and collected arrays
    /// @return users Array of users structs
    function getUsersByIndex(Market market, uint startIndex, uint endIndex, uint startIndexArray, uint endIndexArray) external view returns (User[] memory users) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");
        uint usersLength = market.getUsersArrayLength();
        require(usersLength > 0, "No users in the market");
        address[] memory usersArray = new address[](endIndex-startIndex+1);
        usersArray = market.getUsersArray();

        require(startIndex < usersLength, "startIndex is out of bounds");
        
        if (endIndex >= usersLength) endIndex = usersLength - 1;
        
        // Define the size of users array by start and end index 
        users = new User[](endIndex - startIndex + 1);

        for (uint i = startIndex; i <= endIndex; i++) {
            (, address refferedBy) = market.users(usersArray[i]);
            uint[] memory rewards = getUserRewardsByIndex(market, usersArray[i], startIndexArray, endIndexArray);
            uint[] memory collected = getUserCollectedByIndex(market, usersArray[i], startIndexArray, endIndexArray);

            users[i-startIndex] = User(usersArray[i], refferedBy, rewards, collected);
        }

        return users;
    }

    function getUsersByIndexFull(Market market, uint startIndex, uint endIndex) external view returns (User[] memory users) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");
        uint usersLength = market.getUsersArrayLength();
        require(usersLength > 0, "No users in the market");
        address[] memory usersArray = new address[](endIndex-startIndex+1);
        usersArray = market.getUsersArray();

        require(startIndex < usersLength, "startIndex is out of bounds");
        
        if (endIndex >= usersLength) endIndex = usersLength - 1;
        
        // Define the size of users array by start and end index 
        users = new User[](endIndex - startIndex + 1);

        for (uint i = startIndex; i <= endIndex; i++) {
            (, address refferedBy) = market.users(usersArray[i]);
            (uint[] memory rewards, uint[] memory collected) = market.getUsersRewardArrays(usersArray[i]);

            users[i-startIndex] = User(usersArray[i], refferedBy, rewards, collected);
        }

        return users;
}


}
