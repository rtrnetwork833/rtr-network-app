# Custom Crypto Interface Components

This directory contains custom-built crypto interface components that replace the default Reown AppKit modals with professional, branded UIs.

## Components

### 1. CustomSendModal.tsx
**Purpose:** A self-contained send workflow with method selection, bank withdrawal and internal transfer placeholders, plus on-chain crypto transfers.
**Features:**
- Select-method screen with bank withdrawal, on-chain, and RTR-user transfer routes
- Fonbnk withdrawal gateway placeholder and internal transfer placeholder
- Dynamic on-chain asset selection from the connected Reown wallet's positive-balance Base assets
- Amount input with a Max action and live selected-token balance validation
- Review step with an estimated Base network fee before transaction execution
- Transaction status handling through the connected wagmi wallet

**Usage:**
```tsx
import CustomSendModal from '@/components/CustomSendModal';

// In your component:
const [showSendModal, setShowSendModal] = useState(false);

<button onClick={() => setShowSendModal(true)}>Send Crypto</button>
{showSendModal && (
  <CustomSendModal
    onClose={() => setShowSendModal(false)}
  />
)}
```

### 2. CustomSwapModal.tsx
**Purpose:** Token swap engine
**Features:**
- Searchable token selection using Reown AppKit's supported asset list and wallet balances
- Spend amount input with balance-aware Max action and token inversion
- Opens the native Reown AppKit Swap view with the selected token pair and amount
- Reown handles quotes, approvals, and wallet transaction execution

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
