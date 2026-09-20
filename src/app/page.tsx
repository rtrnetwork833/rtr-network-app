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
  Upload,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { cycleSecondsForTier, FREE_CYCLE_SECONDS, FREE_TIER } from "@/lib/mining";
import { createClient } from "@/lib/supabase/client";

type View = "dashboard" | "upgrades" | "trading" | "game" | "wallet";
type Activation = { tier: string; activated_at: string; expires_at: string };
type Profile = { full_name: string | null };
const supabase = createClient();

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
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [modal, setModal] = useState<"upload" | "language" | "tasks" | null>(null);
  const [language, setLanguage] = useState("English");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [balance, setBalance] = useState(128.42);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [visibilityReady, setVisibilityReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("No file selected");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    window.setTimeout(() => {
      const storedVisibility = window.localStorage.getItem("rtr-balance-visible");
      if (storedVisibility !== null) setBalanceVisible(storedVisibility === "true");
      setVisibilityReady(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (visibilityReady) window.localStorage.setItem("rtr-balance-visible", String(balanceVisible));
  }, [balanceVisible, visibilityReady]);

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
      setAuthLoading(false);
      if (data.user) void loadActivation();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
    let cancelled = false;
    void supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle<Profile>().then(({ data }) => {
      if (!cancelled) setProfileName(data?.full_name?.trim() || null);
    }).catch(() => {
      if (!cancelled) setProfileName(null);
    });
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
      if (new Date(activation.expires_at).getTime() > Date.now()) setBalance((current) => current + 0.16 / 86400);
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

  function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setAvatar(URL.createObjectURL(file));
    void fetch("/api/profile/avatar", { method: "POST", body: file });
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
        }} />}
      </header>

      <section className="identity-row">
        <div><h1>Hello, {profileName ?? "Miner ⚡"}{profileName && " 👋"}</h1></div>
        <div className="status-pill"><span /> Node online</div>
      </section>

      <section className="content-scroll">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {view === "dashboard" && <Dashboard balance={balance} balanceVisible={balanceVisible} onToggleBalance={() => setBalanceVisible((visible) => !visible)} active={active} tier={activation?.tier} progress={progress} remaining={remaining} onStart={startCollection} />}
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

function Dashboard({ balance, balanceVisible, onToggleBalance, active, tier, progress, remaining, onStart }: { balance: number; balanceVisible: boolean; onToggleBalance: () => void; active: boolean; tier?: string; progress: number; remaining: number; onStart: () => void }) {
  const displayBalance = balanceVisible ? `$${balance.toFixed(4)}` : "••••••";
  return <div className="dashboard-view">
    <div className="balance-card"><div><div className="balance-label"><span className="eyebrow">TOTAL ACCRUED</span><button className="balance-toggle" type="button" onClick={onToggleBalance} aria-label={balanceVisible ? "Hide balance" : "Show balance"}>{balanceVisible ? <Eye size={16} /> : <EyeOff size={16} />}</button></div><strong>{displayBalance} <small>RTR</small></strong><span className="delta"><ArrowUpRight size={14} /> {balanceVisible ? "+0.16 RTR / day" : "•••••• / day"}</span></div><div className="balance-icon"><Zap size={21} /></div></div>
    <div className="section-heading"><div><span className="eyebrow">ACTIVE NODE</span><h2>{tier ?? "Collection protocol"}</h2></div><span className="live-dot">{active ? "LIVE" : "PAUSED"}</span></div>
    <div className="ring-wrap"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div className="ring-inner"><Sparkles size={17} /><strong>{formatTime(remaining)}</strong><span>{active ? "Accumulating" : "Ready to collect"}</span></div></div></div>
    <button className="collect-button" onClick={onStart}><span className="pulse" />{active ? "Collection active" : "Start 24-hour free node"}<ChevronRight size={18} /></button>
    <div className="metric-grid"><div><span>Network</span><strong>Base Mainnet</strong></div><div><span>Protocol</span><strong>v2.4.8</strong></div><div><span>Multiplier</span><strong>1.0x</strong><small>Standard Hashrate Protocol</small></div></div>
  </div>;
}

function Upgrades({ onPurchase }: { onPurchase: (tier: (typeof tiers)[number]) => void }) {
  return <div className="upgrades-view"><div className="page-intro"><span className="eyebrow">PROTOCOL STORE</span><h2>Choose your node tier</h2><p>Every paid tier runs for a fixed 30-day cycle and streams allocation directly from the deployment treasury.</p></div><div className="tier-list">{tiers.map((tier, index) => <article className={index === 3 ? "tier-card featured" : "tier-card"} key={tier[0]}><div className="tier-top"><span className="tier-number">0{index + 1}</span>{index === 3 && <span className="featured-label">POPULAR</span>}</div><h3>{tier[0]}</h3><div className="tier-price">{tier[1] === "Free" ? "Free" : `$${tier[1]}`}<small>{tier[1] === "Free" ? "" : " USDC"}</small></div><div className="tier-speed"><Zap size={15} /> {tier[2]} RTR <span>/ day</span></div><div className="tier-details"><span><Globe2 size={14} /> {tier[3]}</span><span><LockKeyhole size={14} /> {tier[4]}</span></div><button className="tier-button" onClick={() => onPurchase(tier)}>{tier[1] === "Free" ? "Activate free node" : "Purchase with USDC"}<ArrowUpRight size={16} /></button></article>)}</div></div>;
}

function ProfileMenu({ onSelect }: { onSelect: (item: string) => void }) {
  return <div className="profile-menu"><div className="menu-profile"><div className="mini-avatar"><UserRound size={17} /></div><div><strong>RTR member</strong><span>Authenticated session</span></div></div><button className="menu-option" onClick={() => onSelect("Upload Profile Picture")}><Upload size={16} /> Upload Profile Picture</button>{menuItems.map(([label, Icon]) => <button className="menu-option" key={label} onClick={() => onSelect(label)}><Icon size={16} /> {label}<ChevronRight className="menu-chevron" size={14} /></button>)}<button className="menu-option logout" onClick={() => void supabase.auth.signOut()}><LogOut size={16} /> Sign out</button></div>;
}

function AuthOverlay() {
  const [mode, setMode] = useState<"login" | "signup" | "recovery">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [signupVerification, setSignupVerification] = useState(false);
  const [enteredToken, setEnteredToken] = useState("");
  const [showDobInfo, setShowDobInfo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinIsValid = /^\d{6}$/.test(password);
  const pinsMatch = pinIsValid && password === confirmPin;

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
    else if (mode === "signup") setSignupVerification(true);
  }

  const isSignup = mode === "signup";
  const isRecovery = mode === "recovery";
  const canSubmit = !busy && (mode === "login" || (isSignup ? Boolean(fullName && email && dateOfBirth && pinsMatch) : Boolean(email && dateOfBirth)));

  if (signupVerification) return <main className="app-shell auth-shell"><div className="auth-panel otp-panel"><img className="shield-mark" src="/rtr-shield.svg" alt="RTR Network shield" /><span className="eyebrow">REGISTRATION ACTIVATION</span><h1>Verify Your Account</h1><p>We sent a 6-digit secure security verification token to your email inbox. Please type it in below to authorize your registration activation script.</p><form onSubmit={verifySignupCode}><label className="otp-label">Security token<input className="otp-input" type="text" inputMode="numeric" maxLength={6} pattern="[0-9]*" value={enteredToken} onChange={(event) => setEnteredToken(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoComplete="one-time-code" /></label>{message && <div className="auth-message" role="alert">{message}</div>}<button className="primary-button auth-submit" disabled={busy || enteredToken.length !== 6}>{busy ? <><span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>Authenticating token...</> : "Verify Code"}</button></form></div></main>;

  return <main className="app-shell auth-shell"><div className="auth-panel"><img className="shield-mark" src="/rtr-shield.svg" alt="RTR Network shield" /><span className="eyebrow">SECURE NODE PLATFORM</span><h1>{isRecovery ? "Recover your account" : mode === "login" ? "Welcome back" : "Create your account"}</h1><p>{isRecovery ? "Verify your registered details to receive a secure password reset code." : "Sign in to access your persistent node dashboard and activation history."}</p><form onSubmit={submit}>
    {isSignup && <label>Full name<input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" /></label>}
    <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
    {(isSignup || isRecovery) && <label className="date-field">Date of birth<div className="date-input-wrap"><input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required /><button type="button" className="info-button" aria-label="Why we need your date of birth" aria-expanded={showDobInfo} onClick={() => setShowDobInfo(!showDobInfo)}><Info size={15} /></button>{showDobInfo && <div className="dob-tooltip" role="tooltip"><strong>🔒 Why we need your Date of Birth:</strong><span>- Account Recovery: If you ever lose access to your password, you must verify your exact date of birth to reset it.</span><span>- Anti-Hack Protection: This stops hackers from trying to steal your funds via fake password reset requests.</span><span>- Security Lock: For your safety, this information cannot be changed after registration. Please ensure it matches your official records.</span></div>}</div></label>}
    {isSignup && <><label>Create 6-digit PIN<input type="password" value={password} onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} pattern="[0-9]*" autoComplete="new-password" /></label><label>Confirm 6-digit PIN<input type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" maxLength={6} pattern="[0-9]*" autoComplete="new-password" /></label>{confirmPin && !pinsMatch && <div className="pin-error" role="alert">PINs must match and contain exactly 6 digits.</div>}</>}
    {mode === "login" && <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="current-password" /></label>}
    {message && <div className="auth-message" role="alert">{message}</div>}<button className="primary-button auth-submit" disabled={!canSubmit}>{busy ? "Securing account..." : isRecovery ? "Send recovery code" : mode === "login" ? "Log in" : "Register"}</button></form>
    {mode === "login" && <button className="auth-switch" onClick={() => { setMode("recovery"); setMessage(null); }}>Forgot password?</button>}
    <button className="auth-switch" onClick={() => { setMode(isRecovery || mode === "signup" ? "login" : "signup"); setMessage(null); setShowDobInfo(false); }}>{isRecovery || mode === "signup" ? "Back to log in" : "Need an account? Sign up"}</button>
  </div></main>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</div></div>;
}

function PlaceholderView({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="placeholder-view"><div className="placeholder-icon">{icon}</div><span className="eyebrow">COMING ONLINE</span><h2>{title}</h2><p>{text}</p><button className="primary-button">View protocol status <ArrowUpRight size={16} /></button></div>; }

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>; }
