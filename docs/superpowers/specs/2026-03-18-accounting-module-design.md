# Accounting Module Design Spec

## Overview
E-commerce accounting module for RuralBot Discord bot. Tracks products, orders, and profit with Discord thread-based logging.

## Database Models

### Category
- `id` (String, cuid, PK)
- `name` (String, unique)
- Relations: `products` (one-to-many)

### Product
- `id` (String, cuid, PK)
- `name` (String, unique)
- `cost` (Float) - cost price
- `price` (Float) - selling price
- `source` (String?) - supplier, free text
- `categoryId` (String, FK -> Category)
- `faceValue` (Float?) - face value for discount-type products
- `costDiscount` (Float?) - cost discount rate (e.g. 0.8)
- `priceDiscount` (Float?) - price discount rate (e.g. 0.9)
- Relations: `category` (many-to-one), `orders` (one-to-many)

### Order
- `id` (String, PK) - 6-char nanoid (uppercase + digits), unique
- `productId` (String?) - null for custom orders
- `productName` (String) - denormalized for data retention
- `quantity` (Int, default 1)
- `actualPrice` (Float) - final selling price
- `actualCost` (Float) - final cost
- `profit` (Float) - calculated profit
- `isCustom` (Boolean, default false)
- `createdAt` (DateTime, default now())
- Relations: `product` (many-to-one, optional)

### AccountingConfig
- `id` (String, cuid, PK)
- `guildId` (String, unique) - Discord guild ID
- `channelId` (String) - Thread logging channel ID
- `createdAt` (DateTime, default now())
- `updatedAt` (DateTime, auto-updated)

## Profit Calculation Engine

- **Normal**: `(actualPrice - actualCost) * quantity`
- **Discount-type** (when product has faceValue + discount rates):
  - `actualCost = faceValue * costDiscount`
  - `actualPrice = faceValue * priceDiscount`
  - `profit = (actualPrice - actualCost) * quantity`

## Slash Commands

| Command | Params | Description |
|---------|--------|-------------|
| `/accounting-setup` | `channel` | Admin sets order logging channel per guild |
| `/category-add` | `name` | Create product category |
| `/product-add` | `name`, `price`, `cost`, `category`, `source?`, `face_value?`, `cost_discount?`, `price_discount?` | Register product |
| `/order-add` | `product`, `quantity?`, `custom_price?`, `date?` | Create order from existing product |
| `/order-custom` | `name`, `price`, `cost`, `quantity?`, `date?` | Fully manual order |
| `/order-delete` | `order_id` | Delete order by 6-char ID |
| `/sales-overview` | (none) | Sales summary with cascading select menu (year -> month -> day) |
| `/order-lookup` | `id_or_date` | Search by order ID or date |

## Thread Logging Flow

1. On order create, fetch guild's `AccountingConfig` to get channel ID
2. In that channel, find thread named `YYYY-MM-DD` (matching order date)
3. If no thread exists, create one
4. Send order detail Embed to the thread

## Interactive Sales Overview UI

1. Initial: show all-time totals (revenue, cost, profit, order count)
2. Single Select Menu, cascading:
   - First shows distinct years from DB
   - After year selected, shows months for that year
   - After month selected, shows days for that month
3. Each selection updates the Embed via `interaction.update()`
4. "Reset" option to go back to all-time view

## Technical Decisions

- **nanoid** with custom alphabet `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ` for 6-char order IDs
- Uniqueness check before insert (retry if collision)
- All Embed content in Traditional Chinese
- English command names
- Logger records all operations via existing pino/Discord webhook system
- Admin-only commands: `accounting-setup`
- Source field: free text input

## File Structure

```
src/
  commands/accounting/
    accounting-setup.cmd.ts
    category-add.cmd.ts
    product-add.cmd.ts
    order-add.cmd.ts
    order-custom.cmd.ts
    order-delete.cmd.ts
    sales-overview.cmd.ts
    order-lookup.cmd.ts
  services/accounting/
    repo_category.ts
    repo_product.ts
    repo_order.ts
    repo_accounting_config.ts
    profit_engine.ts
    order_id.ts
    thread_logger.ts
  types/
    accounting.type.ts
```
