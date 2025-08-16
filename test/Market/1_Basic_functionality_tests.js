// Integration test suite that runs tests 1_0 through 1_5
describe('Market Integration Tests (1_0 to 1_5)', function () {
  // Import and run each test file
  require('./1_0_purchaseLot.js');
  require('./1_1_purchaseAndUpdateLotPriceToHigher.js');
  require('./1_2_purchaseAndUpdateLotPriceToLower.js');
  require('./1_3_resaleLot.js');
  require('./1_4_settleFrameWinner.js');
  require('./1_5_settleFrameNoWinner.js');
});
