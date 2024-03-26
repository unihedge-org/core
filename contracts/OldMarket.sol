// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.0;
// //pragma experimental ABIEncoderV2;

// import "./MarketFactory.sol";
// import "./MLib.sol";
// import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
// import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";
// import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "@uniswap/v2-periphery/contracts/libraries/UQ112x112.sol";
// //Comment this out before deployment
// // import "hardhat/console.sol";


// /// @title TWPM Market
// /// @author UniHedge
// /// @dev All function calls are currently implemented without side effects
// contract Market {
//     using UQ112x112 for uint224;
//     //Length of a frame
//     uint public period; //64b -- Data packing into storage slots (1 slot = 32 bytes) --> 4*64b = 32 bytes
//     //Contract creation time
//     uint public initTimestamp; //64b
//     //Protocol fee
//     uint public feeProtocol = 100; //64b
//     //Reporting time for pair price
//     uint public tReporting; //64b
//     //Token pair on Uniswap
//     IUniswapV2Pair public uniswapPair; //256b
//     //Range of a lot
//     uint public dPrice; //256b
//     //Fee that gets to market owner
//     uint public feeMarket; //256b
//     //Tax on lots
//     uint public taxMarket; //256b
//     //Contract for creating markets
//     MarketFactory public factory; //256b
//     //ERC20 token used for buyng lots in this contract 
//     IERC20 public accountingToken; //256b
//     //Owner of this market
//     address public ownerMarket; //256b
//     //Minimal lot tax per frame
//     uint public minTax; //256b
//     //Average price calculation
//     bool public avgPriceSwitch = false;
//     //Scalar number used for calculating precentages
//     uint public scalar = 1e24; //256b  

//     // mapping(uint => mapping(uint => MLib.Lot)) public lots;
//     mapping(uint => mapping(uint => MLib.Lot[])) public lots;
//     mapping(uint => MLib.Frame) public frames;
//     mapping(address => uint[]) public userFrames;
    
//     //Mapping the User struct to the user's address
//     mapping(address => MLib.User) public users;
//     //Array of user addresses
//     address[] public userAddresses;
//     //Mapping to check if the address has bought a lot in this Market
//     // mapping(address => bool) public hasBoughtLot;

//     uint[] public framesKeys;

//     event FrameUpdate(uint frameKey, uint oracleTimestampStart, uint oracleTimestampEnd, uint oraclePrice0CumulativeStart, uint oraclePrice0CumulativeEnd, uint oraclePrice1CumulativeStart, uint oraclePrice1CumulativeEnd, uint rewardFund);
//     event LotUpdate(uint frameKey, MLib.Lot lotStruct);

//     constructor(MarketFactory _factory, IERC20 _token, IUniswapV2Pair _uniswapPair, uint _period, uint _initTimestamp, uint _taxMarket, uint _feeMarket, uint _dPrice, uint _tReporting, uint _minTax, bool _avgPriceSwitch) {
//         accountingToken = _token;
//         ownerMarket = tx.origin;
//         period = _period;
//         initTimestamp = _initTimestamp; 
//         taxMarket = _taxMarket;
//         feeMarket = _feeMarket;
//         uniswapPair = _uniswapPair;
//         dPrice = _dPrice;
//         factory = _factory;
//         tReporting = _tReporting;
//         minTax = _minTax;
//         avgPriceSwitch = _avgPriceSwitch;
//     }

//     modifier isFactoryOwner() {
//         require(msg.sender == factory.owner());
//         _;
//     }

//     //Should it be private and another copy is used in marektGetter contract?....
//     function hasValidPrices(uint frameKey) public view{
//         //require(frames[frameKey].state == SFrame.OPENED, "FRAME NOT OPENED");
//         if (frames[frameKey].oraclePrice0CumulativeStart <= 0 || frames[frameKey].oraclePrice0CumulativeEnd <= 0 || frames[frameKey].oraclePrice1CumulativeStart <= 0 || frames[frameKey].oraclePrice1CumulativeEnd <= 0) {
//             //frames[framekey].state = SFrame.INVALID;
//             revert();
//         }
//         if (frames[frameKey].oraclePrice0CumulativeStart == frames[frameKey].oraclePrice0CumulativeEnd || frames[frameKey].oraclePrice1CumulativeStart == frames[frameKey].oraclePrice1CumulativeEnd) {
//             //frames[framekey].state = SFrame.INVALID;
//             revert();
//         }
//     }

//     function minTaxCheck(uint frameKey, uint acqPrice) private view{
//         uint tax = clcTax(frameKey, acqPrice);  //acqPrice * (taxMarket) / (100000);
//         require(tax >= minTax);
//     }

//     /// @notice Calculate frames timestamp (beggining of frame)
//     /// @param timestamp In seconds
//     /// @return frame's timestamp (key)
//     function clcFrameTimestamp(uint timestamp) public view returns (uint){
//         if (timestamp <= initTimestamp) return initTimestamp;
//         return timestamp - ((timestamp - initTimestamp) % (period));
//     }
    
//     /// @notice Calculate top boundary of a lot
//     /// @param value Arbitary price of market's Uniswap pair
//     /// @return lot key (top boundary)
//     function clcLotKey(uint value) public view returns (uint){
//         if (value <= 0) return dPrice;
//         return value / (dPrice) * (dPrice);
//     }

//     /// @notice Calculate how many frames there are left untill given frame in input
//     /// @param frameKey Timestamp of an arbitary frame in the future
//     /// @return number of frames (whole numbers: n=0,1,2...)
//     function clcFramesLeft(uint frameKey) private view returns (uint){     
//         if (frameKey == clcFrameTimestamp(block.timestamp)) return 0;                 
//         return (((frameKey - (block.timestamp)) / period));
//     }

//     /// @notice Get Frame struct
//     /// @param frameKey MLib.Frame's timestamp
//     /// @return Frame struct
//     function getFrame(uint frameKey) external view returns (MLib.Frame memory){
//         return(frames[frameKey]);           
//     }

//     // function getLotArrays(uint frameKey, uint lotKey) public view returns (uint256[] memory, address[] memory) {
//     //     return (lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice, lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotOwner);
//     // }

//     /// @notice Get lor key array of a frame 
//     /// @param frameKey Frame's timestamp
//     /// @return lot count
//     function getLotKeys(uint frameKey) external view returns (uint[] memory){                 
//         return frames[frameKey].lotKeys;
//     }

//     /// @notice Get number of frames
//     /// @return number frames
//     function getNumberOfFrameKeys() external view returns (uint){
//         return framesKeys.length;
//     }

//     /// @notice Get all user's addresses
//     /// @return Array of user's addresses
//     function getUserAddresses() external view returns (address[] memory){
//         return userAddresses;
//     }

//     function getUserReferrals(address userAddress) external view returns (address[] memory){
//         return users[userAddress].referrals;
//     }


//     //TODO: Poglej si še 1x razlike med private, internal, external, public..
//     /// @notice Create User struct and add the address to the userAddresses array
//     /// @param newUser User's address
//     /// @param referredBy Referral's address. 0x0 if no referral
//     function createUser(address newUser, address referredBy) private {
//         users[newUser].userPublicKey = newUser;
//         users[newUser].commulativeTax = 0;
//         users[newUser].referredBy = referredBy;
//         userAddresses.push(newUser);
//         //Check if referredBy is non-zero address
//         //If it is, add newUser address to the referredBy user
//         if (referredBy != address(0)) {
//             users[referredBy].referrals.push(newUser);
//         }
//     }

//     /// @notice Create a frame
//     /// @param timestamp In second.
//     /// @return frameTimestamp MLib.Frame's key (timestamp that indicated the beggining of a frame).
//     function getOrCreateFrame(uint timestamp) internal returns (uint){
//         //Get frame's timestamp - frame key
//         uint frameKey = clcFrameTimestamp(timestamp);
//         //Check if frame exists
//         if (frames[frameKey].state != MLib.SFrame.NULL) return frameKey;
//         require(frameKey >= clcFrameTimestamp(block.timestamp));
//         //Add frame
//         frames[frameKey].frameKey = frameKey;
//         frames[frameKey].state = MLib.SFrame.OPENED;
//         framesKeys.push(frameKey);
//         return frameKey;
//     }

//     //TODO: Update this so you always make a new lot
//     /// @notice Create a lot
//     /// @param frameKey MLib.Frame's timestamp
//     /// @param pairPrice Price is the trading pair's price
//     /// @return lotKey
//     function getOrCreateLot(uint frameKey, uint pairPrice) internal returns(uint){
//         uint lotKey = clcLotKey(pairPrice);
//         if (lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].state != MLib.SLot.NULL) return lotKey;
//         lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].frameKey = frameKey;
//         lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotKey = lotKey;
//         frames[frameKey].lotKeys.push(lotKey);
//         return lotKey;
//     }

//     //TODO: Update this funcion to use tax per second and then just multiply everything
//     function clcTax(uint frameKey, uint acquisitionPrice) public view returns (uint tax) {             
//         uint taxPerSecond = (scalar * acquisitionPrice * taxMarket / 100000) / period;
//         tax = (((frameKey+period) - block.timestamp) * taxPerSecond) / scalar;
//         return tax;
//     }

//     /// @notice Calculate amout required to approve to buy a lot
//     /// @param timestamp MLib.Frame's timestamp get's calculated from this value
//     /// @param pairPrice Is trading pair's price (to get correct lot key) 
//     /// @param acqPrice New sell price is required to calculate tax
//     function buyLot(uint timestamp, uint pairPrice, uint acqPrice, address referralPublicKey) external {
//         //Create new User if it doesn't exist
//         require(users[referralPublicKey].commulativeTax > 0 && referralPublicKey != msg.sender
//         || referralPublicKey == address(0));
//         if(users[msg.sender].commulativeTax == 0){
//             createUser(msg.sender, referralPublicKey);
//         }

//         //Get frameKey and lotKey values
//         uint frameKey =  getOrCreateFrame(timestamp);        
//         minTaxCheck(frameKey, acqPrice);                  
//         uint lotKey = getOrCreateLot(frameKey, pairPrice);
//         // console.log("Buy lot: ", lotKey, " frameKey: ", frameKey);
//         require(frameKey >= clcFrameTimestamp(block.timestamp));
//         require(msg.sender != lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotOwner);

//         uint tax = clcTax(frameKey, acqPrice);

//         //Approved amount has to be at leat equal to price of the MLib.Lot(with tax)
//         require(accountingToken.allowance(msg.sender, address(this)) >= (lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice + tax));
//         //Transfer tax amount to the market contract
//         accountingToken.transferFrom(msg.sender, address(this), (lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice + tax));
//         frames[frameKey].rewardFund = (frames[frameKey].rewardFund + tax);

//         //Update user's cummulativetax in user struct
//         users[msg.sender].commulativeTax = users[msg.sender].commulativeTax + tax;

//         //Pay the current owner + return leftover tax
//         if (lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].state == MLib.SLot.BOUGHT) {
//             uint taxRetrn = clcTax(frameKey, lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice);
//             //transfer funds
//             accountingToken.transfer(lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotOwner, (taxRetrn + lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice));
//             //update reward fund
//             frames[frameKey].rewardFund = frames[frameKey].rewardFund - taxRetrn;

//             //update users cummulativetax in user struct
//             users[lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotOwner].commulativeTax = users[lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotOwner].commulativeTax - taxRetrn;
//         }
//         else {
//             lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].state = MLib.SLot.BOUGHT;
//         }
//        //Update lotKey values
//         lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotOwner = msg.sender;
//         lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice = acqPrice;
//         userFrames[msg.sender].push(frameKey);

//         updateFramePrices();

//         emit FrameUpdate(frameKey, 
//                          frames[frameKey].oracleTimestampStart,
//                          frames[frameKey].oracleTimestampEnd,
//                          frames[frameKey].oraclePrice0CumulativeStart,
//                          frames[frameKey].oraclePrice0CumulativeEnd,
//                          frames[frameKey].oraclePrice1CumulativeStart,
//                          frames[frameKey].oraclePrice1CumulativeEnd,
//                          frames[frameKey].rewardFund);
//         emit LotUpdate(frameKey, lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1]);
//     }

//     /// @notice Owner can update lot's price. Has to pay additional tax, or leftover tax gets' returned to him if the new price is lower
//     /// @param timestamp MLib.Frame's timestamp get's calculated from this value
//     /// @param pairPrice Is trading pair's price (to get correct lot key) 
//     /// @param acqPrice New acquisition price
//     function updateLotPrice(uint timestamp, uint pairPrice, uint acqPrice) external {
//         uint frameKey = getOrCreateFrame(timestamp); 
//         minTaxCheck(frameKey,acqPrice);
//         uint lotKey = getOrCreateLot(frameKey, pairPrice); 
//         require(lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].lotOwner == msg.sender);
//         require(frameKey >= clcFrameTimestamp(block.timestamp));

//         uint taxNew = clcTax(frameKey, acqPrice);
//         uint taxOld = clcTax(frameKey, lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice);

//         if (taxNew > taxOld) {
//             require(accountingToken.allowance(msg.sender, address(this)) >= (taxNew - taxOld));
//             //Transfer complete tax amount to the frame rewardFund
//             accountingToken.transferFrom(msg.sender, address(this), (taxNew - taxOld));
//             frames[frameKey].rewardFund = frames[frameKey].rewardFund + (taxNew- taxOld);

//             //Update user's cummulativetax in user struct
//             users[msg.sender].commulativeTax = users[msg.sender].commulativeTax + (taxNew - taxOld);
//         }
//         else if (taxNew < taxOld) {
//             accountingToken.transfer(msg.sender, taxOld - taxNew);
//             frames[frameKey].rewardFund = frames[frameKey].rewardFund - (taxOld - taxNew);

//             //Update user's cummulativetax in user struct
//             users[msg.sender].commulativeTax = users[msg.sender].commulativeTax - (taxOld - taxNew);
//         }
//         lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1].acquisitionPrice = acqPrice;

//         updateFramePrices();
//         emit LotUpdate(frameKey, lots[frameKey][lotKey][lots[frameKey][lotKey].length - 1]);
//     }

//     /// @notice Update trading pair's prices in the frame
//     function updateFramePrices() public {
//         uint frameKey = clcFrameTimestamp(block.timestamp);

//         //Correct price if outside settle interval
//         if (block.timestamp < ((frameKey + (period)) - (tReporting))) {
//             (frames[frameKey].oraclePrice0CumulativeStart, frames[frameKey].oraclePrice1CumulativeStart, frames[frameKey].oracleTimestampStart) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
//             (frames[frameKey].oraclePrice0CumulativeEnd, frames[frameKey].oraclePrice1CumulativeEnd, frames[frameKey].oracleTimestampEnd) = (frames[frameKey].oraclePrice0CumulativeStart, frames[frameKey].oraclePrice1CumulativeStart, frames[frameKey].oracleTimestampStart); 
//         }
//         else if (block.timestamp >= ((frameKey + (period)) - (tReporting))) {
//             (frames[frameKey].oraclePrice0CumulativeEnd, frames[frameKey].oraclePrice1CumulativeEnd, frames[frameKey].oracleTimestampEnd) = UniswapV2OracleLibrary.currentCumulativePrices(address(uniswapPair));
//         }

//         emit FrameUpdate(frameKey, 
//                          frames[frameKey].oracleTimestampStart,
//                          frames[frameKey].oracleTimestampEnd,
//                          frames[frameKey].oraclePrice0CumulativeStart,
//                          frames[frameKey].oraclePrice0CumulativeEnd,
//                          frames[frameKey].oraclePrice1CumulativeStart,
//                          frames[frameKey].oraclePrice1CumulativeEnd,
//                          frames[frameKey].rewardFund);
//     }

//     /// @notice Close frame
//     /// @param frameKey MLib.Frame's timestamp
//     function closeFrame(uint frameKey) private{
//         hasValidPrices(frameKey);
//         require( (frameKey + period) <= block.timestamp);
//         frames[frameKey].state = MLib.SFrame.CLOSED;
//         address factoryOwner = factory.owner();
        
//         //Calculate time-weighted average price -- UQ112x112 encoded
//         uint timeDiff = frames[frameKey].oracleTimestampEnd - frames[frameKey].oracleTimestampStart;
//         if (avgPriceSwitch) frames[frameKey].priceAverage = FixedPoint.decode(FixedPoint.uq112x112(uint224((frames[frameKey].oraclePrice0CumulativeEnd - frames[frameKey].oraclePrice0CumulativeStart) / (timeDiff))));
//         else frames[frameKey].priceAverage = FixedPoint.decode(FixedPoint.uq112x112(uint224((frames[frameKey].oraclePrice1CumulativeEnd - frames[frameKey].oraclePrice1CumulativeStart) / (timeDiff))));
//         frames[frameKey].priceAverage = frames[frameKey].priceAverage*scalar;
//         //Subtract fees from the reward amount 
//         uint marketOwnerFees = frames[frameKey].rewardFund * (feeMarket) / 100000;
//         uint protocolOwnerFees = frames[frameKey].rewardFund * (feeProtocol) / 100000;
//         frames[frameKey].rewardFund = frames[frameKey].rewardFund - marketOwnerFees - protocolOwnerFees;
//         //Transfer fees to owners
//         accountingToken.transfer(ownerMarket, marketOwnerFees);
//         accountingToken.transfer(factoryOwner, protocolOwnerFees);
//         emit FrameUpdate(frameKey, 
//                          frames[frameKey].oracleTimestampStart,
//                          frames[frameKey].oracleTimestampEnd,
//                          frames[frameKey].oraclePrice0CumulativeStart,
//                          frames[frameKey].oraclePrice0CumulativeEnd,
//                          frames[frameKey].oraclePrice1CumulativeStart,
//                          frames[frameKey].oraclePrice1CumulativeEnd,
//                          frames[frameKey].rewardFund);
//     }

//     /// @notice Settle lot for a owner. Owner's share of the reward amount get's transfered to owner's account
//     /// @param frameKey MLib.Frame's timestamp
//     function settleLot(uint frameKey) private{  
//         //Check if frame is closed
//         require(frames[frameKey].state == MLib.SFrame.CLOSED);    
//         //Calcualte the winning lot key
//         //uint avgPrice = FixedPoint.decode(frames[frameKey].priceAverage); 
//         // console.log("Average price: ", frames[frameKey].priceAverage);
//         uint lotKeyWin = (clcLotKey(frames[frameKey].priceAverage));
//         // console.log("Frame : ", frameKey);
//         // console.log("lotKeyWin Owner: ", lots[frameKey][lotKeyWin].lotOwner);
//         //Check if the lot is already settled
//         require(lots[frameKey][lotKeyWin][lots[frameKey][lotKeyWin].length - 1].state != MLib.SLot.SETTLED, "R9");
//         //Transfer winnings to last owner
//         require(lots[frameKey][lotKeyWin][lots[frameKey][lotKeyWin].length - 1].lotOwner != 0x0000000000000000000000000000000000000000);
//         accountingToken.transfer(lots[frameKey][lotKeyWin][lots[frameKey][lotKeyWin].length - 1].lotOwner, frames[frameKey].rewardFund);
//         //State is changed to settled
//         lots[frameKey][lotKeyWin][lots[frameKey][lotKeyWin].length - 1].state = MLib.SLot.SETTLED;

//         emit LotUpdate(frameKey, lots[frameKey][lotKeyWin][lots[frameKey][lotKeyWin].length - 1]);
//     }

//     // /// @notice User can claim the reward if he owns the winning lot
//     // /// @param frameKey MLib.Frame's timestamp
//     // function claimReward(uint frameKey) external{
//     //     closeFrame(frameKey);
//     //     settleLot(frameKey);
//     // }

//     /// @notice Manually update pair price
//     /// @dev only for testing phase 
//     /// @dev will be removed in the final version
//     /// @param frameKey Framkey timestamp
//     /// @param avgPrice New average price 
//     function UpdatePairPrice(uint frameKey, uint avgPrice) external isFactoryOwner {
//         frames[frameKey].state = MLib.SFrame.OPENED;
//         frames[frameKey].priceAverage = avgPrice; 
//     }

//     /// @notice Withdraw any amount out of the contract. 
//     /// @dev Only owner of the factory can withdraw funds
//     /// @dev Only for testing phase
//     /// @param amount Amount you want to withdraw
//     function emptyFunds(uint amount) external isFactoryOwner {  
//         accountingToken.transfer(factory.owner(), amount);
//     }


// }
