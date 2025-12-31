// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CarbonExchange
 * @notice Call Auction exchange for carbon credits (SPE-GRK and PTBAE)
 * @dev Supports escrow, order registry, and batch settlement at clearing price
 */
contract CarbonExchange is AccessControl, ERC2771Context, ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");

    // Token references
    IERC20 public immutable idrcToken;      // Payment token
    IERC1155 public immutable speToken;     // SPE-GRK (ERC-1155)
    
    // Order counter
    uint256 public nextOrderId = 1;

    // Order side enum
    enum Side { BID, ASK }
    
    // Market type enum
    enum MarketType { SPE, PTBAE }

    // Order struct
    struct Order {
        uint256 id;
        address trader;
        MarketType marketType;
        bytes32 marketKey;
        Side side;
        uint256 tokenId;        // For SPE markets (ERC-1155 tokenId)
        address ptbaeToken;     // For PTBAE markets (token contract address)
        uint256 price;          // Price per unit in IDRC (wei)
        uint256 amount;         // Total amount
        uint256 filledAmount;   // Amount already filled
        bool active;            // Order is active
        uint256 createdAt;
    }

    // Order storage
    mapping(uint256 => Order) public orders;
    
    // User's escrowed assets per order
    mapping(uint256 => uint256) public escrowedAmount;

    // Events
    event OrderCreated(
        uint256 indexed orderId,
        address indexed trader,
        MarketType marketType,
        bytes32 indexed marketKey,
        Side side,
        uint256 price,
        uint256 amount
    );
    
    event OrderCancelled(uint256 indexed orderId, address indexed trader);
    
    event AuctionSettled(
        bytes32 indexed marketKey,
        uint256 clearingPrice,
        uint256 totalVolume,
        uint256 matchCount
    );
    
    event TradeExecuted(
        uint256 indexed buyOrderId,
        uint256 indexed sellOrderId,
        bytes32 indexed marketKey,
        uint256 clearingPrice,
        uint256 amount
    );

    // Custom errors
    error InvalidAmount();
    error InvalidPrice();
    error OrderNotFound();
    error OrderNotActive();
    error NotOrderOwner();
    error InsufficientBalance();
    error OrderAlreadyFilled();
    error MarketMismatch();
    error SameSideTrade();

    constructor(
        address admin,
        address trustedForwarder,
        address _idrcToken,
        address _speToken
    ) ERC2771Context(trustedForwarder) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MATCHER_ROLE, admin);
        
        idrcToken = IERC20(_idrcToken);
        speToken = IERC1155(_speToken);
    }

    // ============ MARKET KEY HELPERS ============

    function getSPEMarketKey(uint256 tokenId) public pure returns (bytes32) {
        return keccak256(abi.encode("SPE", tokenId));
    }

    function getPTBAEMarketKey(uint256 period) public pure returns (bytes32) {
        return keccak256(abi.encode("PTBAE", period));
    }

    // ============ ORDER MANAGEMENT ============

    /**
     * @notice Create a new order for SPE market
     */
    function createSPEOrder(
        uint256 tokenId,
        Side side,
        uint256 price,
        uint256 amount
    ) external nonReentrant returns (uint256) {
        if (amount == 0) revert InvalidAmount();
        if (price == 0) revert InvalidPrice();

        bytes32 marketKey = getSPEMarketKey(tokenId);
        address trader = _msgSender();
        uint256 orderId = nextOrderId++;

        // Handle escrow based on side
        if (side == Side.BID) {
            uint256 totalCost = price * amount / 1e18;
            idrcToken.safeTransferFrom(trader, address(this), totalCost);
            escrowedAmount[orderId] = totalCost;
        } else {
            speToken.safeTransferFrom(trader, address(this), tokenId, amount, "");
            escrowedAmount[orderId] = amount;
        }

        orders[orderId] = Order({
            id: orderId,
            trader: trader,
            marketType: MarketType.SPE,
            marketKey: marketKey,
            side: side,
            tokenId: tokenId,
            ptbaeToken: address(0),
            price: price,
            amount: amount,
            filledAmount: 0,
            active: true,
            createdAt: block.timestamp
        });

        emit OrderCreated(orderId, trader, MarketType.SPE, marketKey, side, price, amount);
        return orderId;
    }

    /**
     * @notice Create a new order for PTBAE market
     */
    function createPTBAEOrder(
        address ptbaeToken,
        uint256 period,
        Side side,
        uint256 price,
        uint256 amount
    ) external nonReentrant returns (uint256) {
        if (amount == 0) revert InvalidAmount();
        if (price == 0) revert InvalidPrice();

        bytes32 marketKey = getPTBAEMarketKey(period);
        address trader = _msgSender();
        uint256 orderId = nextOrderId++;

        if (side == Side.BID) {
            uint256 totalCost = price * amount / 1e18;
            idrcToken.safeTransferFrom(trader, address(this), totalCost);
            escrowedAmount[orderId] = totalCost;
        } else {
            IERC20(ptbaeToken).safeTransferFrom(trader, address(this), amount);
            escrowedAmount[orderId] = amount;
        }

        orders[orderId] = Order({
            id: orderId,
            trader: trader,
            marketType: MarketType.PTBAE,
            marketKey: marketKey,
            side: side,
            tokenId: period,
            ptbaeToken: ptbaeToken,
            price: price,
            amount: amount,
            filledAmount: 0,
            active: true,
            createdAt: block.timestamp
        });

        emit OrderCreated(orderId, trader, MarketType.PTBAE, marketKey, side, price, amount);
        return orderId;
    }

    /**
     * @notice Cancel an active order and refund escrow
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        
        if (order.id == 0) revert OrderNotFound();
        if (!order.active) revert OrderNotActive();
        if (order.trader != _msgSender()) revert NotOrderOwner();

        order.active = false;
        uint256 remainingAmount = order.amount - order.filledAmount;

        if (order.side == Side.BID) {
            uint256 refundAmount = order.price * remainingAmount / 1e18;
            idrcToken.safeTransfer(order.trader, refundAmount);
        } else {
            if (order.marketType == MarketType.SPE) {
                speToken.safeTransferFrom(address(this), order.trader, order.tokenId, remainingAmount, "");
            } else {
                IERC20(order.ptbaeToken).safeTransfer(order.trader, remainingAmount);
            }
        }

        emit OrderCancelled(orderId, order.trader);
    }

    // ============ BATCH SETTLEMENT (CALL AUCTION) ============

    /**
     * @notice Settle multiple trades at a single clearing price (Call Auction)
     * @dev Only callable by MATCHER_ROLE (off-chain auction engine)
     * @param marketKey The market being settled
     * @param clearingPrice The computed clearing price for this auction window
     * @param buyOrderIds Array of buy order IDs to match
     * @param sellOrderIds Array of sell order IDs to match
     * @param tradeAmounts Array of amounts for each trade pair
     */
    function settleBatch(
        bytes32 marketKey,
        uint256 clearingPrice,
        uint256[] calldata buyOrderIds,
        uint256[] calldata sellOrderIds,
        uint256[] calldata tradeAmounts
    ) external nonReentrant onlyRole(MATCHER_ROLE) {
        require(buyOrderIds.length == sellOrderIds.length && sellOrderIds.length == tradeAmounts.length, "Array length mismatch");
        
        uint256 totalVolume = 0;
        
        for (uint256 i = 0; i < buyOrderIds.length; i++) {
            _executeTradeAtClearingPrice(
                buyOrderIds[i],
                sellOrderIds[i],
                tradeAmounts[i],
                clearingPrice
            );
            totalVolume += tradeAmounts[i];
        }

        emit AuctionSettled(marketKey, clearingPrice, totalVolume, buyOrderIds.length);
    }

    /**
     * @notice Internal function to execute a single trade at clearing price
     */
    function _executeTradeAtClearingPrice(
        uint256 buyOrderId,
        uint256 sellOrderId,
        uint256 tradeAmount,
        uint256 clearingPrice
    ) internal {
        Order storage buyOrder = orders[buyOrderId];
        Order storage sellOrder = orders[sellOrderId];

        // Validations
        if (buyOrder.id == 0 || sellOrder.id == 0) revert OrderNotFound();
        if (!buyOrder.active || !sellOrder.active) revert OrderNotActive();
        if (buyOrder.side != Side.BID || sellOrder.side != Side.ASK) revert SameSideTrade();
        if (buyOrder.marketKey != sellOrder.marketKey) revert MarketMismatch();

        uint256 buyAvailable = buyOrder.amount - buyOrder.filledAmount;
        uint256 sellAvailable = sellOrder.amount - sellOrder.filledAmount;
        if (tradeAmount > buyAvailable || tradeAmount > sellAvailable) revert InvalidAmount();

        // Calculate payment at clearing price
        uint256 totalPayment = clearingPrice * tradeAmount / 1e18;

        // Update fill amounts
        buyOrder.filledAmount += tradeAmount;
        sellOrder.filledAmount += tradeAmount;

        if (buyOrder.filledAmount >= buyOrder.amount) {
            buyOrder.active = false;
        }
        if (sellOrder.filledAmount >= sellOrder.amount) {
            sellOrder.active = false;
        }

        // Transfer assets
        if (buyOrder.marketType == MarketType.SPE) {
            speToken.safeTransferFrom(address(this), buyOrder.trader, buyOrder.tokenId, tradeAmount, "");
        } else {
            IERC20(sellOrder.ptbaeToken).safeTransfer(buyOrder.trader, tradeAmount);
        }

        // Transfer IDRC to seller at clearing price
        idrcToken.safeTransfer(sellOrder.trader, totalPayment);

        // Refund excess to buyer (if buyer's limit price > clearing price)
        if (buyOrder.price > clearingPrice) {
            uint256 refund = (buyOrder.price - clearingPrice) * tradeAmount / 1e18;
            idrcToken.safeTransfer(buyOrder.trader, refund);
        }

        emit TradeExecuted(buyOrderId, sellOrderId, buyOrder.marketKey, clearingPrice, tradeAmount);
    }

    /**
     * @notice Cancel multiple orders and refund escrow (for clearing order book after auction)
     * @dev Only callable by MATCHER_ROLE
     * @param orderIds Array of order IDs to cancel
     */
    function batchCancelOrders(uint256[] calldata orderIds) external nonReentrant onlyRole(MATCHER_ROLE) {
        for (uint256 i = 0; i < orderIds.length; i++) {
            _cancelOrderInternal(orderIds[i]);
        }
    }

    /**
     * @notice Internal function to cancel an order and refund escrow
     */
    function _cancelOrderInternal(uint256 orderId) internal {
        Order storage order = orders[orderId];
        
        if (order.id == 0) return; // Skip invalid
        if (!order.active) return; // Skip already inactive

        order.active = false;
        uint256 remainingAmount = order.amount - order.filledAmount;
        
        if (remainingAmount == 0) return; // Nothing to refund

        if (order.side == Side.BID) {
            uint256 refundAmount = order.price * remainingAmount / 1e18;
            idrcToken.safeTransfer(order.trader, refundAmount);
        } else {
            if (order.marketType == MarketType.SPE) {
                speToken.safeTransferFrom(address(this), order.trader, order.tokenId, remainingAmount, "");
            } else {
                IERC20(order.ptbaeToken).safeTransfer(order.trader, remainingAmount);
            }
        }

        emit OrderCancelled(orderId, order.trader);
    }

    // ============ VIEW FUNCTIONS ============

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getRemainingAmount(uint256 orderId) external view returns (uint256) {
        Order storage order = orders[orderId];
        if (!order.active) return 0;
        return order.amount - order.filledAmount;
    }

    // ============ OVERRIDES ============

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    function supportsInterface(bytes4 interfaceId) 
        public view override(AccessControl, ERC1155Holder) returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
}
