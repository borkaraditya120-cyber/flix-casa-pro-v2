"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { useDeviceType } from "@/hooks/use-device-type";

export function GoogleLoginButton() {
  const login = useAuthStore((s) => s.login);
  const { deviceType } = useDeviceType();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrId, setQrId] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<"none" | "email" | "code" | "password">("none");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const verification = await fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        const verificationData = await verification.json();
        if (!verification.ok || !verificationData.valid) throw new Error(verificationData.error || "This Google account is invalid or does not exist.");
      }
      await login(email, name || email.split("@")[0], undefined, password, mode);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send reset code.");
      setResetStep("code");
    } catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Unable to send reset code."); }
    finally { setLoading(false); }
  };

  const verifyReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", email, code: resetCode }) });
      if (!response.ok) throw new Error("Invalid or expired verification code.");
      setResetStep("password");
    } catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Invalid verification code."); }
    finally { setLoading(false); }
  };

  const completeReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", email, code: resetCode, password: resetPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to reset password.");
      setResetStep("none"); setMode("login"); setError("Password updated. You can now log in.");
    } catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Unable to reset password."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!qrId) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/auth/qr-session?id=${encodeURIComponent(qrId)}`, { credentials: "include" });
      if (response.ok && (await response.json()).authorized) window.location.reload();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [qrId]);

  const startQrLogin = async () => {
    setError("");
    const response = await fetch("/api/auth/qr-session", { credentials: "include" });
    if (!response.ok) { setError("Unable to create a TV login code."); return; }
    const data = await response.json() as { id: string };
    setQrId(data.id);
  };

  if (qrId) {
    const qrUrl = `${window.location.origin}/?tvPair=${encodeURIComponent(qrId)}`;
    return <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 text-center shadow-2xl sm:p-8"><h2 className="text-xl font-bold">Scan to sign in</h2><p className="mt-2 text-sm text-zinc-400">Scan this code from a signed-in mobile device.</p><Image unoptimized width={260} height={260} src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrUrl)}`} alt="TV login QR code" className="mx-auto mt-6 h-64 w-64 rounded bg-white p-2" /><p className="mt-4 text-xs text-zinc-500">Code refreshes automatically.</p><button type="button" onClick={() => setQrId(null)} className="mt-5 rounded bg-zinc-700 px-4 py-2 text-sm">Use remote login</button></div>;
  }

  if (resetStep !== "none") {
    return <form onSubmit={resetStep === "email" ? requestReset : resetStep === "code" ? verifyReset : completeReset} className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl sm:p-8">
      <h2 className="text-xl font-bold text-white">Reset Password</h2>
      <p className="mt-2 text-sm text-zinc-400">{resetStep === "email" ? "Enter your registered Google email." : resetStep === "code" ? "Enter the 6-digit code sent to your inbox." : "Choose a new password."}</p>
      {(resetStep === "email" || resetStep === "code" || resetStep === "password") && <input required type={resetStep === "email" ? "email" : resetStep === "code" ? "text" : "password"} minLength={resetStep === "code" ? 6 : resetStep === "password" ? 8 : undefined} value={resetStep === "email" ? email : resetStep === "code" ? resetCode : resetPassword} onChange={(event) => resetStep === "email" ? setEmail(event.target.value) : resetStep === "code" ? setResetCode(event.target.value.toUpperCase()) : setResetPassword(event.target.value)} placeholder={resetStep === "email" ? "Google Email Address" : resetStep === "code" ? "6-digit verification code" : "New Password"} className="mt-5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-cyan-400" />}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <div className="mt-6 flex gap-2"><button type="button" onClick={() => { setResetStep("none"); setError(""); }} className="flex-1 rounded-lg bg-zinc-700 px-4 py-3 text-sm">Back</button><button type="submit" disabled={loading} className="flex-1 rounded-lg bg-cyan-600 px-4 py-3 font-bold text-white disabled:opacity-50">{loading ? "PLEASE WAIT..." : resetStep === "email" ? "SEND CODE" : resetStep === "code" ? "VERIFY CODE" : "UPDATE PASSWORD"}</button></div>
    </form>;
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl shadow-black/40 sm:p-8">
      <div className="mb-7 grid grid-cols-2 border-b border-zinc-800">
        <button type="button" onClick={() => { setMode("login"); setError(""); }} className={`border-b-2 px-3 pb-3 text-sm font-bold ${mode === "login" ? "border-cyan-400 text-white" : "border-transparent text-zinc-500"}`}>🔑 LOG IN</button>
        <button type="button" onClick={() => { setMode("signup"); setError(""); }} className={`border-b-2 px-3 pb-3 text-sm font-bold ${mode === "signup" ? "border-red-400 text-white" : "border-transparent text-zinc-500"}`}>📝 SIGN UP</button>
      </div>
      <div className="space-y-3">
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Google Email Address" autoComplete="email" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-cyan-400" />
        {mode === "signup" && <input required type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Display Name / Username" autoComplete="name" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-cyan-400" />}
        <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "Create Password" : "Password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-cyan-400" />
        {mode === "signup" && <input required minLength={8} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm Password" autoComplete="new-password" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-cyan-400" />}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <button type="submit" disabled={loading || !email || !password || (mode === "signup" && (!name || !confirmPassword))} className={`mt-6 w-full rounded-lg px-4 py-3 font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${mode === "signup" ? "bg-gradient-to-r from-blue-600 to-red-600 shadow-red-950/40" : "bg-cyan-600 shadow-cyan-950/40 hover:bg-cyan-500"}`}>
        {loading ? "PLEASE WAIT..." : mode === "signup" ? "CREATE ACCOUNT" : "LOG IN"}
      </button>
      {mode === "login" && <button type="button" onClick={() => { setResetStep("email"); setError(""); }} className="mt-4 w-full text-sm text-cyan-300 hover:text-cyan-200">Forgot Password?</button>}
      {deviceType === "tv" && mode === "login" && <button type="button" onClick={() => void startQrLogin()} className="mt-3 w-full rounded-lg border border-zinc-700 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800">QR Code Scanner Login</button>}
    </form>
  );
}
