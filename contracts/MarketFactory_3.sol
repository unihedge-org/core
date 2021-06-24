// SPDX-License-Identifier: MIT
pragma solidity ^0.5.0;

import "./Harberger_Market.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MarketFactory_3 {

    IUniswapV2Factory public uniswapFactory;
    mapping(address => Harberger_Market) public markets;
    address[] public marketsKeys;
    address public owner;

    constructor(address _uniswapFactory) public {
        owner = msg.sender;
        uniswapFactory = IUniswapV2Factory(_uniswapFactory);
    }

    function addMarket(address _token, address _uniswapPair, uint _period, uint _initTimestamp, uint _tax, uint _fee, uint _dPrice) external {
        Harberger_Market market = new Harberger_Market(this, IERC20(_token), IUniswapV2Pair(_uniswapPair), _period, _initTimestamp, _tax, _fee, _dPrice);
        markets[address(market)] = market;
        marketsKeys.push(address(market));
    }

    function getMarketsCount() public view returns (uint){
        return marketsKeys.length;
    }
}
