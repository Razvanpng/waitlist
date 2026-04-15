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
    <div className="flex min-h-screen bg-background flex-row-reverse animate-fade-in">
      <div className="hidden lg:flex lg:w-2/5 bg-primary text-foreground p-12 flex-col justify-end relative overflow-hidden animate-slide-left">
        <div className="absolute top-[-20%] right-[-20%] w-[140%] h-[140%] border-[2px] border-foreground rounded-full opacity-10 pointer-events-none" />
        <div className="font-display text-5xl leading-[0.9] tracking-tight uppercase relative z-10">
          Start <br/> tracking.
        </div>
      </div>

      <div className="flex w-full lg:w-3/5 flex-col justify-center px-6 py-12 md:px-16 lg:px-32">
        <div className="w-full max-w-xl animate-slide-up">
          <h2 className="font-display text-4xl uppercase mb-12 tracking-tight">Create account</h2>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold uppercase tracking-widest text-foreground">
                  Full Name
                </label>
                <input
                  {...register("full_name")}
                  type="text"
                  autoComplete="name"
                  className={`w-full border-b-2 bg-transparent py-2 text-xl outline-none transition-all focus:bg-foreground/5 focus:px-3 ${
                    errors.full_name ? "border-destructive" : "border-foreground"
                  }`}
                />
                {errors.full_name && <span className="text-sm font-bold text-destructive">{errors.full_name.message}</span>}
              </div>

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
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold uppercase tracking-widest text-foreground">
                Account Type
              </label>
              <select
                {...register("role")}
                className={`w-full border-b-2 bg-transparent py-2 text-xl outline-none transition-all cursor-pointer appearance-none rounded-none focus:bg-foreground/5 focus:px-3 ${
                  errors.role ? "border-destructive" : "border-foreground"
                }`}
              >
                <option value="client">Client</option>
                <option value="admin">Business</option>
              </select>
              {errors.role && <span className="text-sm font-bold text-destructive">{errors.role.message}</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold uppercase tracking-widest text-foreground">
                  Password
                </label>
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="new-password"
                  className={`w-full border-b-2 bg-transparent py-2 text-xl outline-none transition-all focus:bg-foreground/5 focus:px-3 ${
                    errors.password ? "border-destructive" : "border-foreground"
                  }`}
                />
                {errors.password && <span className="text-sm font-bold text-destructive">{errors.password.message}</span>}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold uppercase tracking-widest text-foreground">
                  Confirm
                </label>
                <input
                  {...register("confirm_password")}
                  type="password"
                  autoComplete="new-password"
                  className={`w-full border-b-2 bg-transparent py-2 text-xl outline-none transition-all focus:bg-foreground/5 focus:px-3 ${
                    errors.confirm_password ? "border-destructive" : "border-foreground"
                  }`}
                />
                {errors.confirm_password && <span className="text-sm font-bold text-destructive">{errors.confirm_password.message}</span>}
              </div>
            </div>

            {serverError && (
              <div className="bg-destructive text-destructive-foreground p-4 text-sm font-bold uppercase tracking-widest">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center bg-foreground py-5 text-sm font-bold uppercase tracking-widest text-background transition-all hover:bg-primary hover:text-foreground disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {isSubmitting ? "Creating account" : "Create account"}
            </button>
          </form>

          <div className="mt-16 border-t-2 border-foreground pt-6 text-sm font-bold uppercase tracking-widest">
            Already have an account?{" "}
            <Link to="/login" className="text-foreground hover:text-primary transition-colors underline decoration-2 underline-offset-4">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}