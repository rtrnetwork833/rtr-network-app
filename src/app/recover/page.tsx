"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export default function StandaloneRecoveryPage() {
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setStatus(null);

    if (!email || !dateOfBirth) {
      setStatus({ type: "error", text: "Please enter both email and date of birth." });
      return;
    }

    setLoading(true);

    try {
      // Clean up the date input from DD/MM/YYYY or send as-is to your backend API
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(), 
          dateOfBirth: dateOfBirth.trim() 
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setStatus({ type: "error", text: result.error || "The details provided do not match our records." });
      } else {
        setStatus({ type: "success", text: "Recovery code sent! Redirecting you to verify..." });
        
        // Seamlessly transfer the user to your manual 6-digit input screen after 2 seconds
        setTimeout(() => {
          window.location.href = "/verify";
        }, 2000);
      }
    } catch (err) {
      setStatus({ type: "error", text: "An unexpected network error occurred." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        
        {/* Branding & Header */}
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400 mb-3 border border-emerald-500/20">
            <KeyRound className="w-8 h-8" />
          </div>
          <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase bg-emerald-500/5 px-2.5 py-1 rounded-md border border-emerald-500/10 mb-2">
            Secure Node Platform
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Recover Account</h1>
        </div>

        {/* Dynamic Status Notifications */}
        {status && (
          <div className={`p-4 rounded-xl mb-6 text-sm border ${
            status.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}>
            {status.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors" 
              disabled={loading}
              required
            />
          </div>

          {/* Birthday Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date of Birth</label>
            <input 
              type="text" 
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              placeholder="DD/MM/YYYY"
              className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              disabled={loading}
              required
            />
          </div>

          {/* Action Submission Button */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-slate-950 font-bold py-3.5 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? "Processing..." : "Send recovery code"}
          </button>
        </form>
      </div>
    </div>
  );
}