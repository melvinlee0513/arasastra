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
import { supabase } from "@/integrations/supabase/client";
import {
  getTenantSubdomain,
  tenantHrefFor,
  normalizeSlugInput,
  validateSubdomainSlug,
  ROOT_DOMAIN,
} from "@/lib/tenantSubdomain";
import owlMascot from "@/assets/owl-mascot.png";
import { useTenant } from "@/contexts/TenantContext";


const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [params] = useSearchParams();
  const nextParam = params.get("next");
  // Only accept a same-origin relative path to avoid open-redirect abuse.
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, isLoading: authLoading, signIn } = useAuth();

  useEffect(() => {
    if (user && !authLoading && role) {
      if (safeNext) {
        window.location.href = safeNext;
        return;
      }
      if (role === "admin" || role === "superadmin") {
        navigate("/admin");
      } else if (role === "tutor") {
        navigate("/tutor");
      } else {
        navigate("/dashboard");
      }
    }
  }, [user, role, authLoading, navigate, safeNext]);

  const emailParam = params.get("email") ?? "";
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: emailParam, password: "" },
  });


  const onLogin = async (data: LoginFormData) => {
    setIsLoading(true);

    // Pre-login tenant discovery — moved behind an Edge Function
    // (`tenant-lookup`) with per-IP and per-email rate limits + generic
    // responses so anonymous callers cannot enumerate accounts.
    const info = getTenantSubdomain();
    const onHQApex = info.isApex && !info.isPreview;
    if (onHQApex) {
      try {
        const { data: routing, error: rpcErr } = await supabase.functions.invoke(
          "tenant-lookup",
          { body: { email: data.email } },
        );
        if (!rpcErr && routing?.destination === "tenant" && routing?.slug) {
          const target = tenantHrefFor(
            routing.slug,
            `/auth?email=${encodeURIComponent(data.email)}${
              safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""
            }`,
          );
          window.location.replace(target);
          return;
        }
      } catch (e) {
        console.warn("[auth] pre-login tenant redirect failed", e);
      }
    }


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


  return <AuthPageInner {...{ loginForm, onLogin, isLoading, showPassword, setShowPassword }} />;
}

function AuthPageInner({ loginForm, onLogin, isLoading, showPassword, setShowPassword }: any) {
  const { center, themeConfig, isHQHost } = useTenant();
  const [showSlugForm, setShowSlugForm] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);

  const brandName = center?.name ?? "Arasa A+";
  const brandLogo = themeConfig?.logoUrl || owlMascot;
  const heroTitle = themeConfig?.loginHeroTitle ?? "Welcome back";

  const handleSlugGo = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = normalizeSlugInput(slugInput);
    const err = validateSubdomainSlug(slug);
    if (err) { setSlugError(err); return; }
    window.location.href = tenantHrefFor(slug, "/auth");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center p-8">
      <Card className="w-full max-w-md p-8 space-y-6 bg-white/80 backdrop-blur-xl border-white/40 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="text-center space-y-2">
          <img src={brandLogo} alt={brandName} className="w-16 h-16 mx-auto rounded-2xl object-contain" />
          <h1 className="text-2xl font-bold text-[color:var(--brand-midnight)]">{heroTitle}</h1>
          <p className="text-slate-500 text-sm">Sign in to continue to {brandName}</p>
        </div>

        <Form {...loginForm}>
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
            <FormField
              control={loginForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[color:var(--brand-midnight)] font-medium">Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="you@example.com"
                      type="email"
                      autoComplete="email"
                      className="rounded-full h-11 border-slate-200 focus-visible:ring-[color:var(--brand-primary)]"
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
                  <FormLabel className="text-[color:var(--brand-midnight)] font-medium">Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="pl-10 pr-10 rounded-full h-11 border-slate-200 focus-visible:ring-[color:var(--brand-primary)]"
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
              className="w-full rounded-full h-11 bg-[color:var(--brand-primary)] hover:opacity-90 text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            <div className="text-center">
              <Link to="/auth/reset-password" className="text-sm text-[color:var(--brand-primary)] hover:underline">
                Forgot your password?
              </Link>
            </div>
          </form>
        </Form>

        {isHQHost && (
          <div className="pt-2 border-t border-slate-100 space-y-3">
            {!showSlugForm ? (
              <button
                type="button"
                onClick={() => setShowSlugForm(true)}
                className="w-full text-xs text-slate-500 hover:text-[color:var(--brand-primary)]"
              >
                Know your centre code? Go directly to your workspace →
              </button>
            ) : (
              <form onSubmit={handleSlugGo} className="flex gap-2">
                <Input
                  value={slugInput}
                  onChange={(e) => { setSlugInput(e.target.value); setSlugError(null); }}
                  placeholder="e.g. srisarjana"
                  className="rounded-full h-10 border-slate-200 text-sm"
                />
                <Button type="submit" size="sm" className="rounded-full bg-[color:var(--brand-primary)] hover:opacity-90 text-white h-10 px-4">
                  Go
                </Button>
              </form>
            )}
            {slugError && <p className="text-xs text-rose-500">{slugError}</p>}
            {showSlugForm && (
              <p className="text-[11px] text-slate-400 text-center">
                You'll be redirected to your-slug.{ROOT_DOMAIN}
              </p>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            Access to {brandName} is by invitation only. Please contact your administrator for an invite link.
          </p>
        </div>
      </Card>
    </div>
  );
}
