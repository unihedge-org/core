// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Market.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title TWPM Market getter contract
/// @author UniHedge
contract MarketGetter {

    // --- Functions to get structs from Market contract ---

    /// @notice Get frame struct by frameKey
    /// @param market Market contract address
    /// @param frameKey Frame's timestamp
    /// @return frame Frame struct
    function getFrame(Market market, uint frameKey) public view returns (Market.Frame memory frame){
        return market.getFrame(frameKey);
    }

    /// @notice Get lot struct by lotId
    /// @param market Market contract address
    /// @param lotId Packed lot ID
    /// @return lot Lot struct
    function getLot(Market market, uint256 lotId) public view returns (Market.Lot memory lot){
        return market.getLot(lotId);
    }

    /// @notice Get trade struct by index
    /// @param market Market contract address
    /// @param index Trade index
    /// @return trade Trade struct
    function getTrade(Market market, uint256 index) public view returns (Market.Trade memory trade) {
        return market.getTrade(index);
    }

    /// @notice Unpack the concatenated lotId into frameKey and lotKey
    /// @param lotId Packed lot ID
    /// @return frameKey Frame's timestamp
    /// @return lotKey Lot's key
    function unpackLotId(uint256 lotId) public pure returns (uint256 frameKey, uint256 lotKey) {
        frameKey = lotId & ((1 << 64) - 1);
        lotKey = lotId >> 64;
    }

    /// @notice Pack frameKey and lotKey into lotId
    /// @param frameKey Frame key
    /// @param lotKey Lot key
    /// @return lotId Packed ID
    function packLotId(uint256 frameKey, uint256 lotKey) public pure returns (uint256 lotId) {
        require(frameKey <= type(uint64).max, "frameKey too large");
        return (lotKey << 64) | frameKey;
    }

    /// @notice Get lots by index in lots array
    /// @param market Market's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @return lots Array of lots
    function getLotsByIndex(Market market, uint startIndex, uint endIndex) external view returns (Market.Lot[] memory lots) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");
        uint lotArrayLength = market.getLotsCount();
        require(lotArrayLength > 0, "No lots in the market");

        if (startIndex >= lotArrayLength) return new Market.Lot[](0);

        if (endIndex >= lotArrayLength) endIndex = lotArrayLength - 1;

        lots = new Market.Lot[](endIndex - startIndex + 1);

        for (uint i = startIndex; i <= endIndex; i++) {
            lots[i - startIndex] = getLot(market, market.lotsIds(i));
        }

        return lots;
    }

    /// @notice Get frames by index in frames array
    /// @param market Market's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @return frames Array of frames
    function getFramesByIndex(Market market, uint startIndex, uint endIndex) external view returns (Market.Frame[] memory frames) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");

        uint frameKeysLength = market.getFramesCount();
        require(frameKeysLength > 0, "No frames in the market");

        if (startIndex >= frameKeysLength) return new Market.Frame[](0);

        if (endIndex >= frameKeysLength) endIndex = frameKeysLength - 1;

        frames = new Market.Frame[](endIndex - startIndex + 1);

        for (uint i = startIndex; i <= endIndex; i++) {
            uint frameKey = market.framesKeys(i); // Call the generated getter for framesKeys array
            frames[i - startIndex] = getFrame(market, frameKey);
        }
        return frames;
    }

    /// @notice Get trades by index in trades array
    /// @param market Market's address
    /// @param startIndex Start index
    /// @param endIndex End index
    /// @return trades Array of trades
    function getTradesByIndex(Market market, uint startIndex, uint endIndex) external view returns (Market.Trade[] memory trades) {
        require(startIndex <= endIndex, "startIndex must be smaller or equal to endIndex");
        uint tradesLength = market.getTradesCount();
        require(tradesLength > 0, "No trades in the market");

        if (startIndex >= tradesLength) return new Market.Trade[](0);

        if (endIndex >= tradesLength) endIndex = tradesLength - 1;

        trades = new Market.Trade[](endIndex - startIndex + 1);

        for (uint i = startIndex; i <= endIndex; i++) {
            trades[i - startIndex] = getTrade(market, i);
        }

        return trades;
    }



    /// @notice Calculate amount required to approve to acquire a lot (purchase or resale)
    /// @param market Market contract address
    /// @param timestamp Timestamp to determine frame
    /// @param rateQ96 Rate in Q96 (to get lot key)
    /// @param acqPriceQ96 Acquisition price in Q96
    /// @return approvalAmount Amount in token units
    function clcAmountToApprove(Market market, uint timestamp, uint256 rateQ96, uint256 acqPriceQ96) external view returns (uint approvalAmount) {
        uint frameKey = market.clcFrameKey(timestamp);
        require(frameKey + market.period() >= block.timestamp, "Frame has to be in the future");
        uint lotKey = market.clcLotKey(rateQ96);
        uint256 lotId = packLotId(frameKey, lotKey);
        Market.Lot memory lot = getLot(market, lotId);
        uint256 taxQ96 = market.clcTax(frameKey, acqPriceQ96);
        uint256 acqAddQ96 = 0;
        if(lot.lotId != 0) {
            uint lastIdx = lot.trades[lot.trades.length - 1];
            acqAddQ96 = market.getTrade(lastIdx).acquisitionPriceQ96;
        }
        approvalAmount = market.fromQ96(acqAddQ96 + taxQ96);
    }


}