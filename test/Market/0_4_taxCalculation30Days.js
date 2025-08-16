const { expect, ethers, time } = require('../Helpers/imports');
const { swapTokenForUsers, toQ96, fromQ96 } = require('../Helpers/functions');

/*
Test tax calculation for 30 days with price 10 USDC
Verifies that the tax follows the formula: 25% / sqrt(day)
Expected percentages for days 1-8: 25.0000, 17.6777, 14.4338, 12.5000, 11.1803, 10.2062, 9.4491, 8.8388
*/
describe('Tax Calculation for 30 Days with Fixed Price', function () {
  let accounts,
    owner,
    token,
    contractMarket,
    tokenDecimals,
    baseUnit,
    Q96,
    priceQ96;

  before(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];

    const block = await ethers.provider.getBlock('latest');
    console.log('\x1b[33m%s\x1b[0m', '   Current block: ', block.number);

    // Use the same token setup as other tests
    token = await ethers.getContractAt('IERC20Metadata', process.env.FUNDING_TOKEN, owner);
    
    tokenDecimals = await token.decimals();
    baseUnit = ethers.BigNumber.from(10).pow(tokenDecimals);
    Q96 = ethers.BigNumber.from(2).pow(96);

    // Price: 10 USDC in Q96 format
    const priceRaw = ethers.utils.parseUnits('10', tokenDecimals);
    priceQ96 = toQ96(priceRaw, tokenDecimals);

    console.log('\x1b[33m%s\x1b[0m', '   Test price: 10 USDC');
    console.log('\x1b[33m%s\x1b[0m', '   Price Q96: ', priceQ96.toString());
  });

  it('Deploy Market contract', async function () {
    const Market = await ethers.getContractFactory('Market');
    const feeProtocol = 3; // percent
    const feeMarket = 1; // percent
    const dPrice = 100; // 100 USDC
    
    contractMarket = await Market.deploy(
      process.env.FUNDING_TOKEN, 
      feeProtocol, 
      feeMarket, 
      dPrice, 
      process.env.POOL
    );

    expect(await contractMarket.owner()).to.equal(owner.address);
    expect(await contractMarket.period()).to.equal(86400); // 1 day
  });

  it('Test tax calculation for 30 days with price 10 USDC', async function () {
    console.log('\x1b[36m%s\x1b[0m', '\n   Testing tax calculation for 30 days with price 10 USDC:');
    console.log('\x1b[36m%s\x1b[0m', '   Expected formula: 25% / sqrt(day)');
    console.log('');

    // Expected values for verification
    const expectedValues = [
      { day: 1, percentage: 25.0000, tax: 2.5000 },
      { day: 2, percentage: 17.6777, tax: 1.7678 },
      { day: 3, percentage: 14.4338, tax: 1.4434 },
      { day: 4, percentage: 12.5000, tax: 1.2500 },
      { day: 5, percentage: 11.1803, tax: 1.1180 },
      { day: 6, percentage: 10.2062, tax: 1.0206 },
      { day: 7, percentage: 9.4491, tax: 0.9449 },
      { day: 8, percentage: 8.8388, tax: 0.8839 }
    ];

    const block = await ethers.provider.getBlock('latest');
    
    // Test each day from 1 to 30
    for (let day = 1; day <= 30; day++) {
      // Frame starts 'day' days in the future
      const frameTimestamp = block.timestamp + (day * 86400);
      const frameKey = await contractMarket.clcFrameKey(frameTimestamp);
      
      // Simulate being at the start of the frame (just entered the frame)
      // Convert to number for time helper
      const frameKeyNum = ethers.BigNumber.isBigNumber(frameKey) ? frameKey.toNumber() : frameKey;
      await time.setNextBlockTimestamp(frameKeyNum + 1);
      
      // Calculate tax for price 10 USDC
      const taxQ96 = await contractMarket.clcTax(frameKey, priceQ96);
      const taxRaw = fromQ96(taxQ96, tokenDecimals);
      const taxFormatted = parseFloat(ethers.utils.formatUnits(taxRaw, tokenDecimals));
      
      // Calculate expected tax (25% / sqrt(day) * 10 USDC)
      const expectedPercentage = 25.0 / Math.sqrt(day);
      const expectedTaxAmount = (expectedPercentage / 100) * 10;
      
      console.log(
        '\x1b[32m%s\x1b[0m', 
        `   Day ${day.toString().padStart(2)}: ${expectedPercentage.toFixed(4)}% -> Tax: ${taxFormatted.toFixed(4)} USDC (expected: ${expectedTaxAmount.toFixed(4)})`
      );
      
      // Verify the tax amount (allow small tolerance for precision)
      const tolerance = Math.max(0.001, expectedTaxAmount * 0.01); // 1% tolerance or 0.001 minimum
      expect(taxFormatted).to.be.closeTo(expectedTaxAmount, tolerance, 
        `Day ${day}: Tax ${taxFormatted} should be close to ${expectedTaxAmount}`);
      
      // For the first 8 days, check against exact expected values
      if (day <= 8) {
        const expected = expectedValues[day - 1];
        expect(taxFormatted).to.be.closeTo(expected.tax, 0.01,
          `Day ${day}: Should match expected value ${expected.tax}`);
      }
    }
  });
});