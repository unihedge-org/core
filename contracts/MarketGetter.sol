// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Market.sol";

/// @title TWPM Market getter contract
/// @author UniHedge
/// @notice Read-only helpers for paging structs and precomputing approvals for Market.
contract MarketGetter {
    // ---- Thin wrappers ----

    function getFrame(Market market, uint frameKey)
    public
    view
    returns (Market.Frame memory frame)
    {
        return market.getFrame(frameKey);
    }

    function getLot(Market market, uint256 lotId)
    public
    view
    returns (Market.Lot memory lot)
    {
        return market.getLot(lotId);
    }

    function getTrade(Market market, uint256 index)
    public
    view
    returns (Market.Trade memory trade)
    {
        return market.getTrade(index);
    }

    /// @notice Unpack lotId => (frameKey, lotKeyTokens). Matches Market packing.
    function unpackLotId(uint256 lotId)
    public
    pure
    returns (uint256 frameKey, uint256 lotKeyTokens)
    {
        frameKey = lotId & ((uint256(1) << 64) - 1);
        lotKeyTokens = lotId >> 64;
    }

    /// @notice Pack (frameKey, lotKeyTokens) => lotId. Matches Market packing.
    function packLotId(uint256 frameKey, uint256 lotKeyTokens)
    public
    pure
    returns (uint256 lotId)
    {
        require(frameKey <= type(uint64).max, "frameKey too large");
        return (lotKeyTokens << 64) | frameKey;
    }

    // ---- Pagination ----

    function getLotsByIndex(
        Market market,
        uint startIndex,
        uint endIndex
    ) external view returns (Market.Lot[] memory lots) {
        require(startIndex <= endIndex, "startIndex > endIndex");

        uint lotCount = market.getLotsCount();
        if (lotCount == 0 || startIndex >= lotCount) {
            return new Market.Lot[](0);
        }
        if (endIndex >= lotCount) endIndex = lotCount - 1;

        lots = new Market.Lot[](endIndex - startIndex + 1);
        for (uint i = startIndex; i <= endIndex; i++) {
            uint256 lotId = market.lotsIds(i);      // public getter for array
            lots[i - startIndex] = market.getLot(lotId);
        }
    }

    function getFramesByIndex(
        Market market,
        uint startIndex,
        uint endIndex
    ) external view returns (Market.Frame[] memory frames) {
        require(startIndex <= endIndex, "startIndex > endIndex");

        uint keysLen = market.getFramesCount();
        if (keysLen == 0 || startIndex >= keysLen) {
            return new Market.Frame[](0);
        }
        if (endIndex >= keysLen) endIndex = keysLen - 1;

        frames = new Market.Frame[](endIndex - startIndex + 1);
        for (uint i = startIndex; i <= endIndex; i++) {
            uint frameKey = market.framesKeys(i);    // public getter for array
            frames[i - startIndex] = market.getFrame(frameKey);
        }
    }

    function getTradesByIndex(
        Market market,
        uint startIndex,
        uint endIndex
    ) external view returns (Market.Trade[] memory trades) {
        require(startIndex <= endIndex, "startIndex > endIndex");

        uint len = market.getTradesCount();
        if (len == 0 || startIndex >= len) {
            return new Market.Trade[](0);
        }
        if (endIndex >= len) endIndex = len - 1;

        trades = new Market.Trade[](endIndex - startIndex + 1);
        for (uint i = startIndex; i <= endIndex; i++) {
            trades[i - startIndex] = market.getTrade(i);
        }
    }

    // ---- Approval precomputation ----
    /// @notice Amount of accounting tokens (T) to approve for Market.tradeLot().
    /// @dev If the lot exists, buyer pays previous owner's last acquisition (Q96→T)
    ///      + current tax (already in T). If it does not, only tax is needed.
    function clcAmountToApprove(
        Market market,
        uint timestamp,
        uint256 rateQ96,
        uint256 acqPriceQ96
    ) external view returns (uint approvalAmount) {
        uint frameKey = market.clcFrameKey(timestamp);
        require(frameKey + market.period() >= block.timestamp, "Frame must be future/open");

        uint lotKeyTokens = market.clcLotKeyT(rateQ96);
        uint256 lotId = packLotId(frameKey, lotKeyTokens);

        uint256 taxT = market.clcTaxT(frameKey, acqPriceQ96);

        Market.Lot memory lot = market.getLot(lotId);
        if (lot.lotId == 0) {
            return taxT;
        }

        uint lastIdx = lot.trades[lot.trades.length - 1];
        uint256 lastAcqQ96 = market.getTrade(lastIdx).acquisitionPriceQ96;
        uint256 priceTokenT = market.fromQ96(lastAcqQ96);

        approvalAmount = taxT + priceTokenT;
    }
}
