import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("invalid email"),
  password: z.string().min(1, "password required"),
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
      setServerError(error.message);
      return;
    }

    const role = data.user?.user_metadata?.role ?? "client";
    const dest = from ?? (role === "admin" ? "/admin/dashboard" : "/client/dashboard");
    navigate(dest, { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background animate-fade-in">
      <div className="hidden lg:flex lg:w-1/2 bg-foreground text-primary p-16 flex-col justify-between animate-slide-right mr-[-1px] relative z-10">
        <div className="font-display text-3xl tracking-tighter">WAITLIST.</div>
        <div className="max-w-2xl">
          <h1 className="font-display text-[5.5rem] leading-[0.9] tracking-tight uppercase">
            Manage <br /> your time.
          </h1>
          <p className="mt-8 text-2xl text-background/80">
            Catch every cancellation and fill your empty slots automatically.
          </p>
        </div>
        <div className="text-base font-bold tracking-widest uppercase">
          v1.0
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-16 md:px-20 lg:px-32 relative z-0">
        <div className="w-full max-w-lg mx-auto animate-slide-up">
          <h2 className="font-display text-5xl uppercase mb-12 tracking-tight">Sign In</h2>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-10">
            <div className="flex flex-col gap-3">
              <label className="text-base font-bold uppercase tracking-widest text-foreground">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                className={`w-full border-b-2 bg-transparent py-3 text-2xl outline-none transition-all focus:bg-foreground/5 focus:px-4 ${
                  errors.email ? "border-destructive" : "border-foreground"
                }`}
              />
              {errors.email && <span className="text-base font-bold text-destructive">{errors.email.message}</span>}
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-base font-bold uppercase tracking-widest text-foreground">
                Password
              </label>
              <input
                {...register("password")}
                type="password"
                autoComplete="current-password"
                className={`w-full border-b-2 bg-transparent py-3 text-2xl outline-none transition-all focus:bg-foreground/5 focus:px-4 ${
                  errors.password ? "border-destructive" : "border-foreground"
                }`}
              />
              {errors.password && <span className="text-base font-bold text-destructive">{errors.password.message}</span>}
            </div>

            {serverError && (
              <div className="bg-destructive text-destructive-foreground p-5 text-base font-bold uppercase tracking-widest">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex w-full items-center justify-center bg-foreground py-6 text-lg font-bold uppercase tracking-widest text-background transition-all hover:bg-primary hover:text-foreground disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : null}
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-20 border-t-2 border-foreground pt-8 text-base font-bold uppercase tracking-widest">
            No account?{" "}
            <Link to="/register" className="text-foreground hover:text-primary transition-colors underline decoration-2 underline-offset-4">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}