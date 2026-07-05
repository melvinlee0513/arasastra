import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import owlMascot from "@/assets/owl-mascot.png";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, isLoading: authLoading, signIn } = useAuth();

  useEffect(() => {
    if (user && !authLoading && role) {
      if (role === "admin" || role === "superadmin") {
        navigate("/admin");
      } else if (role === "tutor") {
        navigate("/tutor");
      } else {
        navigate("/dashboard");
      }
    }
  }, [user, role, authLoading, navigate]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    const { error } = await signIn(data.email, data.password);
    setIsLoading(false);

    if (error) {
      toast({
        title: "Login failed",
        description:
          error.message === "Invalid login credentials"
            ? "Invalid email or password. Please try again."
            : error.message === "Email not confirmed"
              ? "Please verify your email before logging in. Check your inbox."
              : error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Welcome back!", description: "Successfully logged in." });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center p-8">
      <Card className="w-full max-w-md p-8 space-y-6 bg-white/80 backdrop-blur-xl border-white/40 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="text-center space-y-2">
          <img src={owlMascot} alt="Arasa A+" className="w-16 h-16 mx-auto" />
          <h1 className="text-2xl font-bold text-[#0F172A]">Welcome back</h1>
          <p className="text-slate-500 text-sm">Sign in to continue to Arasa A+</p>
        </div>

        <Form {...loginForm}>
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
            <FormField
              control={loginForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[#0F172A] font-medium">Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="you@example.com"
                      type="email"
                      autoComplete="email"
                      className="rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={loginForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[#0F172A] font-medium">Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="pl-10 pr-10 rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full p-0"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-full h-11 bg-[#0052FF] hover:bg-[#0047DB] text-white shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            <div className="text-center">
              <Link to="/auth/reset-password" className="text-sm text-[#0052FF] hover:underline">
                Forgot your password?
              </Link>
            </div>
          </form>
        </Form>

        <div className="pt-2 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            Access to Arasa A+ is by invitation only. Please contact your administrator for an invite link.
          </p>
        </div>
      </Card>
    </div>
  );
}
