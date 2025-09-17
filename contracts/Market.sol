// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {FixedPoint96} from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";

/// @author UniHedge


contract Market {
    // [seconds] 1 day
    uint256 private constant DEFAULT_PERIOD = 86_400;
    // [unix timestamp] example start time
    uint256 private constant DEFAULT_INIT_TIMESTAMP = 1_756_742_400;
    // [seconds] 10 minutes
    uint256 private constant DEFAULT_T_SETTLE = 600;
    // [Q96] 3.0000%
    uint256 private constant DEFAULT_FEE_PROTOCOL_Q96 = 236118324143482260684;
    // [Q96] 10.0000% discharged each frame
    uint256 private constant DEFAULT_DISCHARGE_PCT_Q96 = 79228162514264337593;
    // [seconds] ~1.6 hours
    uint256 private constant DEFAULT_TAX_ANCHOR_SECONDS = 5_760;
    // [token units, not decimals-adjusted] 100 units of accounting token
    uint256 private constant DEFAULT_LOT_STEP_T = 100;
    // [address] Accounting USDC
    address public constant DEFAULT_ACCOUNTING_TOKEN = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;
    // [address] WETH/USDC.e Uniswap V3 pool
    address public constant DEFAULT_UNISWAP_POOL = 0x45dDa9cb7c25131DF268515131f647d726f50608;

    // Length of a frame in [seconds]
    uint public period;

    // Market begin timestamp
    uint public initTimestamp;

    // Protocol fee per frame (Q96)
    uint256 public feeProtocolQ96;

    // Settle interval for average price calculation in [seconds]
    uint public tSettle;

    // Uniswap V3 pool for price reference
    IUniswapV3Pool public uniswapPool;

    // Rate range step of a lot (resolution) in Q96
    uint256 public lotRateStepQ96;

    // ERC20 token used for buying lots in this contract
    IERC20Metadata public accountingToken;

    // Base unit for calculations (10^decimals(accountingToken)), in token units (T)
    uint public immutable baseUnitT;

    // Owner of this market
    address public owner;

    // 🔁 Discharge rate (Q96) — fraction of pool released each frame
    uint256 public dischargeRateQ96;

    // Masking lot key ID parameters
    uint256 constant FRAMEKEY_BITS = 64;
    uint256 constant FRAMEKEY_MASK = (uint256(1) << FRAMEKEY_BITS) - 1;

    // Optional knobs
    uint256 public taxAnchorSeconds;

    // Enums & structs unchanged...
    enum SFrame {NULL, OPENED, CLOSED, RATED, SETTLED}
    struct Settlement {
        uint timestamp;                // settlement time
        uint blockNumber;              // settlement block
        address winner;                // winning position
        uint256 rateQ96;               // settlement rate (Q96 fixed-point)

        // --- Intermediate accounting ---
        uint256 taxCollectedT;         // raw tax collected during this frame
        uint256 taxFeeT;               // fee taken from tax inflows (once per tx)
        uint256 taxPotT;               // distributable tax (TaxCollected - TaxFee)

        // --- Pool balance before discharge ---
        uint256 poolBalanceT;          // total before discharge (undischargedBalancePrevT + taxPotT)

        // --- Discharge ---
        uint256 dischargedRewardT;     // portion leaving the pool (payout to the winner)
        uint256 undischargedBalanceT;  // portion that stays, carried to the next frame
    }


    enum STrade {PURCHASE, REVALUATE, RESALE}
    struct Trade {
        uint64 timestamp;
        uint64 blockNumber;
        uint256 lotID;
        address owner;
        uint256 acquisitionPriceQ96;
        // Tax paid for this trade, in token units (T)
        uint256 taxT;
        uint256 horizon;
        STrade mode;
    }

    Trade[] public trades;

    struct Frame {
        uint frameKey;
        uint[] trades;
        Settlement settlement;
    }

    mapping(uint => Frame) public frames;
    uint[] public framesKeys;

    event FrameUpdate(Frame frame);
    enum SLot {NULL, TAKEN, WON, LOST}
    struct Lot {
        uint lotId;
        uint[] trades;
    }

    mapping(uint256 => Lot) public lots;
    uint256[] public lotsIds;

    event LotUpdate(Lot lot);

    constructor(
        address _acct,                    // accounting token (0 => DEFAULT_ACCOUNTING_TOKEN)
        address _uniswapPool,             // Uniswap V3 pool (0 => DEFAULT_UNISWAP_POOL)
        uint256 _lotStepInTokenUnits,     // pass "100 * 10^decimals" or 0 => DEFAULT_LOT_STEP_T * baseUnitT
        uint256 _feeProtocolQ96,          // protocol fee as Q96 fraction; 0 => DEFAULT_FEE_PROTOCOL_Q96
        uint256 _dischargeRateQ96,        // discharge as Q96 fraction; 0 => DEFAULT_DISCHARGE_PCT_Q96
        uint256 _period,                  // seconds; 0 => DEFAULT_PERIOD
        uint256 _initTimestamp,           // unix start; 0 => DEFAULT_INIT_TIMESTAMP
        uint256 _tSettle,                 // seconds; 0 => DEFAULT_T_SETTLE
        uint256 _taxAnchorSeconds         // seconds; 0 => DEFAULT_TAX_ANCHOR_SECONDS
    ) {
        owner = msg.sender;

        // ---- External deps ----
        address acctAddr = _acct != address(0) ? _acct : DEFAULT_ACCOUNTING_TOKEN;
        address poolAddr = _uniswapPool != address(0) ? _uniswapPool : DEFAULT_UNISWAP_POOL;

        accountingToken = IERC20Metadata(acctAddr);
        uniswapPool = IUniswapV3Pool(poolAddr);

        // ---- Token base unit (T) ----
        uint8 dec = accountingToken.decimals();
        require(dec <= 77, "decimals too large"); // guard 10**dec
        baseUnitT = 10 ** uint256(dec);

        // ---- Time params ----
        period = _period != 0 ? _period : DEFAULT_PERIOD;
        require(period > 0, "period=0");

        initTimestamp = _initTimestamp != 0 ? _initTimestamp : DEFAULT_INIT_TIMESTAMP;

        tSettle = _tSettle != 0 ? _tSettle : DEFAULT_T_SETTLE;
        require(tSettle > 0, "tSettle=0");

        taxAnchorSeconds = _taxAnchorSeconds != 0 ? _taxAnchorSeconds : DEFAULT_TAX_ANCHOR_SECONDS;
        require(taxAnchorSeconds > 0, "taxAnchor=0");

        // ---- Lot step (T -> Q96) ----
        uint256 lotStepTokens = _lotStepInTokenUnits != 0
            ? _lotStepInTokenUnits
            : DEFAULT_LOT_STEP_T * baseUnitT;
        require(lotStepTokens > 0, "lotStep=0");

        lotRateStepQ96 = Math.mulDiv(lotStepTokens, FixedPoint96.Q96, baseUnitT);
        require(lotRateStepQ96 > 0, "lotStepQ96=0");

        // ---- Q96-native fee/discharge ----
        feeProtocolQ96 = _feeProtocolQ96 != 0 ? _feeProtocolQ96 : DEFAULT_FEE_PROTOCOL_Q96;
        dischargeRateQ96 = _dischargeRateQ96 != 0 ? _dischargeRateQ96 : DEFAULT_DISCHARGE_PCT_Q96;

        // Bounds: 0 <= value <= 1.0 (Q96)
        require(feeProtocolQ96 <= FixedPoint96.Q96, "fee>100%");
        require(dischargeRateQ96 <= FixedPoint96.Q96, "discharge>100%");
    }

    /// @notice Packs a frame key and lot key into a single lot ID.
    /// @param frameKey The frame key.
    /// @param lotKey The lot key.
    /// @return The packed lot ID.
    function packLotId(uint256 frameKey, uint256 lotKey) internal pure returns (uint256) {
        require((frameKey & ~FRAMEKEY_MASK) == 0, "frameKey too large");
        return (lotKey << FRAMEKEY_BITS) | frameKey;
    }

    /// @notice Unpacks a lot ID into its frame key and lot key.
    /// @param lotId The packed lot ID.
    /// @return frameKey The frame key.
    /// @return lotKey The lot key.
    function unpackLotId(uint256 lotId) internal pure returns (uint256 frameKey, uint256 lotKey) {
        frameKey = lotId & FRAMEKEY_MASK;
        lotKey = lotId >> FRAMEKEY_BITS;
    }

    /// @notice Returns the state of a frame.
    /// @param frameKey The frame key.
    /// @return The state of the frame.
    function getFrameState(uint frameKey) public view returns (SFrame){
        if (frames[frameKey].frameKey == 0) return SFrame.NULL;
        if (frames[frameKey].settlement.winner != address(0)) return SFrame.SETTLED;
        if (block.timestamp < frames[frameKey].frameKey + period) return SFrame.OPENED;
        if (frames[frameKey].settlement.rateQ96 > 0) return SFrame.RATED;
        return SFrame.CLOSED;
    }

    /// @notice Returns the state of a lot.
    /// @param lotId The lot ID.
    /// @return The state of the lot.
    function getLotState(uint256 lotId) public view returns (SLot) {
        Lot storage L = lots[lotId];
        if (L.lotId == 0) return SLot.NULL;

        (uint256 frameKey, uint256 lotKeyTokens) = unpackLotId(lotId);

        SFrame fs = getFrameState(frameKey);
        if (fs == SFrame.NULL) return SLot.NULL;
        if (fs == SFrame.OPENED || fs == SFrame.CLOSED) return SLot.TAKEN;

        // Convert snapped token key to Q96 range for comparison
        uint256 lowerQ96 = toQ96(lotKeyTokens);
        uint256 upperQ96 = lowerQ96 + lotRateStepQ96;

        uint256 settleRateQ96 = frames[frameKey].settlement.rateQ96;
        if (settleRateQ96 >= lowerQ96 && settleRateQ96 < upperQ96) return SLot.WON;
        return SLot.LOST;
    }

    /// @notice Calculates the frame key for a given timestamp.
    /// @param timestamp The timestamp.
    /// @return The calculated frame key.
    function clcFrameKey(uint timestamp) public view returns (uint){
        if (timestamp <= initTimestamp) return initTimestamp;
        return timestamp - ((timestamp - initTimestamp) % (period));
    }

    /// @notice Snap a Q96 value to the nearest lot boundary and return in token units
    function clcLotKeyT(uint256 valueQ96) public view returns (uint256) {
        uint256 valueTokens = fromQ96(valueQ96);
        uint256 stepTokens = fromQ96(lotRateStepQ96);

        if (valueTokens < stepTokens) {
            return stepTokens;
        }

        uint256 steps = valueTokens / stepTokens;
        return steps * stepTokens;
    }

    function getFrame(uint frameKey) public view returns (Frame memory){
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        return (frames[frameKey]);
    }

    function getFramesCount() public view returns (uint){
        return framesKeys.length;
    }

    function getLotsCount() public view returns (uint){
        return lotsIds.length;
    }

    function getLot(uint256 lotId) public view returns (Lot memory){
        return lots[lotId];
    }

    function getTrade(uint256 index) public view returns (Trade memory){
        return trades[index];
    }

    function getTradesCount() public view returns (uint count){
        return trades.length;
    }

    function toQ96(uint256 amountT) public view returns (uint256) {
        return Math.mulDiv(amountT, FixedPoint96.Q96, baseUnitT);
    }

    function fromQ96(uint256 x96) public view returns (uint256) {
        return Math.mulDiv(x96, baseUnitT, FixedPoint96.Q96);
    }

    function createFrame(uint timestamp) internal returns (uint){
        uint frameKey = clcFrameKey(timestamp);
        require(frames[frameKey].frameKey == 0, "Frame already exists");
        require(frameKey + period >= block.timestamp, "Frame has to be in the future");
        frames[frameKey].frameKey = frameKey;
        framesKeys.push(frameKey);
        emit FrameUpdate(frames[frameKey]);
        return frameKey;
    }

    function overrideFrameRate(uint256 frameKey, uint256 rateQ96) external {
        require(msg.sender == owner, "Only owner");
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        require(frames[frameKey].frameKey + period <= block.timestamp, "Frame not closed");
        require(frames[frameKey].settlement.timestamp == 0, "Already settled");
        frames[frameKey].settlement.rateQ96 = rateQ96;
        emit FrameUpdate(frames[frameKey]);
    }

    function getHorizon(uint frameKey) public view returns (uint256){
        uint256 settlementTs = frameKey + period;
        require(settlementTs > block.timestamp, "Frame closed");
        // seconds left in the frame
        return settlementTs - block.timestamp;
    }

    /// @notice Current tax rate for a frame in Q96 (1.0 = FixedPoint96.Q96).
    /// @dev τ(t) = 1 / sqrt(1 + t / taxAnchorSeconds); rate = maxTaxRateQ96 * τ.
    function getTaxRateQ96(uint256 frameKey) public view returns (uint256) {
        // seconds left in the frame
        uint256 t = getHorizon(frameKey);

        // denom = 1 + t / taxAnchorSeconds   (in Q96)
        // i.e., denomQ96 = Q96 + (t * Q96 / taxAnchorSeconds)
        uint256 denomQ96 = FixedPoint96.Q96 + Math.mulDiv(t, FixedPoint96.Q96, taxAnchorSeconds);

        // sqrt(denom) in Q96:
        // If x is Q96, then sqrt(x) in Q96 = sqrt(x << 96)
        uint256 sqrtDenomQ96 = Math.sqrt(denomQ96 << 96);

        // τ(t) = 1 / sqrt(denom)  (in Q96)
        // τ_Q96 = (Q96 * Q96) / sqrtDenomQ96
        uint256 tauQ96 = Math.mulDiv(FixedPoint96.Q96, FixedPoint96.Q96, sqrtDenomQ96);

        // maxTaxRate was 100%, so effective rate = τ(t)
        return tauQ96;
    }

    /// @notice Calculate one-time tax in token units (T) for an acquisition at this frame.
    function clcTaxT(uint256 frameKey, uint256 acquisitionPriceQ96) public view returns (uint256) {
        uint256 rateQ96 = getTaxRateQ96(frameKey);
        uint256 taxQ96 = Math.mulDiv(rateQ96, acquisitionPriceQ96, FixedPoint96.Q96);
        return fromQ96(taxQ96); // convert Q96 fraction → tokens
    }

    function tradeLot(
        uint256 timestamp,            // target frame time (lot belongs here)
        uint256 rateQ96,              // price signal (Q96)
        uint256 acquisitionPriceQ96   // new acquisition price (Q96)
    ) external {
        uint256 frameKey = clcFrameKey(timestamp);
        require(block.timestamp < frameKey + period, "Frame not open");

        uint256 lotKey = clcLotKeyT(rateQ96);
        uint256 lotId = packLotId(frameKey, lotKey);

        if (frames[frameKey].frameKey == 0) createFrame(timestamp);

        uint256 activeFrameKey = clcFrameKey(block.timestamp);
        if (frames[activeFrameKey].frameKey == 0) createFrame(block.timestamp);

        Lot storage L = lots[lotId];
        if (L.lotId == 0) {
            purchaseLot(lotId, acquisitionPriceQ96, activeFrameKey);
        } else {
            uint lastIdx = L.trades[L.trades.length - 1];
            address currentOwner = trades[lastIdx].owner;

            if (currentOwner == msg.sender) {
                revaluateLot(lotId, acquisitionPriceQ96, activeFrameKey);
            } else {
                resaleLot(lotId, acquisitionPriceQ96, activeFrameKey, currentOwner);
            }
        }
    }

    function purchaseLot(
        uint256 lotId,
        uint256 acquisitionPriceQ96,
        uint256 activeFrameKey
    ) internal {
        (uint256 frameKey, /*lotKey*/) = unpackLotId(lotId);

        uint256 horizon = getHorizon(frameKey);
        uint256 taxT = clcTaxT(frameKey, acquisitionPriceQ96);
        require(taxT > 0, "Tax must be > 0");
        require(accountingToken.allowance(msg.sender, address(this)) >= taxT, "Allowance");
        accountingToken.transferFrom(msg.sender, address(this), taxT);

        require(lots[lotId].lotId == 0, "Lot exists");
        Lot storage L = lots[lotId];
        L.lotId = lotId;
        lotsIds.push(lotId);

        trades.push(Trade({
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            lotID: lotId,
            owner: msg.sender,
            acquisitionPriceQ96: acquisitionPriceQ96,
            taxT: taxT,
            horizon: horizon,
            mode: STrade.PURCHASE
        }));
        uint idx = trades.length - 1;

        frames[activeFrameKey].trades.push(idx);
        L.trades.push(idx);
    }

    function revaluateLot(
        uint256 lotId,
        uint256 acquisitionPriceQ96,
        uint256 activeFrameKey
    ) internal {
        (uint256 frameKey, /*lotKey*/) = unpackLotId(lotId);

        Lot storage L = lots[lotId];
        require(L.lotId != 0, "Lot !exist");
        {
            uint lastIdx = L.trades[L.trades.length - 1];
            require(trades[lastIdx].owner == msg.sender, "Only owner");
        }

        uint256 horizon = getHorizon(frameKey);
        uint256 taxT = clcTaxT(frameKey, acquisitionPriceQ96);
        require(taxT > 0, "Tax must be > 0");
        require(accountingToken.allowance(msg.sender, address(this)) >= taxT, "Allowance");
        accountingToken.transferFrom(msg.sender, address(this), taxT);

        trades.push(Trade({
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            lotID: lotId,
            owner: msg.sender,
            acquisitionPriceQ96: acquisitionPriceQ96,
            taxT: taxT,
            horizon: horizon,
            mode: STrade.REVALUATE
        }));
        uint idx = trades.length - 1;

        frames[activeFrameKey].trades.push(idx);
        L.trades.push(idx);
    }

    function resaleLot(
        uint256 lotId,
        uint256 acquisitionPriceQ96,
        uint256 activeFrameKey,
        address previousOwner
    ) internal {
        (uint256 frameKey, /*lotKey*/) = unpackLotId(lotId);

        Lot storage L = lots[lotId];
        require(L.lotId != 0, "Lot !exist");
        {
            uint lastIdx = L.trades[L.trades.length - 1];
            require(trades[lastIdx].owner == previousOwner, "Prev owner mismatch");
            require(previousOwner != msg.sender, "Use revalue");
        }

        uint256 horizon = getHorizon(frameKey);
        uint256 taxT = clcTaxT(frameKey, acquisitionPriceQ96);
        require(taxT > 0, "Tax must be > 0");

        uint lastIdx2 = L.trades[L.trades.length - 1];
        uint256 lastAcqQ96 = trades[lastIdx2].acquisitionPriceQ96;
        uint256 priceToken = fromQ96(lastAcqQ96);

        uint256 need = taxT + priceToken;
        require(accountingToken.allowance(msg.sender, address(this)) >= need, "Allowance");
        accountingToken.transferFrom(msg.sender, address(this), taxT);
        accountingToken.transferFrom(msg.sender, previousOwner, priceToken);

        trades.push(Trade({
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            lotID: lotId,
            owner: msg.sender,
            acquisitionPriceQ96: acquisitionPriceQ96,
            taxT: taxT,
            horizon: horizon,
            mode : STrade.RESALE
        }));
        uint idx = trades.length - 1;

        frames[activeFrameKey].trades.push(idx);
        L.trades.push(idx);
    }

    /* Calculate the current price of the pool
     *  @return price - the current price of the pool
     */
    function clcRateQ96() public view returns (uint256) {
        (uint160 sqrtPriceX96, , , , , ,) = uniswapPool.slot0();

        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 priceQ96 = priceX192 >> 96;

        address token0 = uniswapPool.token0();
        address token1 = uniswapPool.token1();

        uint8 decimals0 = IERC20Metadata(token0).decimals();
        uint8 decimals1 = IERC20Metadata(token1).decimals();

        if (decimals0 > decimals1) {
            priceQ96 = Math.mulDiv(priceQ96, 10 ** (decimals0 - decimals1), 1);
        } else if (decimals1 > decimals0) {
            priceQ96 = Math.mulDiv(priceQ96, 1, 10 ** (decimals1 - decimals0));
        }

        // invert to express as token0/token1? (kept as in your original)
        priceQ96 = Math.mulDiv(FixedPoint96.Q96, FixedPoint96.Q96, priceQ96);

        return priceQ96; // Q96
    }

    /* Calculate the average price of the pool from a given timestamp minus 10 minutes to the current timestamp
     *  @param timestamp - the timestamp of the frame
     *  @return price - the average price of the pool over the given time interval
     */
    function clcRateAvgQ96(uint timestamp) public view returns (uint){
        uint32 t1 = uint32(block.timestamp - timestamp + tSettle);
        uint32 t2 = uint32(block.timestamp - timestamp);

        // Create a dynamically-sized array for observe
        uint32[] memory timeIntervals = new uint32[](2);
        timeIntervals[0] = t1;
        timeIntervals[1] = t2;

        (int56[] memory tickCumulatives,) = uniswapPool.observe(timeIntervals);

        int256 tickCumulativeDeltaInt = int256(tickCumulatives[1]) - int256(tickCumulatives[0]);
        require(tickCumulativeDeltaInt >= 0, "Negative tick delta");
        uint256 tickCumulativeDelta = uint256(tickCumulativeDeltaInt);
        uint timeElapsed = uint(t1) - uint(t2);

        uint averageTick = tickCumulativeDelta / timeElapsed;

        uint160 sqrtPriceX96 = getSqrtRatioAtTick(averageTick);

        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 priceQ96 = priceX192 >> 96;

        address token0 = uniswapPool.token0();
        address token1 = uniswapPool.token1();

        uint8 decimals0 = IERC20Metadata(token0).decimals();
        uint8 decimals1 = IERC20Metadata(token1).decimals();

        if (decimals0 > decimals1) {
            priceQ96 = Math.mulDiv(priceQ96, 10 ** (decimals0 - decimals1), 1);
        } else if (decimals1 > decimals0) {
            priceQ96 = Math.mulDiv(priceQ96, 1, 10 ** (decimals1 - decimals0));
        }

        priceQ96 = Math.mulDiv(FixedPoint96.Q96, FixedPoint96.Q96, priceQ96);
        return priceQ96; // Q96
    }

    function getSqrtRatioAtTick(uint tick) internal pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(- int256(tick)) : uint256(int256(tick));
        require(absTick <= uint256(887272), 'T');

        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick > 0) ratio = type(uint256).max / ratio;

        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }

    function setFrameRate(uint256 frameKey) public {
        require(frames[frameKey].frameKey != 0, "Frame doesn't exist");
        require(block.timestamp >= frames[frameKey].frameKey + period, "Frame not closed");
        require(frames[frameKey].settlement.timestamp == 0, "Already settled");
        require(frames[frameKey].settlement.rateQ96 == 0, "Rate already set");

        uint256 rateQ96 = clcRateAvgQ96(frameKey);
        require(rateQ96 <= type(uint256).max, "rateQ96 overflow");
        frames[frameKey].settlement.rateQ96 = uint256(rateQ96);

        emit FrameUpdate(frames[frameKey]);
    }

    function settleFrame(uint256 frameKey) public returns (uint256 dischargedRewardT) {
        require(frameKey >= initTimestamp, "Before init");

        Frame storage f = frames[frameKey];
        require(f.frameKey != 0, "Frame doesn't exist");
        require(block.timestamp >= frameKey + period, "Frame not closed");

        Settlement storage s = f.settlement;
        require(s.timestamp == 0, "Already settled");
        require(s.rateQ96 > 0, "Rate not set");

        // ---- 1) Carry from previous frame (tokens) ----
        uint256 undischargedPrevT = 0;
        uint256 prevKey = frameKey - period;
        if (prevKey >= initTimestamp) {
            Frame storage pf = frames[prevKey];
            if (pf.frameKey != 0 && pf.settlement.timestamp == 0) {
                revert(string(abi.encodePacked("Previous frame not settled.")));
            }
            undischargedPrevT = pf.settlement.undischargedBalanceT;
        }

        // ---- 2) Inflows & fee (tokens) ----
        s.taxCollectedT = _sumTaxCollectedInFrameT(frameKey);
        s.taxFeeT = _calculateFeeT(s.taxCollectedT);
        if (s.taxFeeT > s.taxCollectedT) s.taxFeeT = s.taxCollectedT; // defensive clamp
        if (s.taxFeeT != 0) {
            accountingToken.transfer(owner, s.taxFeeT);
        }
        s.taxPotT = s.taxCollectedT - s.taxFeeT;

        // ---- 3) Pool before discharge (tokens) ----
        s.poolBalanceT = undischargedPrevT + s.taxPotT;

        // ---- 4) Discharge split (tokens) ----
        uint256 discharged = Math.mulDiv(s.poolBalanceT, dischargeRateQ96, FixedPoint96.Q96);
        s.undischargedBalanceT = s.poolBalanceT - discharged;

        // ---- 5) Winner by snapped rate ----
        uint256 lotIdWinner = packLotId(frameKey, clcLotKeyT(s.rateQ96));
        address winnerAddr = address(0);
        {
            Lot storage L = lots[lotIdWinner];
            if (L.lotId != 0 && L.trades.length != 0) {
                winnerAddr = trades[L.trades[L.trades.length - 1]].owner;
            }
        }

        // ---- 6) Payout ----
        if (winnerAddr != address(0) && discharged != 0) {
            accountingToken.transfer(winnerAddr, discharged);
            s.winner = winnerAddr;
            s.dischargedRewardT = discharged;
            dischargedRewardT = discharged;
        } else {
            s.winner = address(1); // sentinel: no winner
            s.dischargedRewardT = 0;
            dischargedRewardT = 0;
        }

        // ---- 7) Metadata ----
        s.timestamp = block.timestamp;
        s.blockNumber = block.number;

        emit FrameUpdate(f);
        return dischargedRewardT;
    }


    /// @notice Returns total HTAX collected in this frame, in TOKEN units (T).
    function _sumTaxCollectedInFrameT(uint256 frameKey) internal view returns (uint256) {
        uint[] storage idxs = frames[frameKey].trades;
        uint256 totalTaxT = 0;
        for (uint i = 0; i < idxs.length; i++) {
            totalTaxT += trades[idxs[i]].taxT; // Q96
        }
        return totalTaxT;
    }

    function withdrawAccountingToken(uint amount) external {
        require(msg.sender == owner, "Only owner can withdraw accounting token");
        accountingToken.transfer(owner, amount);
    }

    /// @notice Calculate protocol fee on a TOKEN amount using a Q96 fraction; returns TOKEN units (T).
    function _calculateFeeT(uint256 amountT) public view returns (uint256) {
        // fee = amountT * (feeProtocolQ96 / Q96)
        return Math.mulDiv(amountT, feeProtocolQ96, FixedPoint96.Q96);
    }
}
