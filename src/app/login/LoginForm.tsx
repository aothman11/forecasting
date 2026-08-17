"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import Image from "next/image";

const INITIAL: LoginState = { error: null };

export default function LoginForm() {
  const [state, action, isPending] = useActionState(loginAction, INITIAL);

  return (
    <div className="w-full max-w-sm">
      {/* Card */}
      <div
        className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "#fff" }}
      >
        {/* Brand header */}
        <div
          className="px-8 py-7 flex flex-col items-center gap-2"
          style={{
            background: "linear-gradient(135deg, #035c29 0%, #047836 60%, #0a9142 100%)",
          }}
        >
          <div className="w-24 h-12 relative mb-1">
            <Image
              src="/alwatania-logo-white.png"
              alt="Al-Watania Poultry"
              fill
              className="object-contain"
              priority
            />
          </div>
          <p className="text-white/80 text-xs tracking-widest uppercase font-semibold">
            Central Operations Planning
          </p>
        </div>

        {/* Form body */}
        <div className="px-8 py-7">
          <h1 className="text-lg font-bold text-neutral-800 mb-1">
            Sign in to AWP COP
          </h1>
          <p className="text-xs text-neutral-500 mb-6">
            Enter your credentials to access the planning workbench.
          </p>

          <form action={action} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-neutral-600 mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@awp.com"
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  borderColor: state.error ? "#D24918" : "#d1d5db",
                  // @ts-expect-error focus ring via inline style trick
                  "--tw-ring-color": "#047836",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-neutral-600 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  borderColor: state.error ? "#D24918" : "#d1d5db",
                }}
              />
            </div>

            {/* Error message */}
            {state.error && (
              <div
                className="flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium"
                style={{ background: "#fff5f2", color: "#D24918" }}
                role="alert"
              >
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{state.error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60"
              style={{
                background: isPending ? "#6b9e7e" : "#047836",
                // @ts-expect-error
                "--tw-ring-color": "#047836",
              }}
            >
              {isPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center text-white/60 text-[11px] mt-5">
        Al-Watania Poultry · Internal tool · Contact admin to reset password
      </p>
    </div>
  );
}
