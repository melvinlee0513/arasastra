import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Moon, Sun, Bell, BellOff, ChevronRight, LogOut, Crown, Calendar, Settings, HelpCircle, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { usePaymentSubmissions } from "@/hooks/usePaymentSubmissions";
import { useToast } from "@/hooks/use-toast";
import { PaymentStatusTracker } from "@/components/subscription/PaymentStatusTracker";
import { SubscriptionRenewalCard } from "@/components/subscription/SubscriptionRenewalCard";
import { PricingSection } from "@/components/account/PricingSection";
import { EnrollmentForm } from "@/components/account/EnrollmentForm";
import { OnboardingTour } from "@/components/account/OnboardingTour";

export function AccountPage() {
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const { subscription, isLoading: subLoading, isActive, isExpired, getDaysRemaining, refetch: refetchSubscription } = useSubscription();
  const { latestPending, refetch: refetchPayments } = usePaymentSubmissions();
  const { toast } = useToast();

  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains("dark"));
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [classReminders, setClassReminders] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<{ id: string; name: string; price: string; interval: string } | null>(null);
  const enrollmentRef = useRef<HTMLDivElement>(null);
  const paymentRef = useRef<HTMLDivElement>(null);

  // Progressive onboarding state
  const isRegistered = (profile as any)?.is_registered === true;
  const [showPaymentSection, setShowPaymentSection] = useState(isRegistered);
  const [autoFillAmount, setAutoFillAmount] = useState<string | null>(null);
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);
  const [showPaymentTour, setShowPaymentTour] = useState(false);

  // Sync showPaymentSection when profile loads
  useEffect(() => {
    if (profile) {
      const registered = (profile as any)?.is_registered === true;
      setShowPaymentSection(registered);
      // Trigger onboarding tour for new unregistered users
      if (!registered && user) {
        const dismissed = sessionStorage.getItem("onboarding-tour-dismissed");
        if (!dismissed) {
          setTimeout(() => setShowOnboardingTour(true), 800);
        }
      }
    }
  }, [profile, user]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle("dark");
  };

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out", description: "You have been successfully signed out." });
    navigate("/");
  };

  const handlePaymentSuccess = () => {
    refetchPayments();
    refetchSubscription();
  };

  const handleEnrollmentComplete = (planPrice: string | null) => {
    // Extract numeric amount from price string like "RM149"
    if (planPrice) {
      const numericPrice = planPrice.replace(/[^0-9.]/g, "");
      setAutoFillAmount(numericPrice ? `${numericPrice}.00` : "99.00");
    }
    setShowPaymentSection(true);

    // Scroll to payment section after a brief delay for the fade-in
    setTimeout(() => {
      paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);

    // Trigger payment tour after section reveals
    setTimeout(() => {
      const dismissed = sessionStorage.getItem("payment-tour-dismissed");
      if (!dismissed) {
        setShowPaymentTour(true);
      }
    }, 1200);
  };

  const isLoading = authLoading || subLoading;

  const getPaymentStatus = (): "submitted" | "verifying" | "activated" => {
    if (isActive) return "activated";
    if (latestPending) return "verifying";
    return "submitted";
  };

  // Onboarding tour steps (Part 1)
  const onboardingSteps = [
    {
      targetId: "pricing-section",
      title: "Choose Your Plan 📋",
      description: "First, choose the plan that suits your goals. Each plan unlocks different subjects and features.",
      buttonText: "Next",
    },
    {
      targetId: "enrollment-form",
      title: "Complete Registration ✍️",
      description: "Then, fill in your details to create your student profile. This only takes a minute!",
      buttonText: "Got it!",
    },
  ];

  // Payment tour steps (Part 2)
  const paymentSteps = [
    {
      targetId: "bank-details-section",
      title: "Transfer the Fee 🏦",
      description: "Transfer the fee to this bank account. Copy the account number for easy pasting.",
      buttonText: "Next",
    },
    {
      targetId: "receipt-upload-section",
      title: "Upload Your Receipt 📤",
      description: "Finally, upload your receipt here to unlock your classes! Verification takes up to 24 hours.",
      buttonText: "Let's go!",
    },
  ];

  // Guest View
  if (!user && !authLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
        <Card className="p-8 text-center bg-card border border-border">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
            <UserPlus className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Limited Access</h1>
          <p className="text-muted-foreground mb-6">
            Sign in to view your profile, manage your subscription, and track your learning progress.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth"><Button variant="gold" size="lg">Sign In</Button></Link>
            <Link to="/auth"><Button variant="outline" size="lg">Create Account</Button></Link>
          </div>
        </Card>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5" /> Settings
          </h2>
          <Card className="bg-card border border-border divide-y divide-border">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isDarkMode ? <Moon className="w-5 h-5 text-accent" /> : <Sun className="w-5 h-5 text-accent" />}
                <div>
                  <p className="font-medium text-foreground">Dark Mode</p>
                  <p className="text-sm text-muted-foreground">{isDarkMode ? "Dark theme active" : "Light theme active"}</p>
                </div>
              </div>
              <Switch checked={isDarkMode} onCheckedChange={toggleTheme} />
            </div>
          </Card>
        </section>
        <p className="text-center text-xs text-muted-foreground">Arasa A+ v1.0.0</p>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
        <Card className="p-6 bg-card border border-border">
          <div className="flex items-center gap-4">
            <Skeleton className="w-20 h-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-28" /></div>
            </div>
          </div>
        </Card>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Student";
  const memberSince = profile?.created_at ? format(new Date(profile.created_at), "MMMM yyyy") : "Recently";
  const showRenewalCard = !isActive || isExpired || subscription?.status === "inactive";
  const showStatusTracker = latestPending && !isActive;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      {/* Onboarding Tour (Part 1) */}
      <OnboardingTour
        steps={onboardingSteps}
        isActive={showOnboardingTour}
        onComplete={() => {
          setShowOnboardingTour(false);
          sessionStorage.setItem("onboarding-tour-dismissed", "true");
        }}
      />

      {/* Payment Tour (Part 2) */}
      <OnboardingTour
        steps={paymentSteps}
        isActive={showPaymentTour}
        onComplete={() => {
          setShowPaymentTour(false);
          sessionStorage.setItem("payment-tour-dismissed", "true");
        }}
      />

      {/* Payment Status Tracker */}
      {showPaymentSection && showStatusTracker && (
        <PaymentStatusTracker status={getPaymentStatus()} />
      )}

      {/* Profile Header */}
      <Card className="p-6 bg-card border border-border">
        <div className="flex items-center gap-4">
          <Avatar className="w-20 h-20 border-4 border-accent/20">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-accent text-accent-foreground text-2xl font-bold">
              {displayName.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
            <p className="text-muted-foreground">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {profile?.form_year && <Badge variant="secondary">{profile.form_year}</Badge>}
              <Badge variant="outline" className="text-xs">Member since {memberSince}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* === STEP 1: Pricing & Registration (shown when NOT registered) === */}
      {!isRegistered && (
        <>
          <div id="pricing-section">
            <PricingSection
              selectedPlanId={selectedPlan?.id ?? null}
              onSelectPlan={(plan) => {
                setSelectedPlan({ id: plan.id, name: plan.name, price: plan.price, interval: plan.interval });
                setTimeout(() => enrollmentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              }}
            />
          </div>

          <EnrollmentForm
            ref={enrollmentRef}
            selectedPlanName={selectedPlan?.name ?? null}
            selectedPlanPrice={selectedPlan?.price ?? null}
            selectedPlanInterval={selectedPlan?.interval ?? null}
            userName={displayName}
            userEmail={user?.email}
            userFormYear={profile?.form_year}
            onEnrollmentComplete={handleEnrollmentComplete}
          />
        </>
      )}

      {/* === STEP 2: Subscription & Payment (shown when registered OR after enrollment) === */}
      {showPaymentSection && (
        <div ref={paymentRef} className="space-y-6 animate-fade-in">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Crown className="w-5 h-5 text-accent" /> Subscription
            </h2>

            {/* Current Subscription Status */}
            <Card className="p-5 bg-gradient-to-br from-navy to-navy-light border-0">
              <div className="flex items-start justify-between">
                <div>
                  <Badge className={`mb-3 ${isActive ? "bg-accent text-accent-foreground" : isExpired ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    {subscription?.plan_name || "Free Tier"}
                  </Badge>
                  <div className="space-y-1">
                    {subscription?.status === "active" && subscription.expires_at && (
                      <>
                        <div className="flex items-center gap-2 text-primary-foreground/80">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">Expires: {format(new Date(subscription.expires_at), "MMMM d, yyyy")}</span>
                        </div>
                        <p className="text-primary-foreground font-medium">{getDaysRemaining()} days remaining</p>
                      </>
                    )}
                    {subscription?.status === "inactive" && !latestPending && (
                      <p className="text-primary-foreground/80 text-sm">Upgrade to access premium features</p>
                    )}
                    {subscription?.status === "expired" && (
                      <p className="text-primary-foreground/80 text-sm">Your subscription has expired</p>
                    )}
                    {latestPending && (
                      <p className="text-primary-foreground/80 text-sm">🕐 Payment verification pending...</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Renewal Card */}
            {showRenewalCard && !latestPending && (
              <SubscriptionRenewalCard
                onSuccess={handlePaymentSuccess}
                autoFillAmount={autoFillAmount}
              />
            )}

            {/* Pending Message */}
            {latestPending && (
              <Card className="p-5 bg-accent/10 border-accent/20">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <Crown className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">Receipt Uploaded!</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Our team is verifying your payment. This usually takes up to 24 hours. We'll notify you once your subscription is activated!
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </section>
        </div>
      )}

      {/* Already registered: show pricing for plan changes */}
      {isRegistered && (
        <PricingSection
          selectedPlanId={selectedPlan?.id ?? null}
          onSelectPlan={(plan) => {
            setSelectedPlan({ id: plan.id, name: plan.name, price: plan.price, interval: plan.interval });
          }}
        />
      )}

      {/* Settings */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" /> Settings
        </h2>
        <Card className="bg-card border border-border divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDarkMode ? <Moon className="w-5 h-5 text-accent" /> : <Sun className="w-5 h-5 text-accent" />}
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">{isDarkMode ? "Dark theme active" : "Light theme active"}</p>
              </div>
            </div>
            <Switch checked={isDarkMode} onCheckedChange={toggleTheme} />
          </div>
          <Separator />
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {notificationsEnabled ? <Bell className="w-5 h-5 text-accent" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
              <div>
                <p className="font-medium text-foreground">Push Notifications</p>
                <p className="text-sm text-muted-foreground">Receive app notifications</p>
              </div>
            </div>
            <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
          </div>
          <Separator />
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-accent" />
              <div>
                <p className="font-medium text-foreground">Class Reminders</p>
                <p className="text-sm text-muted-foreground">Get reminded before classes</p>
              </div>
            </div>
            <Switch checked={classReminders} onCheckedChange={setClassReminders} />
          </div>
        </Card>
      </section>

      {/* Quick Links */}
      <section className="space-y-3">
        <Card className="bg-card border border-border divide-y divide-border">
          <button className="w-full p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-foreground">Help & Support</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
          <Separator />
          <button onClick={handleSignOut} className="w-full p-4 flex items-center justify-between hover:bg-destructive/5 transition-colors text-destructive">
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </div>
            <ChevronRight className="w-5 h-5" />
          </button>
        </Card>
      </section>

      <p className="text-center text-xs text-muted-foreground">Arasa A+ v1.0.0</p>
    </div>
  );
}
