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
    <div className="flex min-h-[100dvh] w-full flex-col lg:flex-row animate-fade-in bg-background lg:bg-gradient-to-r lg:from-foreground lg:from-[49%] lg:to-background lg:to-[51%] overflow-hidden">
      <div className="hidden lg:flex w-full lg:w-1/2 bg-transparent text-primary p-12 xl:p-20 flex-col justify-between animate-slide-right relative z-10">
        <div className="font-display text-3xl tracking-tighter">WAITLIST.</div>
        <div className="max-w-2xl mt-auto mb-auto">
          <h1 className="font-display text-[5rem] xl:text-[7rem] leading-[0.85] tracking-tight uppercase">
            Manage <br /> your time.
          </h1>
          <p className="mt-10 text-2xl xl:text-3xl text-background/80 leading-snug">
            Catch every cancellation and fill your empty slots automatically.
          </p>
        </div>
        <div className="text-base font-bold tracking-widest uppercase">
          v1.0
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-16 md:px-20 lg:px-24 xl:px-40 bg-transparent relative z-20">
        <div className="w-full max-w-xl mx-auto animate-slide-up">
          <div className="lg:hidden font-display text-2xl tracking-tighter text-foreground mb-12">WAITLIST.</div>

          <h2 className="font-display text-5xl xl:text-6xl uppercase mb-12 xl:mb-16 tracking-tight text-foreground">Sign In</h2>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-10 xl:gap-12">
            <div className="flex flex-col gap-3">
              <label className="text-base font-bold uppercase tracking-widest text-foreground">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                className={`w-full border-b-4 bg-transparent py-3 text-2xl xl:text-3xl outline-none transition-all focus:bg-foreground/5 focus:px-4 ${
                  errors.email ? "border-destructive" : "border-foreground text-foreground"
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
                className={`w-full border-b-4 bg-transparent py-3 text-2xl xl:text-3xl outline-none transition-all focus:bg-foreground/5 focus:px-4 ${
                  errors.password ? "border-destructive" : "border-foreground text-foreground"
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
              className="mt-6 flex w-full items-center justify-center bg-foreground py-6 xl:py-8 text-xl xl:text-2xl font-bold uppercase tracking-widest text-background transition-all hover:bg-primary hover:text-foreground disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : null}
              {isSubmitting ? "Signing in" : "Sign in"}
            </button>
          </form>

          <div className="mt-20 xl:mt-24 border-t-4 border-foreground pt-10 text-base font-bold uppercase tracking-widest text-foreground">
            Don't have an account?{" "}
            <Link to="/register" className="text-foreground hover:text-primary transition-colors underline decoration-4 underline-offset-8">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}