"use client";

/**
 * Sign-in page (demo-grade auth).
 *
 * Accepts any name/email/password, stores the session in localStorage as
 * `pr_user`, and redirects to /dashboard — which redirects back here when
 * no session exists. Real identity/OAuth is a post-hackathon concern; this
 * gives the product a complete, professional entry flow.
 */
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, Mail, User, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Straight to the dashboard.
  useEffect(() => {
    if (localStorage.getItem("pr_user")) router.replace("/dashboard");
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    localStorage.setItem("pr_user", JSON.stringify({ name: name.trim(), email: email.trim() }));
    router.replace("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
      {/* Brand */}
      <div className="flex items-center gap-2 mb-8">
        <span className="w-3 h-3 rounded-full bg-[#FFD600]" />
        <span className="font-grotesk font-bold tracking-[2px] text-[#F5F5F0] uppercase">
          Pay Right
        </span>
        <span className="font-mono text-[9px] text-[#555555] tracking-wider uppercase border-l border-[#2D2D2D] pl-3">
          powered by Prava
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-8"
      >
        <h1 className="font-grotesk text-xl font-bold tracking-wide uppercase text-[#F5F5F0] mb-1">
          Sign in
        </h1>
        <p className="font-mono text-[11px] text-[#888888] mb-7 leading-relaxed">
          Access the Infra Fit Agent — analyze your codebase, review proposals, and
          authorize purchases within your wallet limits.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block font-mono text-[10px] text-[#555555] tracking-wider uppercase mb-1.5">
              Full name
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Devang Gandhi"
                className="w-full bg-[#0A0A0A] border border-[#2D2D2D] text-xs font-mono text-[#F5F5F0] rounded p-3 pl-9 focus:outline-none focus:border-[#FFD600]"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] text-[#555555] tracking-wider uppercase mb-1.5">
              Work email
            </label>
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@startup.io"
                className="w-full bg-[#0A0A0A] border border-[#2D2D2D] text-xs font-mono text-[#F5F5F0] rounded p-3 pl-9 focus:outline-none focus:border-[#FFD600]"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] text-[#555555] tracking-wider uppercase mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0A0A0A] border border-[#2D2D2D] text-xs font-mono text-[#F5F5F0] rounded p-3 pl-9 focus:outline-none focus:border-[#FFD600]"
              />
            </div>
          </div>

          {error && (
            <div className="font-mono text-[11px] text-[#FF6B35] bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded p-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="group font-grotesk text-[11px] font-bold text-[#0A0A0A] bg-[#FFD600] tracking-[1.5px] px-8 py-3.5 hover:bg-[#F5F5F0] transition-colors flex items-center justify-center gap-2 rounded-sm mt-2 uppercase"
          >
            Sign in to dashboard
            <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-[#1D1D1D] font-mono text-[10px] text-[#555555]">
          <ShieldCheck size={12} className="text-[#FFD600]" />
          Payments protected by Prava — passkey approval, one-time Visa tokens, hard spend limits.
        </div>
      </motion.div>

      <span className="font-mono text-[10px] text-[#555555] mt-6">
        Pay Right — pre-deployment infrastructure, purchased responsibly.
      </span>
    </div>
  );
}
