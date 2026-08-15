import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail, XCircle } from "lucide-react";
import clsx from "clsx";
import fntLogo from "@/assets/fnt-logo.png";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/AuthContext";

/**
 * Two-panel layout mirrors the Sidebar's brand header (pine-950 +
 * mesh-lattice-light + glow behind the mark) so the first screen someone
 * sees feels like the same product as the app behind it, not a generic
 * auth-template login bolted on afterward. On narrow screens the brand
 * panel collapses to a compact strip above the form, same instinct as the
 * sidebar collapsing to icon-only rather than disappearing.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="mesh-lattice-light relative flex shrink-0 items-center gap-3 bg-pine-950 px-6 py-8 text-pine-50 lg:w-[420px] lg:flex-col lg:items-start lg:justify-center lg:gap-8 lg:px-12 lg:py-0">
        <div className="relative flex shrink-0 items-center justify-center">
          <span
            className="absolute -inset-3 rounded-full bg-pine-400/25 blur-md"
            aria-hidden="true"
          />
          <img
            src={fntLogo}
            alt="Fortune Net & Twine"
            className="relative h-10 object-contain drop-shadow-[0_3px_7px_rgba(2,8,20,0.6)] lg:h-14"
          />
        </div>
        <div className="min-w-0 lg:mt-2">
          <p className="text-[15px] font-bold tracking-tight text-white lg:text-xl">
            FORTUNE NET &amp; TWINE
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-pine-300 lg:text-[11px]">
            Export Sales &amp; Order Management
          </p>
        </div>
        <p className="hidden max-w-xs text-sm leading-relaxed text-pine-200 lg:block">
          From customer inquiry to shipped invoice — one system that fits the way
          the business already works.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-paper-50 px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="rounded-xl border border-paper-200 bg-white p-6 shadow-[var(--shadow-panel)] sm:p-8">
            <h1 className="text-[17px] font-semibold text-paper-900">Sign in</h1>
            <p className="mt-1 text-sm text-paper-500">
              Enter your work email and password to continue.
            </p>

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-3 text-alert-800">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
                <p className="text-sm leading-snug">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold text-paper-600"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@fortunenetandtwine.com"
                    className="w-full rounded-lg border border-paper-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-semibold text-paper-600">
                    Password
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-xs font-medium text-manifest-700 hover:text-manifest-800"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-paper-200 bg-white py-2.5 pl-9 pr-9 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-400 hover:text-paper-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={submitting}
                className={clsx("mt-1 w-full justify-center", submitting && "opacity-80")}
                icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
              >
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs text-paper-400">
            Having trouble signing in? Contact your system administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
