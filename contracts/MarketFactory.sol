// SPDX-License-Identifier: MIT
pragma solidity ^0.5.0;

import "./Market.sol";
import "../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "../node_modules/@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MarketFactory {

    IUniswapV2Factory public uniswapFactory;
    mapping(address => Market) public markets;
    address[] public marketsKeys;
    address public owner;

    constructor(address _uniswapFactory) public {
        owner = msg.sender;
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
    }

    function addMarket(address _token, address _uniswapPair, uint _period, uint _initTimestamp, uint _settlementInterval, uint _minHorizon, uint _maxHorizon, uint _fee) external {
        Market market = new Market(this, IERC20(_token), IUniswapV2Pair(_uniswapPair), _period, _initTimestamp, _settlementInterval, _minHorizon, _maxHorizon, _fee);
        markets[address(market)] = market;
        marketsKeys.push(address(market));
    }

    function getMarketsCount() public view returns (uint){
        return marketsKeys.length;
    }
}
