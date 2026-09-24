"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

export default function VerifyRecoveryPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Fixed form handler type to satisfy Vercel compilation requirements
  const handleVerifyAndReset = async (e: any) => {
    e.preventDefault();
    setStatus(null);

    if (!email || !code || !newPassword) {
      setStatus({ type: "error", text: "Please fill in all input boxes." });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          newPassword: newPassword
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setStatus({ type: "error", text: result.error || "Verification failed." });
      } else {
        setStatus({ type: "success", text: "Your password has been changed successfully! You can now log in." });
        setEmail("");
        setCode("");
        setNewPassword("");
      }
      
    } catch (err) {
      setStatus({ type: "error", text: "An unexpected error occurred during confirmation." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400 mb-3 border border-emerald-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Account Recovery</h1>
          <p className="text-sm text-slate-400 mt-1">Type in your 6-digit email code manually</p>
        </div>

        {status && (
          <div className={`p-4 rounded-xl mb-6 text-sm border ${
            status.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}>
            {status.text}
          </div>
        )}

        <form onSubmit={handleVerifyAndReset} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registered Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors" 
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Type 6-Digit Code</label>
            <input 
              type="text" 
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 px-4 text-sm tracking-widest text-center font-mono focus:outline-none focus:border-emerald-500 transition-colors"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">New Secure Password</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              disabled={loading}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold py-3.5 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? "Verifying Code..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}