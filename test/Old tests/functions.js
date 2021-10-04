advanceTimeAndBlock = async (time) => {
    await advanceTime(time);
    await advanceBlock();
    return Promise.resolve(web3.eth.getBlock('latest'));
}

advanceTime = (time) => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [time],
            id: new Date().getTime()
        }, (err, result) => {
            if (err) { return reject(err); }
            return resolve(result);
        });
    });
}

advanceBlock = () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_mine",
            id: new Date().getTime()
        }, (err, result) => {
            if (err) { return reject(err); }
            const newBlockHash = web3.eth.getBlock('latest').hash;

            return resolve(newBlockHash)
        });
    });
}

async function getWagersKeys(market, frameKey) {
    let n = [];
    //Get all wagers
    let wagerCount = parseInt(await market.getWagersCount());
    for (let i = 0; i < wagerCount; i++) {
        let w = await market.wagers(i);
        if (w.frameKey === frameKey) n.push(i);
    }
    return n;
}



module.exports = {
    advanceTime,
    advanceBlock,
    advanceTimeAndBlock,
    getWagersKeys
}
