// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract Token is ERC20{

    constructor() public{
    }

    function loadMore() public{
        _mint(msg.sender,1000e18);
    }

    function burn(address owner) public{
        _burn(owner,balanceOf(owner));
    }
}