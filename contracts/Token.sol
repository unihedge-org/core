// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20{

    constructor() ERC20("TestToken", "Tkn") {
        _mint(msg.sender, 10000e18);
    }

    function loadMore() public{
        _mint(msg.sender,1000e18);
    }

    function burn(address owner) public{
        _burn(owner,balanceOf(owner));
    }
}