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
  Eye,
  EyeOff,
  Gamepad2,
  Globe2,
  Info,
  KeyRound,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { formatUnits, type Address } from "viem";
import { useAccount, useBalance, useConnect, useConnectors, useReadContract } from "wagmi";
import { cycleSecondsForTier, FREE_CYCLE_SECONDS, FREE_TIER } from "@/lib/mining";
import { createClient } from "@/lib/supabase/client";

type View = "dashboard" | "upgrades" | "market" | "trading" | "game" | "wallet";
type Activation = { tier: string; activated_at: string; expires_at: string };
type Profile = { full_name: string | null; avatar_url: string | null };
type WalletBalance = { balance: number | string | null };
type MarketAsset = { symbol: string; name: string; price: number | null; change: number | null; volume?: number | null };
type PortfolioAsset = MarketAsset & { amount: number; value: number };
const supabase = createClient();
const rtrTokenAbi = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

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
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [navigationReady, setNavigationReady] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [modal, setModal] = useState<"upload" | "language" | "tasks" | null>(null);
  const [language, setLanguage] = useState("English");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [balance, setBalance] = useState(0);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [visibilityReady, setVisibilityReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("No file selected");
  const fileInput = useRef<HTMLInputElement>(null);
  const walletProvisionedFor = useRef("");
  const { address } = useAccount();
  const { connectAsync } = useConnect();
  const connectors = useConnectors();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const mountTimer = window.setTimeout(() => {
      const savedView = window.localStorage.getItem("active_tab");
      if (savedView === "dashboard" || savedView === "upgrades" || savedView === "market" || savedView === "trading" || savedView === "game" || savedView === "wallet") {
        setView(savedView);
      }
      setNavigationReady(true);
    }, 0);
    return () => window.clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    if (navigationReady) window.localStorage.setItem("active_tab", view);
  }, [navigationReady, view]);

  useEffect(() => {
    window.setTimeout(() => {
      const storedVisibility = window.localStorage.getItem("rtr-balance-visible");
      if (storedVisibility !== null) setIsBalanceHidden(storedVisibility === "false");
      setVisibilityReady(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (visibilityReady) window.localStorage.setItem("rtr-balance-visible", String(!isBalanceHidden));
  }, [isBalanceHidden, visibilityReady]);

  async function loadActivation() {
    try {
      const response = await fetch("/api/mining/activate");
      if (!response.ok) return;
      const body = await response.json() as { activation: Activation | null };
      setActivation(body.activation);
    } catch {
      setActivation(null);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setProfileLoading(Boolean(data.user));
      setAuthLoading(false);
      if (data.user) void loadActivation();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setProfileLoading(Boolean(session?.user));
      if (!session?.user) setProfileName(null);
      setAuthLoading(false);
      if (session?.user) void loadActivation();
      else {
        setActivation(null);
        setActive(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    async function loadProfile() {
      try {
        const { data, error } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).single<Profile>();
        if (error) throw error;
        if (!cancelled) {
          setProfileName(data?.full_name?.trim() || null);
          setAvatar(data?.avatar_url?.trim() || null);
          setProfileLoading(false);
        }
      } catch {
        if (!cancelled) {
          setProfileName(null);
          setProfileLoading(false);
        }
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const email = user?.email?.trim().toLowerCase();
    const coinbaseConnector = connectors.find((connector) => connector.id === "coinbaseWalletSDK");
    if (!email) {
      walletProvisionedFor.current = "";
      return;
    }
    if (!coinbaseConnector || address || walletProvisionedFor.current === email) return;
    walletProvisionedFor.current = email;
    void (async () => {
      try {
        const provider = await coinbaseConnector.getProvider() as { request: (args: { method: string; params: unknown[] }) => Promise<unknown> };
        await provider.request({ method: "eth_requestAccounts", params: [{ onboarding: "instant", email }] });
      } catch {
      }
      await connectAsync({ connector: coinbaseConnector }).catch(() => undefined);
    })();
  }, [address, connectAsync, connectors, user]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;
    async function loadBalance() {
      try {
        const { data, error } = await supabase.from("wallet_balances").select("balance").eq("user_id", userId).maybeSingle<WalletBalance>();
        if (error) throw error;
        const nextBalance = Number(data?.balance ?? 0);
        if (!cancelled) setBalance(Number.isFinite(nextBalance) ? nextBalance : 0);
      } catch {
        if (!cancelled) setBalance(0);
      }
    }
    void loadBalance();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!activation) return;
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.floor((new Date(activation.expires_at).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      setActive(seconds > 0);
    };
    updateRemaining();
    const timer = window.setInterval(() => {
      updateRemaining();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activation]);

  const cycleSeconds = activation ? cycleSecondsForTier(activation.tier) ?? FREE_CYCLE_SECONDS : FREE_CYCLE_SECONDS;
  const progress = useMemo(() => (remaining / cycleSeconds) * 100, [cycleSeconds, remaining]);

  async function activateTier(tier: string) {
    setError(null);
    let response: Response;
    let body: { activation?: Activation; error?: string; standard?: boolean };
    try {
      response = await fetch("/api/mining/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      body = await response.json() as { activation?: Activation; error?: string; standard?: boolean };
    } catch {
      setActivation(null);
      return false;
    }
    if (body.standard) {
      setActivation(null);
      return false;
    }
    if (!response.ok || !body.activation) {
      setError(body.error ?? "Unable to activate this tier.");
      return false;
    }
    setActivation(body.activation);
    return true;
  }

  function startCollection() {
    if (!active) void activateTier(FREE_TIER);
  }

  async function purchase(tier: (typeof tiers)[number]) {
    if (await activateTier(tier[0])) {
      setModal(null);
      setView("dashboard");
    }
  }

  async function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setAvatar(URL.createObjectURL(file));
    const response = await fetch("/api/profile/avatar", { method: "POST", headers: { "Content-Type": file.type }, body: file });
    const body = await response.json() as { avatarUrl?: string; error?: string };
    if (response.ok && body.avatarUrl) setAvatar(body.avatarUrl);
    else setError(body.error ?? "Unable to save the profile picture.");
  }

  async function signOut() {
    setUser(null);
    setProfileName(null);
    setAvatar(null);
    setActivation(null);
    setActive(false);
    setBalance(0);
    await supabase.auth.signOut();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
    });
    window.dispatchEvent(new Event("rtr-auth-reset"));
  }

  if (authLoading) return <main className="app-shell auth-loading">Checking secure session...</main>;
  if (!user) return <AuthOverlay />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="shield-mark" src="/rtr-shield.svg" alt="RTR Network shield" />
          <div><strong>RTR NETWORK</strong><span>SECURE NODE PLATFORM</span></div>
        </div>
        <div className="header-actions">
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
        }} onSignOut={() => void signOut()} />}
      </header>

      <section className="identity-row">
        <div className="greeting" aria-live="polite">
          {profileLoading || !profileName ? <span className="greeting-skeleton" aria-label="Loading profile name" /> : <h1>Hello, {profileName}</h1>}
        </div>
        <div className="status-pill">{profileName && <strong>{profileName}</strong>}<span /> Node online</div>
      </section>

      <section className="content-scroll">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {view === "dashboard" && <Dashboard balance={balance} isBalanceHidden={isBalanceHidden} onToggleBalance={() => setIsBalanceHidden((hidden) => !hidden)} active={active} tier={activation?.tier} progress={progress} remaining={remaining} onStart={startCollection} />}
        {view === "upgrades" && <Upgrades onPurchase={purchase} />}
        {view === "market" && <MarketView />}
        {view === "trading" && <PlaceholderView icon={<Activity />} title="Trading desk" text="Execution routing is secured through the RTR relay." />}
        {view === "game" && <PlaceholderView icon={<Gamepad2 />} title="Node quests" text="Complete community missions to unlock bonus points." />}
        {view === "wallet" && <WalletView />}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavItem icon={<LayoutDashboard />} label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavItem icon={<Crown />} label="Upgrades" active={view === "upgrades"} onClick={() => setView("upgrades")} />
        <NavItem icon={<TrendingUp />} label="Market" active={view === "market"} onClick={() => setView("market")} />
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
          {["Join Official Telegram", "Follow on Warpcast", "Share the RTR Network update"].map((task) => <div className="task-row" key={task}><span>{task}</span><span className="task-status">Verification pending</span></div>)}
      </Modal>}
    </main>
  );
}

function Dashboard({ balance, isBalanceHidden, onToggleBalance, active, tier, progress, remaining, onStart }: { balance: number; isBalanceHidden: boolean; onToggleBalance: () => void; active: boolean; tier?: string; progress: number; remaining: number; onStart: () => void }) {
  const displayBalance = isBalanceHidden ? "••••••" : `$${balance.toFixed(4)}`;
  return <div className="dashboard-view">
    <div className="balance-card"><div><div className="balance-label"><span className="eyebrow">TOTAL ACCRUED</span><button className="balance-toggle" type="button" onClick={onToggleBalance} aria-label={isBalanceHidden ? "Show balance" : "Hide balance"}>{isBalanceHidden ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><strong>{displayBalance} <small>RTR</small></strong><span className="delta"><ArrowUpRight size={14} /> {isBalanceHidden ? "•••••• / day" : "+0.16 RTR / day"}</span></div><div className="balance-icon"><Zap size={21} /></div></div>
    <div className="section-heading"><div><span className="eyebrow">ACTIVE NODE</span><h2>{tier ?? "Collection protocol"}</h2></div><span className="live-dot">{active ? "LIVE" : "PAUSED"}</span></div>
    <div className="ring-wrap"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div className="ring-inner"><Sparkles size={17} /><strong>{formatTime(remaining)}</strong><span>{active ? "Accumulating" : "Ready to collect"}</span></div></div></div>
    <button className="collect-button" onClick={onStart}><span className="pulse" />{active ? "Collection active" : "Start 24-hour free node"}<ChevronRight size={18} /></button>
    <div className="metric-grid"><div><span>Network</span><strong>Base Mainnet</strong></div><div><span>Protocol</span><strong>v2.4.8</strong></div><div><span>Multiplier</span><strong>1.0x</strong><small>Standard Hashrate Protocol</small></div></div>
  </div>;
}

function Upgrades({ onPurchase }: { onPurchase: (tier: (typeof tiers)[number]) => void }) {
  return <div className="upgrades-view"><div className="page-intro"><span className="eyebrow">PROTOCOL STORE</span><h2>Choose your node tier</h2><p>Every paid tier runs for a fixed 30-day cycle and streams allocation directly from the deployment treasury.</p></div><div className="tier-list">{tiers.map((tier, index) => <article className={index === 3 ? "tier-card featured" : "tier-card"} key={tier[0]}><div className="tier-top"><span className="tier-number">0{index + 1}</span>{index === 3 && <span className="featured-label">POPULAR</span>}</div><h3>{tier[0]}</h3><div className="tier-price">{tier[1] === "Free" ? "Free" : `$${tier[1]}`}<small>{tier[1] === "Free" ? "" : " USDC"}</small></div><div className="tier-speed"><Zap size={15} /> {tier[2]} RTR <span>/ day</span></div><div className="tier-details"><span><Globe2 size={14} /> {tier[3]}</span><span><LockKeyhole size={14} /> {tier[4]}</span></div><button className="tier-button" onClick={() => onPurchase(tier)}>{tier[1] === "Free" ? "Activate free node" : "Purchase with USDC"}<ArrowUpRight size={16} /></button></article>)}</div></div>;
}

function ProfileMenu({ onSelect, onSignOut }: { onSelect: (item: string) => void; onSignOut: () => void }) {
  return <div className="profile-menu"><div className="menu-profile"><div className="mini-avatar"><UserRound size={17} /></div><div><strong>RTR member</strong><span>Authenticated session</span></div></div><button className="menu-option" onClick={() => onSelect("Upload Profile Picture")}><Upload size={16} /> Upload Profile Picture</button>{menuItems.map(([label, Icon]) => <button className="menu-option" key={label} onClick={() => onSelect(label)}><Icon size={16} /> {label}<ChevronRight className="menu-chevron" size={14} /></button>)}<button className="menu-option logout" onClick={onSignOut}><LogOut size={16} /> Sign out</button></div>;
}

function AuthOverlay() {
  const [profilePreview, setProfilePreview] = useState<Profile | null>(null);
  const [mode, setMode] = useState<"login" | "signup" | "recovery">("login");
  const [email, setEmail] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem("rtr-email") ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [signupVerification, setSignupVerification] = useState(false);
  const [enteredToken, setEnteredToken] = useState("");
  const [showDobInfo, setShowDobInfo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const pinInput = useRef<HTMLInputElement>(null);
  const pinIsValid = /^\d{6}$/.test(password);
  const pinsMatch = pinIsValid && password === confirmPin;

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setPassword(""), 0);
    return () => {
      window.clearTimeout(mountTimer);
      setPassword("");
    };
  }, []);

  useEffect(() => {
    const resetAuthForm = () => {
      setEmail("");
      setPassword("");
      setFullName("");
      setDateOfBirth("");
      setConfirmPin("");
      setEnteredToken("");
      setMessage(null);
      setProfilePreview(null);
      setBusy(false);
    };
    window.addEventListener("rtr-auth-reset", resetAuthForm);
    return () => window.removeEventListener("rtr-auth-reset", resetAuthForm);
  }, []);

  useEffect(() => {
    if (mode !== "login" || !email.includes("@")) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/auth/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        const body = await response.json() as { profile: Profile | null };
        if (!cancelled) setProfilePreview(body.profile);
      } catch {
        if (!cancelled) setProfilePreview(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, mode]);

  async function verifySignupCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await supabase.auth.verifyOtp({ email, token: enteredToken, type: "signup" });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "login" && password.length < 6) return;
    setBusy(true);
    setMessage(null);
    if (mode === "recovery") {
      const response = await fetch("/api/auth/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, dateOfBirth }) });
      const body = await response.json() as { error?: string; message?: string };
      setBusy(false);
      setMessage(response.ok ? body.message ?? "Recovery instructions sent." : body.error ?? "Invalid credentials provided.");
      return;
    }
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, date_of_birth: dateOfBirth } } });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "login") setPassword("");
    else if (mode === "signup") setSignupVerification(true);
  }

  async function submitLogin(pin: string) {
    if (busy || !email || pin.length !== 6) return;
    setBusy(true);
    setMessage(null);
    const result = await supabase.auth.signInWithPassword({ email, password: pin });
    setBusy(false);
    if (result.error) {
      setPassword("");
      setMessage("Incorrect PIN. Try again.");
      window.requestAnimationFrame(() => pinInput.current?.focus());
    } else {
      setPassword("");
    }
  }

  const isSignup = mode === "signup";
  const isRecovery = mode === "recovery";
  const canSubmit = !busy && (mode === "login" ? Boolean(email && password.length === 6) : (isSignup ? Boolean(fullName && email && dateOfBirth && pinsMatch) : Boolean(email && dateOfBirth)));

  if (signupVerification) return <main className="app-shell auth-shell"><div className="auth-panel otp-panel"><img className="shield-mark" src="/rtr-shield.svg" alt="RTR Network shield" /><span className="eyebrow">REGISTRATION ACTIVATION</span><h1>Verify Your Account</h1><p>We sent a 6-digit secure security verification token to your email inbox. Please type it in below to authorize your registration activation script.</p><form onSubmit={verifySignupCode}><label className="otp-label">Security token<input className="otp-input" type="text" inputMode="numeric" maxLength={6} pattern="[0-9]*" value={enteredToken} onChange={(event) => setEnteredToken(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoComplete="one-time-code" /></label>{message && <div className="auth-message" role="alert">{message}</div>}<button className="primary-button auth-submit" disabled={busy || enteredToken.length !== 6}>{busy ? <><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>Authenticating token...</> : "Verify Code"}</button></form></div></main>;

  if (mode === "login") return <main className="app-shell auth-shell"><div className="auth-panel login-panel"><div className="auth-identity"><div className="auth-avatar">{profilePreview?.avatar_url ? <img src={profilePreview.avatar_url} alt="Profile" /> : <UserRound size={34} strokeWidth={1.5} />}</div><strong>{profilePreview?.full_name?.trim() || "RTR Network member"}</strong><span>Secure node access</span></div><span className="eyebrow">SECURE NODE PLATFORM</span><h1>Welcome back</h1><p>Enter your 6-digit PIN to access your persistent node dashboard.</p><form autoComplete="off" onSubmit={(event) => { event.preventDefault(); void submitLogin(password); }}>
    <label>Email address<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); window.localStorage.setItem("rtr-email", event.target.value); setProfilePreview(null); }} required autoComplete="email" /></label>
    <label>6-digit PIN<div className="pin-input-wrap"><input ref={pinInput} className="pin-input" type={showPin ? "text" : "password"} value={password} onChange={(event) => { const pin = event.target.value.replace(/\D/g, "").slice(0, 6); setPassword(pin); if (pin.length === 6) void submitLogin(pin); }} inputMode="numeric" maxLength={6} pattern="[0-9]*" autoComplete="new-password" required /><button type="button" className="pin-visibility" aria-label={showPin ? "Hide PIN" : "Show PIN"} onClick={() => setShowPin(!showPin)}>{showPin ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
    {message && <div className="auth-message" role="alert">{message}</div>}
    {busy && <div className="login-status" aria-live="polite">Verifying secure PIN...</div>}
  </form>
    <button className="auth-switch" onClick={() => { setMode("recovery"); setProfilePreview(null); setMessage(null); }}>Forgot password?</button>
    <button className="auth-switch" onClick={() => { setMode("signup"); setProfilePreview(null); setMessage(null); }}>Need an account? Sign up</button>
  </div></main>;

  return <main className="app-shell auth-shell"><div className="auth-panel"><img className="shield-mark" src="/rtr-shield.svg" alt="RTR Network shield" /><span className="eyebrow">SECURE NODE PLATFORM</span><h1>{isRecovery ? "Recover your account" : "Create your account"}</h1><p>{isRecovery ? "Verify your registered details to receive a secure password reset code." : "Create a secure account for your persistent node dashboard."}</p><form autoComplete="off" onSubmit={submit}>
    {isSignup && <label>Full name<input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" /></label>}
    <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
    {(isSignup || isRecovery) && <label className="date-field">Date of birth<div className="date-input-wrap"><input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required /><button type="button" className="info-button" aria-label="Why we need your date of birth" aria-expanded={showDobInfo} onClick={() => setShowDobInfo(!showDobInfo)}><Info size={15} /></button>{showDobInfo && <div className="dob-tooltip" role="tooltip"><strong>🔒 Why we need your Date of Birth:</strong><span>- Account Recovery: If you ever lose access to your password, you must verify your exact date of birth to reset it.</span><span>- Anti-Hack Protection: This stops hackers from trying to steal your funds via fake password reset requests.</span><span>- Security Lock: For your safety, this information cannot be changed after registration. Please ensure it matches your official records.</span></div>}</div></label>}
    {isSignup && <><label>Create 6-digit PIN<input type="password" value={password} onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} pattern="[0-9]*" autoComplete="new-password" /></label><label>Confirm 6-digit PIN<input type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} pattern="[0-9]*" autoComplete="new-password" /></label>{confirmPin && !pinsMatch && <div className="pin-error" role="alert">PINs must match and contain exactly 6 digits.</div>}</>}
    {message && <div className="auth-message" role="alert">{message}</div>}<button className="primary-button auth-submit" disabled={!canSubmit}>{busy ? "Securing account..." : isRecovery ? "Send recovery code" : "Register"}</button></form>
    <button className="auth-switch" onClick={() => { setMode(isRecovery || mode === "signup" ? "login" : "signup"); setMessage(null); setShowDobInfo(false); }}>{isRecovery || mode === "signup" ? "Back to log in" : "Need an account? Sign up"}</button>
  </div></main>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</div></div>;
}

function WalletView() {
  const { address } = useAccount();
  const { data: nativeBalance } = useBalance({ address });
  const tokenAddress = process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS as Address | undefined;
  const { data: rtrBalance } = useReadContract({
    address: tokenAddress,
    abi: rtrTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && tokenAddress) },
  });
  const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
  const { data: usdcBalance } = useReadContract({
    address: usdcAddress,
    abi: rtrTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const [prices, setPrices] = useState<MarketAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=rtr-network,ethereum,usd-coin,coinbase-wrapped-staked-eth&vs_currencies=usd&include_24hr_change=true")
      .then((response) => response.ok ? response.json() as Promise<Record<string, { usd?: number; usd_24h_change?: number }>> : Promise.reject(new Error("market unavailable")))
      .then((prices) => {
        if (cancelled) return;
        const assets = [
          ["RTR", "RTR Network", "rtr-network"],
          ["ETH", "Ethereum", "ethereum"],
          ["USDC", "Bridged USDC", "usd-coin"],
          ["cbETH", "Coinbase Wrapped Staked ETH", "coinbase-wrapped-staked-eth"],
        ] as const;
        setPrices(assets.map(([symbol, name, id]) => ({ symbol, name, price: prices[id]?.usd ?? null, change: prices[id]?.usd_24h_change ?? null })));
      })
      .catch(() => setPrices([]));
    return () => { cancelled = true; };
  }, []);

  const shortenedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null;
  const rtrAmount = typeof rtrBalance === "bigint" ? Number(formatUnits(rtrBalance, 18)) : 0;
  const ethAmount = nativeBalance ? Number(formatUnits(nativeBalance.value, nativeBalance.decimals)) : 0;
  const usdcAmount = typeof usdcBalance === "bigint" ? Number(formatUnits(usdcBalance, 6)) : 0;
  const priceFor = (symbol: string, fallback: number | null = null) => prices.find((asset) => asset.symbol === symbol)?.price ?? fallback;
  const portfolio: PortfolioAsset[] = [
    { symbol: "RTR", name: "RTR Network", price: priceFor("RTR"), change: null, amount: rtrAmount, value: rtrAmount * (priceFor("RTR") ?? 0) },
    { symbol: "ETH", name: "Ethereum", price: priceFor("ETH"), change: null, amount: ethAmount, value: ethAmount * (priceFor("ETH") ?? 0) },
    { symbol: "USDC", name: "Bridged USDC", price: priceFor("USDC", 1), change: null, amount: usdcAmount, value: usdcAmount * (priceFor("USDC", 1) ?? 0) },
  ];
  const sortedPortfolio = portfolio.filter((asset) => asset.symbol === "RTR" || asset.amount > 0).sort((left, right) => left.symbol === "RTR" ? -1 : right.symbol === "RTR" ? 1 : right.value - left.value);

  return <div className="wallet-view">
    <div className="page-intro"><span className="eyebrow">BASE NETWORK</span><h2>Embedded wallet</h2><p>Read-only balances for your connected Base account.</p></div>
    <div className="wallet-card">
      <div className="wallet-card-top"><div><span className="eyebrow">LIVE ADDRESS</span>{shortenedAddress ? <strong className="wallet-address">{shortenedAddress}</strong> : <span className="greeting-skeleton" aria-label="Loading wallet address" />}</div></div>
      {address && <div className="wallet-actions"><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(address)}>Copy address</button><a className="secondary-button" href={`https://basescan.org/address/${address}`} target="_blank" rel="noreferrer">View on BaseScan <ArrowUpRight size={14} /></a></div>}
      <div className="portfolio-list" aria-label="Wallet portfolio">{sortedPortfolio.map((asset) => <div className="portfolio-row" key={asset.symbol}><div className="asset-identity"><span className={`asset-logo asset-${asset.symbol.toLowerCase()}`}>{asset.symbol.slice(0, 1)}</span><div><strong>{asset.symbol}</strong><small>{asset.name}</small></div></div><div className="asset-value"><strong>{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {asset.symbol}</strong><small>{asset.price === null ? "Price unavailable" : `$${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</small></div></div>)}</div>
    </div>
  </div>;
}

function MarketView() {
  const [market, setMarket] = useState<MarketAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    type CoinGeckoAsset = { id?: string; symbol?: string; name?: string; current_price?: number; price_change_percentage_24h?: number; total_volume?: number };
    type CoinGeckoPrice = { usd?: number; usd_24h_change?: number };
    const baseAssets = fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=base-ecosystem&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h")
      .then((response) => response.ok ? response.json() as Promise<CoinGeckoAsset[]> : Promise.reject(new Error("market unavailable")));
    const rtrPrice = fetch("https://api.coingecko.com/api/v3/simple/price?ids=rtr-network&vs_currencies=usd&include_24hr_change=true")
      .then((response) => response.ok ? response.json() as Promise<Record<string, CoinGeckoPrice>> : Promise.reject(new Error("RTR market unavailable")))
      .catch(() => ({} as Record<string, CoinGeckoPrice>));
    Promise.all([baseAssets, rtrPrice]).then(([assets, rtrPrices]) => {
        if (cancelled) return;
        const fetched = assets.map((asset) => ({
          symbol: asset.symbol?.trim().toUpperCase() || "--",
          name: asset.name?.trim() || "Unknown token",
          price: typeof asset.current_price === "number" ? asset.current_price : null,
          change: typeof asset.price_change_percentage_24h === "number" ? asset.price_change_percentage_24h : null,
          volume: typeof asset.total_volume === "number" ? asset.total_volume : 0,
        })).filter((asset) => asset.symbol !== "--" && asset.symbol !== "RTR");
        const rtrAsset = assets.find((asset) => asset.id === "rtr-network" || asset.symbol?.toUpperCase() === "RTR");
        const rtrSimplePrice = rtrPrices["rtr-network"];
        setMarket([{ symbol: "RTR", name: rtrAsset?.name || "RTR Network", price: rtrAsset?.current_price ?? rtrSimplePrice?.usd ?? null, change: rtrAsset?.price_change_percentage_24h ?? rtrSimplePrice?.usd_24h_change ?? null, volume: rtrAsset?.total_volume ?? null }, ...fetched.slice(0, 49)]);
      })
      .catch(() => setMarket([{ symbol: "RTR", name: "RTR Network", price: null, change: null, volume: null }]));
    return () => { cancelled = true; };
  }, []);

  return <div className="market-view"><div className="page-intro"><span className="eyebrow">BASE ECOSYSTEM</span><h2>Market monitor</h2><p>Live spot prices and 24-hour movement across the RTR ecosystem.</p></div><div className="market-table" aria-label="Base ecosystem market monitor"><div className="market-row market-header"><span>Asset</span><span>Spot price</span><span>24h</span></div>{market.map((asset) => <div className="market-row" key={asset.symbol}><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span><span>{asset.price === null ? "--" : `$${asset.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}</span><span className={asset.change !== null && asset.change >= 0 ? "market-up" : "market-down"}>{asset.change === null ? "--" : `${asset.change >= 0 ? "+" : ""}${asset.change.toFixed(2)}%`}</span></div>)}</div></div>;
}

function PlaceholderView({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="placeholder-view"><div className="placeholder-icon">{icon}</div><span className="eyebrow">COMING ONLINE</span><h2>{title}</h2><p>{text}</p><button className="primary-button">View protocol status <ArrowUpRight size={16} /></button></div>; }

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>; }
