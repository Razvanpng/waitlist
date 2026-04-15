import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/store/authSlice";

const schema = z
  .object({
    full_name: z.string().min(2, "name required"),
    email: z.string().email("invalid email"),
    role: z.enum(["client", "admin"]),
    password: z.string().min(8, "min 8 chars"),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "passwords mismatch",
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
      setServerError(error.message);
      return;
    }

    const dest = values.role === "admin" ? "/admin/dashboard" : "/client/dashboard";
    navigate(dest, { replace: true });
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col lg:flex-row animate-fade-in bg-background lg:bg-gradient-to-r lg:from-background lg:from-[57%] lg:to-primary lg:to-[59%] overflow-hidden">
      
      <div className="flex w-full lg:w-[58%] flex-col justify-center px-8 py-16 md:px-20 lg:px-24 xl:px-40 bg-transparent relative z-20">
        <div className="w-full max-w-2xl mx-auto animate-slide-up">
          <div className="lg:hidden font-display text-2xl tracking-tighter text-foreground mb-12">WAITLIST.</div>

          <h2 className="font-display text-5xl xl:text-6xl uppercase mb-12 xl:mb-16 tracking-tight text-foreground">Create account</h2>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-10 xl:gap-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 xl:gap-12">
              <div className="flex flex-col gap-3">
                <label className="text-base font-bold uppercase tracking-widest text-foreground">
                  Full Name
                </label>
                <input
                  {...register("full_name")}
                  type="text"
                  autoComplete="name"
                  className={`w-full border-b-4 bg-transparent py-3 text-2xl xl:text-3xl outline-none transition-all focus:bg-foreground/5 focus:px-4 ${
                    errors.full_name ? "border-destructive" : "border-foreground text-foreground"
                  }`}
                />
                {errors.full_name && <span className="text-base font-bold text-destructive">{errors.full_name.message}</span>}
              </div>

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
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-base font-bold uppercase tracking-widest text-foreground">
                Account Type
              </label>
              <select
                {...register("role")}
                className={`w-full border-b-4 bg-transparent py-3 text-2xl xl:text-3xl outline-none transition-all cursor-pointer appearance-none rounded-none focus:bg-foreground/5 focus:px-4 ${
                  errors.role ? "border-destructive" : "border-foreground text-foreground"
                }`}
              >
                <option value="client">Client User</option>
                <option value="admin">System Administrator</option>
              </select>
              {errors.role && <span className="text-base font-bold text-destructive">{errors.role.message}</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 xl:gap-12">
              <div className="flex flex-col gap-3">
                <label className="text-base font-bold uppercase tracking-widest text-foreground">
                  Password
                </label>
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="new-password"
                  className={`w-full border-b-4 bg-transparent py-3 text-2xl xl:text-3xl outline-none transition-all focus:bg-foreground/5 focus:px-4 ${
                    errors.password ? "border-destructive" : "border-foreground text-foreground"
                  }`}
                />
                {errors.password && <span className="text-base font-bold text-destructive">{errors.password.message}</span>}
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-base font-bold uppercase tracking-widest text-foreground">
                  Confirm
                </label>
                <input
                  {...register("confirm_password")}
                  type="password"
                  autoComplete="new-password"
                  className={`w-full border-b-4 bg-transparent py-3 text-2xl xl:text-3xl outline-none transition-all focus:bg-foreground/5 focus:px-4 ${
                    errors.confirm_password ? "border-destructive" : "border-foreground text-foreground"
                  }`}
                />
                {errors.confirm_password && <span className="text-base font-bold text-destructive">{errors.confirm_password.message}</span>}
              </div>
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
              {isSubmitting ? "Creating account" : "Create account"}
            </button>
          </form>

          <div className="mt-20 xl:mt-24 border-t-4 border-foreground pt-10 text-base font-bold uppercase tracking-widest text-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-foreground hover:text-primary transition-colors underline decoration-4 underline-offset-8">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex w-[42%] flex-col justify-end p-12 xl:p-20 text-foreground relative overflow-hidden animate-slide-left z-10 bg-transparent pointer-events-none">
        <div className="absolute top-[-20%] right-[-20%] w-[140%] h-[140%] border-[4px] border-foreground rounded-full opacity-10" />
        <div className="font-display text-[5rem] xl:text-[7rem] leading-[0.85] tracking-tight uppercase relative z-10">
          Start <br/> tracking.
        </div>
      </div>

    </div>
  );
}