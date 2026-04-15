import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, Lock, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("enter a valid email"),
  password: z.string().min(1, "password is required"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname;

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setServerError(error.message.toLowerCase());
      return;
    }

    const role = data.user?.user_metadata?.role ?? "client";
    const dest = from ?? (role === "admin" ? "/admin/dashboard" : "/client/dashboard");
    navigate(dest, { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Sign in to your account
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl shadow-black/30">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={`
                    w-full rounded-lg border bg-zinc-800/60 pl-9 pr-3 py-2.5
                    text-sm text-zinc-100 placeholder:text-zinc-600
                    outline-none transition-colors
                    focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                    ${errors.email
                      ? "border-red-500/70"
                      : "border-zinc-700 hover:border-zinc-600"
                    }
                  `}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`
                    w-full rounded-lg border bg-zinc-800/60 pl-9 pr-3 py-2.5
                    text-sm text-zinc-100 placeholder:text-zinc-600
                    outline-none transition-colors
                    focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                    ${errors.password
                      ? "border-red-500/70"
                      : "border-zinc-700 hover:border-zinc-600"
                    }
                  `}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
                <p className="text-xs text-red-400">{serverError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="
                mt-1 flex items-center justify-center gap-2 rounded-lg
                bg-violet-600 hover:bg-violet-500 active:bg-violet-700
                px-4 py-2.5 text-sm font-medium text-white
                transition-colors disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-zinc-600">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}