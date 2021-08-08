// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Market.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MarketFactory {

    IUniswapV2Factory public uniswapFactory;
    mapping(address => Market) public markets;
    address[] public marketsKeys;
    address public owner;

    constructor(address _uniswapFactory) {
        owner = msg.sender;
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
    }

    function addMarket(address _token, address _uniswapPair, uint _period, uint _initTimestamp, uint _tax, uint _fee, uint _dPrice, uint _tReporting) external {
        Market market = new Market(this, IERC20(_token), IUniswapV2Pair(_uniswapPair), _period, _initTimestamp, _tax, _fee, _dPrice, _tReporting);
        markets[address(market)] = market;
        marketsKeys.push(address(market));
    }

    function getMarketsCount() public view returns (uint){
        return marketsKeys.length;
    }
}
