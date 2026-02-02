import { useState } from "react";
import { Moon, Sun, Bell, BellOff, ChevronRight, LogOut, Crown, Calendar, Settings, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { RenewalModal } from "@/components/modals/RenewalModal";

const userProfile = {
  name: "Ahmad Ibrahim",
  email: "ahmad@student.edu.my",
  level: "Form 4",
  avatar: "",
  memberSince: "September 2025",
};

const subscription = {
  plan: "Monthly Premium",
  expiryDate: "February 25, 2026",
  daysRemaining: 31,
  isActive: true,
};

export function AccountPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [classReminders, setClassReminders] = useState(true);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      {/* Profile Header */}
      <Card className="p-6 bg-card border border-border">
        <div className="flex items-center gap-4">
          <Avatar className="w-20 h-20 border-4 border-accent/20">
            <AvatarImage src={userProfile.avatar} />
            <AvatarFallback className="bg-accent text-accent-foreground text-2xl font-bold">
              {userProfile.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{userProfile.name}</h1>
            <p className="text-muted-foreground">{userProfile.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{userProfile.level}</Badge>
              <Badge variant="outline" className="text-xs">
                Member since {userProfile.memberSince}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Subscription */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Crown className="w-5 h-5 text-accent" />
          Subscription
        </h2>
        <Card className="p-5 bg-gradient-to-br from-navy to-navy-light border-0">
          <div className="flex items-start justify-between">
            <div>
              <Badge className="bg-accent text-accent-foreground mb-3">
                {subscription.plan}
              </Badge>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary-foreground/80">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">Expires: {subscription.expiryDate}</span>
                </div>
                <p className="text-primary-foreground font-medium">
                  {subscription.daysRemaining} days remaining
                </p>
              </div>
            </div>
            <RenewalModal>
              <Button variant="gold" size="sm">
                Renew
              </Button>
            </RenewalModal>
          </div>
        </Card>
      </section>

      {/* Settings */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Settings
        </h2>
        <Card className="bg-card border border-border divide-y divide-border">
          {/* Theme Toggle */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDarkMode ? (
                <Moon className="w-5 h-5 text-accent" />
              ) : (
                <Sun className="w-5 h-5 text-accent" />
              )}
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">
                  {isDarkMode ? "Dark theme active" : "Light theme active"}
                </p>
              </div>
            </div>
            <Switch checked={isDarkMode} onCheckedChange={toggleTheme} />
          </div>

          <Separator />

          {/* Notifications */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {notificationsEnabled ? (
                <Bell className="w-5 h-5 text-accent" />
              ) : (
                <BellOff className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-foreground">Push Notifications</p>
                <p className="text-sm text-muted-foreground">Receive app notifications</p>
              </div>
            </div>
            <Switch 
              checked={notificationsEnabled} 
              onCheckedChange={setNotificationsEnabled} 
            />
          </div>

          <Separator />

          {/* Class Reminders */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-accent" />
              <div>
                <p className="font-medium text-foreground">Class Reminders</p>
                <p className="text-sm text-muted-foreground">Get reminded before classes</p>
              </div>
            </div>
            <Switch 
              checked={classReminders} 
              onCheckedChange={setClassReminders} 
            />
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

          <button className="w-full p-4 flex items-center justify-between hover:bg-destructive/5 transition-colors text-destructive">
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </div>
            <ChevronRight className="w-5 h-5" />
          </button>
        </Card>
      </section>

      {/* Version */}
      <p className="text-center text-xs text-muted-foreground">
        Arasa A+ LMS v2.0.0 • © 2026 Arasa A+ Education Group
      </p>
    </div>
  );
}