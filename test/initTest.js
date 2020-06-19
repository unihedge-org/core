const DAIToken = artifacts.require("DAIToken");

contract("DAIToken", accounts => {
    it("should load 10000000 tokens to "+accounts[0] , () => {
        DAIToken.deployed()
            .then(instance => instance.totalSupply.call())
            .then(balance => {
                // console.log(balance);
                assert.equal(
                    balance.toNumber(),
                    10000003476,
                    "10000000 wasn't in the first account"
                );
            })
    })
})