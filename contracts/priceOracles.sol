    
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
//pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract priceOracles {

    using SafeMath for uint;
    uint scalar = 1e24;


    struct Frame {
        uint oraclePriceCumulative;
        uint oracleTimestamp;
    }

    function getOracleAccPrice(IUniswapV2Pair uniswapPair) public view returns (Frame memory) {
        Frame memory frame;
        uint tmp;
        (frame.oraclePriceCumulative, tmp, frame.oracleTimestamp) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
        return frame;
    }

    function clcAveragePrice(uint price1, uint t1, uint price2, uint t2) public view returns (uint) {
        uint dP = price2.sub(price1);
        uint dT = t2.sub(t1);
        //Calculate average price UQ112x112 encoded
        uint avg = uint(((FixedPoint.div(FixedPoint.uq112x112(uint224(dP)), (uint112(dT)))))._x);
        //Decode to scalar value
        avg = (avg >> 112).mul(scalar) + (avg << 112).div(1e49);
        return avg;
    }

}
    
    
    
