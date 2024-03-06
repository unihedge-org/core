// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "./NewMarket.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title TWPM Market getter contract
/// @author UniHedge
contract MarketGetter {
    using SafeMath for uint;

    function getFrameStruct(Market market, uint frameKey) public view returns (Market.Frame memory){
        Market.Frame memory frame;
        // uint tmp;
        (frame.frameKey,frame.rate,frame.rewardClaimedBy) = market.frames(frameKey);
        return frame;
    }

}