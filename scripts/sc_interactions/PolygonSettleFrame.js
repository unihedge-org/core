//npx hardhat --network xxx run ./Scripts/deploy.js

//----------------------------------------------------------------------
const dPriceDif = -2; //ex. -2 means current rate minus 2*dPrice

//----------------------------------------------------------------------

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  const accountingToken = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC
  const pool = '0x45dDa9cb7c25131DF268515131f647d726f50608'; // USDC/WETH
  const addressMarket = '0x54887BB42411F5457A68eFb15F318ad5F54B74f2';
  const addressMarketGetter = '0x2Fa4502d83347d578e3f4Bcfd61EB3de6922A6Eb';
  const dPrice = Number(100);
  const feeProtocol = 3;
  const feeMarket = 1;

  //Print the account address
  const accounts = await hre.ethers.getSigners();
  console.log('Account address:', accounts[0].address);

  console.log('Account balance:', ethers.utils.formatUnits(await accounts[0].getBalance(), 18));

  const Market = await hre.ethers.getContractFactory('Market');
  const market = Market.attach(addressMarket);

  const MarketGetter = await hre.ethers.getContractFactory('MarketGetter');
  const marketGetter = MarketGetter.attach(addressMarketGetter);

  //----------------------------------------------------------------------------------------------
  //Calculate timestamp yesterday
  const timeStampStart = (Date.now() / 1000) | 0;
  const time_stamp_current = ((Date.now() / 1000) | 0) - 1 * 86400;

  // Get current frameKey
  let frame_key_current = await market.connect(accounts[0]).clcFrameKey(time_stamp_current);
  console.log('Settling frame with FrameKey: ', frame_key_current.toString());

  // Get frames from market getter
  let frames = await marketGetter.getFramesByIndex(addressMarket, 0, 10);
  console.log('Frames: ', frames);
  // Get last frame that is still less tnan timeStamp
  frames = frames.filter(frame => frame.frameKey.lt(timeStampStart));
  console.log('Frames: ', frames);

  // get the last frame
  let frameKey = 1746374400;
  // Set frame rate - setFrameRate
  let transaction = await market.connect(accounts[0]).setFrameRate(frameKey, {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
    gasLimit: 5_000_000,
  });
  await transaction.wait();
  console.log('Frame: ', frameKey.toString(), ' setFrameRate transaction hash: ', transaction.hash);

  // Call getFrame from market contract
  // let frame = await market.getFrame(frameKey);
  // console.log('Frame: ', frameKey.toString(), ' frame: ', frame);

  transaction = await market.connect(accounts[0]).settleFrame(frameKey, {
    gasPrice: ethers.utils.parseUnits('50', 'gwei'),
    gasLimit: 5_000_000,
  });
  await transaction.wait();
  console.log('Frame: ', frameKey.toString(), ' settlement transaction hash: ', transaction.hash);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
