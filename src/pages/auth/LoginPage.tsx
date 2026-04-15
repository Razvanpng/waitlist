import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("invalid email format"),
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
    <div className="grid min-h-screen w-full lg:grid-cols-2 bg-foreground animate-fade-in">
      <div className="hidden lg:flex flex-col justify-between p-16 text-primary animate-slide-right z-0">
        <div className="font-display text-2xl tracking-tighter">WAITLIST.</div>
        <div className="max-w-xl">
          <h1 className="font-display text-7xl leading-[0.9] tracking-tight uppercase">
            Manage <br /> your time.
          </h1>
          <p className="mt-8 text-xl text-background/80">
            Catch every cancellation and fill your empty slots automatically.
          </p>
        </div>
        <div className="text-sm font-bold tracking-widest uppercase">
          v1.0
        </div>
      </div>

      <div className="flex flex-col justify-center bg-background px-6 py-12 md:px-16 lg:px-24 z-10 shadow-2xl">
        <div className="w-full max-w-md mx-auto animate-slide-up">
          <h2 className="font-display text-4xl uppercase mb-10 tracking-tight">Sign In</h2>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold uppercase tracking-widest text-foreground">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                className={`w-full border-b-2 bg-transparent py-2 text-xl outline-none transition-all focus:bg-foreground/5 focus:px-3 ${
                  errors.email ? "border-destructive" : "border-foreground"
                }`}
              />
              {errors.email && <span className="text-sm font-bold text-destructive">{errors.email.message}</span>}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold uppercase tracking-widest text-foreground">
                Password
              </label>
              <input
                {...register("password")}
                type="password"
                autoComplete="current-password"
                className={`w-full border-b-2 bg-transparent py-2 text-xl outline-none transition-all focus:bg-foreground/5 focus:px-3 ${
                  errors.password ? "border-destructive" : "border-foreground"
                }`}
              />
              {errors.password && <span className="text-sm font-bold text-destructive">{errors.password.message}</span>}
            </div>

            {serverError && (
              <div className="bg-destructive text-destructive-foreground p-4 text-sm font-bold uppercase tracking-widest">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex w-full items-center justify-center bg-foreground py-5 text-sm font-bold uppercase tracking-widest text-background transition-all hover:bg-primary hover:text-foreground disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {isSubmitting ? "Signing in" : "Sign in"}
            </button>
          </form>

          <div className="mt-16 border-t-2 border-foreground pt-6 text-sm font-bold uppercase tracking-widest">
            Don't have an account?{" "}
            <Link to="/register" className="text-foreground hover:text-primary transition-colors underline decoration-2 underline-offset-4">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}