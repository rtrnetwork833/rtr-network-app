# Custom Crypto Interface Components

This directory contains custom-built crypto interface components that replace the default Reown AppKit modals with professional, branded UIs.

## Components

### 1. CustomSendModal.tsx
**Purpose:** On-chain crypto transfers
**Features:**
- Destination wallet address input with validation
- Token selection dropdown (ETH, RTR)
- Amount input with "MAX" button linked to live balance
- Estimated gas fee calculator
- Transaction execution via wagmi hooks
- Status handling (Idle, Loading, Success, Failed)

**Usage:**
```tsx
import CustomSendModal from '@/components/CustomSendModal';

// In your component:
const [showSendModal, setShowSendModal] = useState(false);

<button onClick={() => setShowSendModal(true)}>Send Crypto</button>
{showSendModal && <CustomSendModal onClose={() => setShowSendModal(false)} />}
```

### 2. CustomSwapModal.tsx
**Purpose:** Token swap engine
**Features:**
- "From" and "To" token selection (ETH, RTR, USDC, USDT)
- Live exchange rate indicator
- Price slippage settings (0.5%, 1%, 3%)
- Ready for DEX aggregator integration (0x, 1inch, Uniswap)
- Professional loading and success states

**Usage:**
```tsx
import CustomSwapModal from '@/components/CustomSwapModal';

const [showSwapModal, setShowSwapModal] = useState(false);

<button onClick={() => setShowSwapModal(true)}>Convert</button>
{showSwapModal && <CustomSwapModal onClose={() => setShowSwapModal(false)} />}
```

### 3. CustomDepositModal.tsx
**Purpose:** Receive funds & fiat on-ramp
**Features:**
- Wallet address display with one-click copy
- Dynamically generated QR code for wallet-to-wallet transfers
- Fiat on-ramp integration (Transak, MoonPay)
- Network info display (Base Mainnet)
- Clean, professional UI

**Usage:**
```tsx
import CustomDepositModal from '@/components/CustomDepositModal';

const [showDepositModal, setShowDepositModal] = useState(false);

<button onClick={() => setShowDepositModal(true)}>Deposit</button>
{showDepositModal && <CustomDepositModal onClose={() => setShowDepositModal(false)} />}
```

### 4. CustomActivityLedger.tsx
**Purpose:** Transaction history & activity ledger
**Features:**
- Automated transaction fetching via BaseScan API
- Professional history list showing:
  - Transaction Type (Received, Sent, Swapped)
  - Token Amount
  - Timestamp
  - Status (Completed, Pending, Failed)
  - Clickable TxHash linking to block explorer
- Searchable by address or hash
- Filterable by transaction type
- Responsive design

**Usage:**
```tsx
import CustomActivityLedger from '@/components/CustomActivityLedger';

const [showActivityLedger, setShowActivityLedger] = useState(false);

<button onClick={() => setShowActivityLedger(true)}>Transaction History</button>
{showActivityLedger && <CustomActivityLedger onClose={() => setShowActivityLedger(false)} />}
```

## Integration with PortfolioView

To integrate these components into your existing PortfolioView in `src/app/page.tsx`:

1. Import the components:
```tsx
import CustomSendModal from '@/components/CustomSendModal';
import CustomSwapModal from '@/components/CustomSwapModal';
import CustomDepositModal from '@/components/CustomDepositModal';
import CustomActivityLedger from '@/components/CustomActivityLedger';
```

2. Add state for each modal:
```tsx
const [showSendModal, setShowSendModal] = useState(false);
const [showSwapModal, setShowSwapModal] = useState(false);
const [showDepositModal, setShowDepositModal] = useState(false);
const [showActivityLedger, setShowActivityLedger] = useState(false);
```

3. Update button click handlers:
```tsx
// Deposit button
<button onClick={() => setShowDepositModal(true)}>Deposit</button>

// Convert button
<button onClick={() => setShowSwapModal(true)}>Convert</button>

// Send Crypto button
<button onClick={() => setShowSendModal(true)}>Send Crypto</button>

// Transaction History link
<button onClick={() => setShowActivityLedger(true)}>Transaction History ›</button>
```

4. Render modals at the bottom of PortfolioView:
```tsx
{showDepositModal && <CustomDepositModal onClose={() => setShowDepositModal(false)} />}
{showSwapModal && <CustomSwapModal onClose={() => setShowSwapModal(false)} />}
{showSendModal && <CustomSendModal onClose={() => setShowSendModal(false)} />}
{showActivityLedger && <CustomActivityLedger onClose={() => setShowActivityLedger(false)} />}
```

## Theme Styling

All components use the deep navy/dark blue theme matching your platform:
- Background colors: `#11192e`, `#1a2b4c`
- Border colors: `border-blue-900/30`, `border-blue-500/50`
- Active colors: Blue, Purple gradients
- Typography: Clean slate colors with bold highlights
- Status colors: Emerald (success), Yellow (pending), Red (error)

## Notes

- These components are fully encapsulated and do not modify global state
- They preserve the existing layout structure of the core ledger page
- All blockchain transaction states are handled with clean loading spinners and status indicators
- Ready for production use with proper DEX API integration in CustomSwapModal
