"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Crown,
  Gamepad2,
  Globe2,
  KeyRound,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { useAccount, useDisconnect } from "wagmi";

type View = "dashboard" | "upgrades" | "trading" | "game" | "wallet";

const tiers = [
  ["Free Node Booster", "Free", "0.16", "Base Level", "Manual 24-hour verification"],
  ["Starter Utility Boost", "4.99", "0.66", "Level 2 Priority", "30 day subscription"],
  ["Silver Protocol License", "9.99", "1.66", "Enhanced Tier", "30 day subscription"],
  ["Gold Protocol License", "19.99", "3.33", "Advanced Tier", "30 day subscription"],
  ["Premium Platform Booster", "34.99", "6.66", "High-Performance Tier", "30 day subscription"],
  ["Advanced Network Tier", "79.99", "16.66", "Enterprise Level", "30 day subscription"],
  ["Master Infrastructure Pass", "119.99", "25.00", "Ultimate Tier", "30 day subscription"],
  ["Regional Allocation Access", "199.99", "50.00", "Elite Tier", "30 day subscription"],
  ["Continental System License", "399.99", "116.66", "Core Protocol Level", "30 day subscription"],
  ["Global System Core", "499.99", "166.66", "Sovereign Protocol Level", "30 day subscription"],
  ["Sovereign Genesis License", "899.99", "333.33", "Genesis Core Level", "30 day subscription"],
];

const menuItems = [
  ["Two-Factor Authentication", ShieldCheck],
  ["Enable Fingerprint / Face ID Login", LockKeyhole],
  ["Change Your Password", KeyRound],
  ["Tasks", Check],
  ["Change Your Language", Languages],
  ["Read Whitepaper", ArrowUpRight],
  ["Read Roadmap", ArrowUpRight],
  ["Privacy Policy", ShieldCheck],
  ["About Us", CircleHelp],
  ["Contact Us", MessageCircle],
] as const;

function formatTime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useWeb3Modal();
  const [view, setView] = useState<View>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [modal, setModal] = useState<"upload" | "language" | "tasks" | null>(null);
  const [language, setLanguage] = useState("English");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [remaining, setRemaining] = useState(30 * 86400);
  const [balance, setBalance] = useState(128.42);
  const [fileName, setFileName] = useState("No file selected");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!active || remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
      setBalance((current) => current + 0.16 / 86400);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, remaining]);

  const progress = useMemo(() => (remaining / (30 * 86400)) * 100, [remaining]);

  function startCollection() {
    setActive(true);
  }

  function purchase(tier: (typeof tiers)[number]) {
    setActive(true);
    setRemaining(30 * 86400);
    setModal(null);
    setView("dashboard");
    void fetch("/api/mining/activate", { method: "POST", body: JSON.stringify({ tier: tier[0] }) });
  }

  function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setAvatar(URL.createObjectURL(file));
    void fetch("/api/profile/avatar", { method: "POST", body: file });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="shield-mark"><ShieldCheck size={19} /></div>
          <div><strong>RTR NETWORK</strong><span>SECURE NODE PLATFORM</span></div>
        </div>
        <div className="header-actions">
          <button className="wallet-button" onClick={() => isConnected ? disconnect() : open()}>
            <Wallet size={15} /> {isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect wallet"}
          </button>
          <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
          <button className="avatar-button" aria-label="Open profile menu" onClick={() => setProfileOpen(!profileOpen)}>
            {avatar ? <img src={avatar} alt="Profile" /> : <UserRound size={20} />}
          </button>
        </div>
        {profileOpen && <ProfileMenu onSelect={(item) => {
          setProfileOpen(false);
          if (item === "Tasks") setModal("tasks");
          if (item === "Change Your Language") setModal("language");
          if (item === "Upload Profile Picture") setModal("upload");
        }} />}
      </header>

      <section className="identity-row">
        <div><span className="eyebrow">WELCOME BACK</span><h1>Alex Morgan</h1></div>
        <div className="status-pill"><span /> Node online</div>
      </section>

      <section className="content-scroll">
        {view === "dashboard" && <Dashboard balance={balance} active={active} progress={progress} remaining={remaining} onStart={startCollection} />}
        {view === "upgrades" && <Upgrades onPurchase={purchase} />}
        {view === "trading" && <PlaceholderView icon={<Activity />} title="Trading desk" text="Execution routing is secured through the RTR relay." />}
        {view === "game" && <PlaceholderView icon={<Gamepad2 />} title="Node quests" text="Complete community missions to unlock bonus points." />}
        {view === "wallet" && <PlaceholderView icon={<Wallet />} title="Treasury wallet" text="Your Base network wallet is protected by server-side relay controls." />}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavItem icon={<LayoutDashboard />} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavItem icon={<Crown />} label="Upgrades" active={view === "upgrades"} onClick={() => setView("upgrades")} />
        <NavItem icon={<Activity />} label="Trading" active={view === "trading"} onClick={() => setView("trading")} />
        <NavItem icon={<Gamepad2 />} label="Game" active={view === "game"} onClick={() => setView("game")} />
        <NavItem icon={<Wallet />} label="Wallet" active={view === "wallet"} onClick={() => setView("wallet")} />
      </nav>

      {modal === "upload" && <Modal title="Profile picture" onClose={() => setModal(null)}>
        <div className="upload-preview">{avatar ? <img src={avatar} alt="Preview" /> : <UserRound size={36} />}</div>
        <p className="modal-copy">Use a clear image so your network identity is easy to recognize.</p>
        <input ref={fileInput} hidden type="file" accept="image/*" onChange={selectAvatar} />
        <button className="primary-button" onClick={() => fileInput.current?.click()}><Upload size={17} /> Choose photo</button>
        <small className="file-name">{fileName}</small>
      </Modal>}
      {modal === "language" && <Modal title="Language" onClose={() => setModal(null)}>
        <p className="modal-copy">Your language preference is shared across the app.</p>
        <div className="language-grid">{[["English", "en"], ["Spanish", "es"], ["French", "fr"], ["Chinese", "zh-CN"], ["Arabic", "ar"], ["Hindi", "hi"], ["Portuguese", "pt"], ["German", "de"]].map(([item, code]) => <button key={item} className={language === item ? "language-option selected" : "language-option"} onClick={() => { setLanguage(item); const selector = document.querySelector<HTMLSelectElement>(".goog-te-combo"); if (selector) { selector.value = code; selector.dispatchEvent(new Event("change")); } setModal(null); }}>{item}{language === item && <Check size={15} />}</button>)}</div>
      </Modal>}
      {modal === "tasks" && <Modal title="Community tasks" onClose={() => setModal(null)}>
        {["Join Official Telegram", "Follow on Warpcast", "Share the RTR Network update"].map((task) => <div className="task-row" key={task}><span>{task}</span><button className="small-button" onClick={() => setBalance((current) => current + 0.25)}>Watch Ad to Verify</button></div>)}
      </Modal>}
    </main>
  );
}

function Dashboard({ balance, active, progress, remaining, onStart }: { balance: number; active: boolean; progress: number; remaining: number; onStart: () => void }) {
  return <div className="dashboard-view">
    <div className="balance-card"><div><span className="eyebrow">TOTAL ACCRUED</span><strong>${balance.toFixed(4)} <small>RTR</small></strong><span className="delta"><ArrowUpRight size={14} /> +0.16 RTR / day</span></div><div className="balance-icon"><Zap size={21} /></div></div>
    <div className="section-heading"><div><span className="eyebrow">ACTIVE NODE</span><h2>Collection protocol</h2></div><span className="live-dot">{active ? "LIVE" : "PAUSED"}</span></div>
    <div className="ring-wrap"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div className="ring-inner"><Sparkles size={17} /><strong>{formatTime(remaining)}</strong><span>{active ? "Accumulating" : "Ready to collect"}</span></div></div></div>
    <button className="collect-button" onClick={onStart}><span className="pulse" />{active ? "Collection active" : "Start Active Collection"}<ChevronRight size={18} /></button>
    <div className="metric-grid"><div><span>Network</span><strong>Base Mainnet</strong></div><div><span>Protocol</span><strong>v2.4.8</strong></div><div><span>Multiplier</span><strong>1.0x</strong></div></div>
  </div>;
}

function Upgrades({ onPurchase }: { onPurchase: (tier: (typeof tiers)[number]) => void }) {
  return <div className="upgrades-view"><div className="page-intro"><span className="eyebrow">PROTOCOL STORE</span><h2>Choose your node tier</h2><p>Every paid tier runs for a fixed 30-day cycle and streams allocation directly from the deployment treasury.</p></div><div className="tier-list">{tiers.map((tier, index) => <article className={index === 3 ? "tier-card featured" : "tier-card"} key={tier[0]}><div className="tier-top"><span className="tier-number">0{index + 1}</span>{index === 3 && <span className="featured-label">POPULAR</span>}</div><h3>{tier[0]}</h3><div className="tier-price">{tier[1] === "Free" ? "Free" : `$${tier[1]}`}<small>{tier[1] === "Free" ? "" : " USDC"}</small></div><div className="tier-speed"><Zap size={15} /> {tier[2]} RTR <span>/ day</span></div><div className="tier-details"><span><Globe2 size={14} /> {tier[3]}</span><span><LockKeyhole size={14} /> {tier[4]}</span></div><button className="tier-button" onClick={() => onPurchase(tier)}>{tier[1] === "Free" ? "Activate free node" : "Purchase with USDC"}<ArrowUpRight size={16} /></button></article>)}</div></div>;
}

function ProfileMenu({ onSelect }: { onSelect: (item: string) => void }) {
  return <div className="profile-menu"><div className="menu-profile"><div className="mini-avatar"><UserRound size={17} /></div><div><strong>Alex Morgan</strong><span>alex@rtr.network</span></div></div><button className="menu-option" onClick={() => onSelect("Upload Profile Picture")}><Upload size={16} /> Upload Profile Picture</button>{menuItems.map(([label, Icon]) => <button className="menu-option" key={label} onClick={() => onSelect(label)}><Icon size={16} /> {label}<ChevronRight className="menu-chevron" size={14} /></button>)}<button className="menu-option logout"><LogOut size={16} /> Sign out</button></div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</div></div>;
}

function PlaceholderView({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="placeholder-view"><div className="placeholder-icon">{icon}</div><span className="eyebrow">COMING ONLINE</span><h2>{title}</h2><p>{text}</p><button className="primary-button">View protocol status <ArrowUpRight size={16} /></button></div>; }

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>; }
