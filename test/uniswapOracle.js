const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));

const axios = require("axios");

web3.eth.handleRevert = true;
const gas = 25000000;
const colors = require('colors');
const BN=require('bignumber.js');


let addressUniswapV2Factory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let addressUniswapV2Pair = "0x8B22F85d0c844Cf793690F6D9DFE9F11Ddb35449";
let addressTokenDAI = "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735";
let addressTokenWETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
let addressUniswapV2Router02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

let scalar = 1e24;

let tx;
let n = 3;
let startTimestamp= 1606780800;


web3.eth.getAccounts().then(async accounts => {
    try {
        //Deploy oracle contract
        let contractOracle = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-periphery/build/ExampleOracleSimple.json").abi);
        contractOracle = await contractOracle.deploy({
            data: require("../node_modules/@uniswap/v2-periphery/build/ExampleOracleSimple.json").bytecode,
            arguments: [addressUniswapV2Factory,addressTokenDAI,addressTokenWETH]
        })
            .send({
                from: accounts[0],
                gas: gas
            });
        console.log("Contract Oracle loaded from chain at address " + contractOracle._address);

        //Load UniswapV2Pair contract instance
        let contractUniswapV2Pair = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-core/build/UniswapV2Pair.json").abi, addressUniswapV2Pair, {gas: gas});
        console.log("Contract UniswapV2Pair WETH/DAI loaded from chain at address " + addressUniswapV2Pair);

        //Load UniswapV2Router02 instance
        let contractUniswapV2Router02 = await new web3.eth.Contract(require("../node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json").abi, addressUniswapV2Router02, {gas: gas});
        console.log("Contract UniswapV2Router02 loaded from the chain at address " + addressUniswapV2Router02);

        console.log("price0CumulativeLast: "+await contractOracle.methods.price0CumulativeLast().call());
        console.log("price1CumulativeLast: "+await contractOracle.methods.price1CumulativeLast().call());
        console.log("price0Average: "+await contractOracle.methods.price0Average().call());
        console.log("price1Average: "+await contractOracle.methods.price1Average().call());

        await minerSkiptime(3600*24);

        //Buy fake DAI so the price changes
        await contractUniswapV2Router02.methods.swapExactETHForTokens(0, [addressTokenWETH, addressTokenDAI], accounts[0], 2524608000).send({
                from: accounts[0],
                value: 1e18
            });

        await contractOracle.methods.update().send({
            from:accounts[0],
            gas:gas
        })
        let p


        console.log("price0CumulativeLast: "+decodeUQ112x112(await contractOracle.methods.price0CumulativeLast().call()));
        console.log("price1CumulativeLast: "+decodeUQ112x112(await contractOracle.methods.price1CumulativeLast().call()));
        console.log("price0Average: "+await contractOracle.methods.price0Average().call());
        console.log("price1Average: "+await contractOracle.methods.price1Average().call());

        console.log("consulted price: " +await contractOracle.methods.consult(addressTokenWETH,1).call());
        let r= await contractUniswapV2Pair.methods.getReserves().call();
        console.log("spot price: "+(new BN(r[1])).dividedBy(new BN(r[0])).toFixed())




    }catch (e) {
        console.log(e.message.red);
    }
})


async function mineBlocks(number) {
    let b = await web3.eth.getBlockNumber();
    console.log(("Mining blocks: "+number).bgMagenta);
    console.log(("Block number: "+b).bgMagenta);
    return new Promise(async (resolve, reject) => {
        for(let i=0;i<number;i++){
            await axios.post("http://localhost:7545", {
                jsonrpc: '2.0',
                id: 1337,
                method: 'evm_mine',
                params: []
            })
        }
        b = await web3.eth.getBlockNumber();
        console.log(("Block number end: "+b).bgMagenta);
        resolve();
    })
}

async function minerSkiptime(duration) {
    return new Promise(async (resolve, reject) => {
        let b = await web3.eth.getBlockNumber();
        let t1 = await web3.eth.getBlock(b);
        // console.log(("Mining: Current block number: "+b+" date: "+new Date(parseInt(t.timestamp)*1000).toLocaleString()).bgMagenta);
        axios.post("http://localhost:7545", {
            jsonrpc: '2.0',
            id: 1337,
            method: 'evm_mine',
            params: [t1.timestamp+duration]
        })
            .then(async value => {
                let b = await web3.eth.getBlockNumber();
                let t2 = await web3.eth.getBlock(b);
                console.log(("Skip time: "+t2.timestamp).bgMagenta);
                resolve(value);
            }).catch(reason => {
            reject(reason);
        })
    })
}

function decodeUQ112x112(number){
    return (new BN(number)).multipliedBy((new BN(2)).pow(-112));
}

function encodeUQ112x112(number){

}