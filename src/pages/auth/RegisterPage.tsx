import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, Lock, User, Zap, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/store/authSlice";

const schema = z
  .object({
    full_name: z.string().min(2, "enter your full name"),
    email: z.string().email("enter a valid email"),
    role: z.enum(["client", "admin"]),
    password: z.string().min(8, "minimum 8 characters"),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "client" },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);

    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.full_name,
          role: values.role as UserRole,
        },
      },
    });

    if (error) {
      setServerError(error.message.toLowerCase());
      return;
    }

    // role is in user_metadata — onAuthStateChange in App.tsx will handle redirect
    const dest =
      values.role === "admin" ? "/admin/dashboard" : "/client/dashboard";
    navigate(dest, { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-12">
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
              Create an account
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Start managing your waitlist
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl shadow-black/30">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Field label="Full name" error={errors.full_name?.message}>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  {...register("full_name")}
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  className={inputCls(!!errors.full_name, "pl-9")}
                />
              </div>
            </Field>

            <Field label="Email" error={errors.email?.message}>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputCls(!!errors.email, "pl-9")}
                />
              </div>
            </Field>

            <Field label="Account type" error={errors.role?.message}>
              <div className="relative">
                <select
                  {...register("role")}
                  className={`
                    ${inputCls(!!errors.role, "pr-8")}
                    appearance-none bg-zinc-800/60 cursor-pointer
                  `}
                >
                  <option value="client">Client — book slots</option>
                  <option value="admin">Business Admin — manage slots</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              </div>
            </Field>

            <Field label="Password" error={errors.password?.message}>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="new-password"
                  placeholder="min. 8 characters"
                  className={inputCls(!!errors.password, "pl-9")}
                />
              </div>
            </Field>

            <Field label="Confirm password" error={errors.confirm_password?.message}>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  {...register("confirm_password")}
                  type="password"
                  autoComplete="new-password"
                  placeholder="repeat password"
                  className={inputCls(!!errors.confirm_password, "pl-9")}
                />
              </div>
            </Field>

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
              {isSubmitting ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

// -- helpers --

function inputCls(hasError: boolean, extra = "") {
  return [
    "w-full rounded-lg border bg-zinc-800/60 px-3 py-2.5",
    "text-sm text-zinc-100 placeholder:text-zinc-600",
    "outline-none transition-colors",
    "focus:ring-1 focus:ring-violet-500 focus:border-violet-500",
    hasError
      ? "border-red-500/70"
      : "border-zinc-700 hover:border-zinc-600",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}