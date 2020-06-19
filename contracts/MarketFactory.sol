// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;

import "./Market.sol";
import "../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

contract MarketFactory {
    IUniswapV2Factory public uniswapFactory;
    mapping(address => Market) public markets;
    address[] public marketsKeys;

    constructor(address _uniswapFactory) public {
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
    }

    function addMarket(address _sToken, address _uniswapPair, uint _period, uint _settleInterval, uint _blockStart) external {
        require(address(markets[_uniswapPair].uniswapPair) == address(0), "MARKET ALREADY EXISTS ");
        markets[_uniswapPair] = new Market(_sToken, _uniswapPair, _period, _settleInterval, _blockStart);
        marketsKeys.push(_uniswapPair);
    }

    function getMarketsCount() public view returns (uint){
        return marketsKeys.length;
    }


}
