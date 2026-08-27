import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        home: {
          updates: "hsl(var(--home-updates))",
          "updates-accent": "hsl(var(--home-updates-accent))",
          learning: "hsl(var(--home-learning))",
          "learning-accent": "hsl(var(--home-learning-accent))",
          schedule: "hsl(var(--home-schedule))",
          "schedule-accent": "hsl(var(--home-schedule-accent))",
          ranking: "hsl(var(--home-ranking))",
          "ranking-accent": "hsl(var(--home-ranking-accent))",
        },
        more: {
          timetable: "hsl(var(--more-timetable))",
          "timetable-accent": "hsl(var(--more-timetable-accent))",
          inbox: "hsl(var(--more-inbox))",
          "inbox-accent": "hsl(var(--more-inbox-accent))",
          achievements: "hsl(var(--more-achievements))",
          "achievements-accent": "hsl(var(--more-achievements-accent))",
          leaderboard: "hsl(var(--more-leaderboard))",
          "leaderboard-accent": "hsl(var(--more-leaderboard-accent))",
        },
        hub: {
          accent: "hsl(var(--hub-accent))",
          tint: "hsl(var(--hub-tint))",
          "tint-strong": "hsl(var(--hub-tint-strong))",
          purple: "hsl(var(--hub-purple))",
          "purple-tint": "hsl(var(--hub-purple-tint))",
        },
        quiz: {
          accent: "hsl(var(--quiz-accent))",
          "accent-strong": "hsl(var(--quiz-accent-strong))",
          tint: "hsl(var(--quiz-tint))",
          "tint-strong": "hsl(var(--quiz-tint-strong))",
          xp: "hsl(var(--quiz-xp))",
          streak: "hsl(var(--quiz-streak))",
          correct: "hsl(var(--quiz-correct))",
          wrong: "hsl(var(--quiz-wrong))",
          arena: "hsl(var(--quiz-arena))",
          "arena-deep": "hsl(var(--quiz-arena-deep))",
          "arena-panel": "hsl(var(--quiz-arena-panel))",
          "arena-foreground": "hsl(var(--quiz-arena-foreground))",
          "arena-muted": "hsl(var(--quiz-arena-muted))",
        },

        podium: {
          DEFAULT: "hsl(var(--podium-surface))",
          border: "hsl(var(--podium-border))",
        },
        medal: {
          gold: "hsl(var(--medal-gold))",
          "gold-soft": "hsl(var(--medal-gold-soft))",
          silver: "hsl(var(--medal-silver))",
          "silver-soft": "hsl(var(--medal-silver-soft))",
          bronze: "hsl(var(--medal-bronze))",
          "bronze-soft": "hsl(var(--medal-bronze-soft))",
        },
        subject: {
          blue: "hsl(var(--subject-blue))",
          "blue-accent": "hsl(var(--subject-blue-accent))",
          violet: "hsl(var(--subject-violet))",
          "violet-accent": "hsl(var(--subject-violet-accent))",
          amber: "hsl(var(--subject-amber))",
          "amber-accent": "hsl(var(--subject-amber-accent))",
          green: "hsl(var(--subject-green))",
          "green-accent": "hsl(var(--subject-green-accent))",
          cyan: "hsl(var(--subject-cyan))",
          "cyan-accent": "hsl(var(--subject-cyan-accent))",
          slate: "hsl(var(--subject-slate))",
          "slate-accent": "hsl(var(--subject-slate-accent))",
        },



        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Custom owl-inspired colors
        gold: {
          DEFAULT: "hsl(var(--gold))",
          light: "hsl(var(--gold-light))",
        },
        brown: {
          DEFAULT: "hsl(var(--brown))",
          light: "hsl(var(--brown-light))",
        },
        navy: {
          DEFAULT: "hsl(var(--navy))",
          light: "hsl(var(--navy-light))",
        },
        cream: {
          DEFAULT: "hsl(var(--cream))",
          dark: "hsl(var(--cream-dark))",
        },
      },
      borderRadius: {
        "2xl": "calc(var(--radius) + 8px)",
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 8px hsl(43 90% 55% / 0.4), 0 0 16px hsl(43 90% 55% / 0.2)",
          },
          "50%": {
            boxShadow: "0 0 16px hsl(43 90% 55% / 0.6), 0 0 32px hsl(43 90% 55% / 0.3)",
          },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Quiz question transition animations
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(60px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-bottom": {
          from: { opacity: "0", transform: "translateY(40px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "zoom-in": {
          from: { opacity: "0", transform: "scale(0.85)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "zoom-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.85)" },
        },
        "flip-in": {
          from: { opacity: "0", transform: "rotateX(-15deg) translateY(10px)" },
          to: { opacity: "1", transform: "rotateX(0deg) translateY(0)" },
        },
        "fade-scale-in": {
          from: { opacity: "0", transform: "scale(0.92) translateY(8px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "rotate-in": {
          from: { opacity: "0", transform: "rotate(-3deg) scale(0.95)" },
          to: { opacity: "1", transform: "rotate(0) scale(1)" },
        },
        // Streak flame animations
        "streak-flame-spark": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
        "streak-flame-warm": {
          "0%, 100%": { transform: "scale(1) rotate(0deg)" },
          "25%": { transform: "scale(1.08) rotate(-2deg)" },
          "75%": { transform: "scale(1.08) rotate(2deg)" },
        },
        "streak-flame-hot": {
          "0%, 100%": { transform: "scale(1) rotate(0deg)" },
          "25%": { transform: "scale(1.12) rotate(-3deg)" },
          "50%": { transform: "scale(1.05) rotate(1deg)" },
          "75%": { transform: "scale(1.12) rotate(3deg)" },
        },
        "streak-flame-legendary": {
          "0%, 100%": { transform: "scale(1) rotate(0deg)" },
          "15%": { transform: "scale(1.15) rotate(-4deg)" },
          "30%": { transform: "scale(1.08) rotate(2deg)" },
          "45%": { transform: "scale(1.18) rotate(-2deg)" },
          "60%": { transform: "scale(1.1) rotate(3deg)" },
          "80%": { transform: "scale(1.15) rotate(-3deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-up": "fade-up 0.4s ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
        "slide-in-right": "slide-in-right 0.4s ease-out forwards",
        "slide-in-bottom": "slide-in-bottom 0.4s ease-out forwards",
        "zoom-in": "zoom-in 0.35s ease-out forwards",
        "flip-in": "flip-in 0.4s ease-out forwards",
        "fade-scale-in": "fade-scale-in 0.35s ease-out forwards",
        "rotate-in": "rotate-in 0.4s ease-out forwards",
        "streak-flame-spark": "streak-flame-spark 2s ease-in-out infinite",
        "streak-flame-warm": "streak-flame-warm 1.5s ease-in-out infinite",
        "streak-flame-hot": "streak-flame-hot 1.2s ease-in-out infinite",
        "streak-flame-legendary": "streak-flame-legendary 0.8s ease-in-out infinite",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
