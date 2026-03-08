import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PWAUpdatePrompt } from "@/components/pwa/PWAUpdatePrompt";
import { MaintenanceGate } from "@/components/admin/MaintenanceGate";

// Layouts (kept eager – small, used on every page)
import { MainLayout } from "@/components/layout/MainLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { TutorLayout } from "@/components/tutor/TutorLayout";
import { GuardianLayout } from "@/components/guardian/GuardianLayout";

// ── Lazy-loaded pages ────────────────────────────────────────────
// Public
const HomePage = lazy(() => import("@/pages/HomePage").then(m => ({ default: m.HomePage })));
const AuthPage = lazy(() => import("@/pages/AuthPage").then(m => ({ default: m.AuthPage })));
const TimetablePage = lazy(() => import("@/pages/TimetablePage").then(m => ({ default: m.TimetablePage })));
const ClassesPage = lazy(() => import("@/pages/ClassesPage").then(m => ({ default: m.ClassesPage })));
const InboxPage = lazy(() => import("@/pages/InboxPage").then(m => ({ default: m.InboxPage })));
const AccountPage = lazy(() => import("@/pages/AccountPage").then(m => ({ default: m.AccountPage })));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const NotFound = lazy(() => import("@/pages/NotFound"));
const MobileOnboarding = lazy(() => import("@/pages/MobileOnboarding").then(m => ({ default: m.MobileOnboarding })));

// Student Dashboard
const StudentDashboard = lazy(() => import("@/pages/dashboard/StudentDashboard").then(m => ({ default: m.StudentDashboard })));
const ReplayLibrary = lazy(() => import("@/pages/dashboard/ReplayLibrary").then(m => ({ default: m.ReplayLibrary })));
const QuizList = lazy(() => import("@/pages/dashboard/QuizList").then(m => ({ default: m.QuizList })));
const NotesBank = lazy(() => import("@/pages/dashboard/NotesBank").then(m => ({ default: m.NotesBank })));
const LearningHub = lazy(() => import("@/pages/dashboard/LearningHub").then(m => ({ default: m.LearningHub })));
const Achievements = lazy(() => import("@/pages/dashboard/Achievements").then(m => ({ default: m.Achievements })));
const FlashcardSwipeEngine = lazy(() => import("@/pages/dashboard/FlashcardSwipeEngine").then(m => ({ default: m.FlashcardSwipeEngine })));

// Quiz
const QuizPlay = lazy(() => import("@/pages/quiz/QuizPlay").then(m => ({ default: m.QuizPlay })));
const QuizLobby = lazy(() => import("@/pages/quiz/QuizLobby").then(m => ({ default: m.QuizLobby })));

// Tutor
const TutorDashboard = lazy(() => import("@/pages/tutor/TutorDashboard").then(m => ({ default: m.TutorDashboard })));
const TutorClasses = lazy(() => import("@/pages/tutor/TutorClasses").then(m => ({ default: m.TutorClasses })));
const TutorStudents = lazy(() => import("@/pages/tutor/TutorStudents").then(m => ({ default: m.TutorStudents })));
const TutorGrading = lazy(() => import("@/pages/tutor/TutorGrading").then(m => ({ default: m.TutorGrading })));
const TutorNotes = lazy(() => import("@/pages/tutor/TutorNotes").then(m => ({ default: m.TutorNotes })));
const TutorUpload = lazy(() => import("@/pages/tutor/TutorUpload").then(m => ({ default: m.TutorUpload })));
const TutorQuizBuilder = lazy(() => import("@/pages/tutor/TutorQuizBuilder").then(m => ({ default: m.TutorQuizBuilder })));
const TutorQuestions = lazy(() => import("@/pages/tutor/TutorQuestions").then(m => ({ default: m.TutorQuestions })));

// Guardian
const ParentOverview = lazy(() => import("@/pages/guardian/ParentOverview").then(m => ({ default: m.ParentOverview })));
const AcademicReports = lazy(() => import("@/pages/guardian/AcademicReports").then(m => ({ default: m.AcademicReports })));
const GuardianBilling = lazy(() => import("@/pages/guardian/GuardianBilling").then(m => ({ default: m.GuardianBilling })));
const ParentPulse = lazy(() => import("@/pages/guardian/ParentPulse").then(m => ({ default: m.ParentPulse })));

// Admin
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const ContentCMS = lazy(() => import("@/pages/admin/ContentCMS").then(m => ({ default: m.ContentCMS })));
const UsersManagement = lazy(() => import("@/pages/admin/UsersManagement").then(m => ({ default: m.UsersManagement })));
const ScheduleManager = lazy(() => import("@/pages/admin/ScheduleManager").then(m => ({ default: m.ScheduleManager })));
const AnalyticsDashboard = lazy(() => import("@/pages/admin/AnalyticsDashboard").then(m => ({ default: m.AnalyticsDashboard })));
const NotesManagement = lazy(() => import("@/pages/admin/NotesManagement").then(m => ({ default: m.NotesManagement })));
const PaymentVerification = lazy(() => import("@/pages/admin/PaymentVerification").then(m => ({ default: m.PaymentVerification })));
const LeadsManagement = lazy(() => import("@/pages/admin/LeadsManagement").then(m => ({ default: m.LeadsManagement })));
const GradingPage = lazy(() => import("@/pages/admin/GradingPage").then(m => ({ default: m.GradingPage })));
const QuizAnalytics = lazy(() => import("@/pages/admin/QuizAnalytics").then(m => ({ default: m.QuizAnalytics })));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings").then(m => ({ default: m.AdminSettings })));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAUpdatePrompt />
        <MaintenanceGate>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth Pages */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

            {/* Public/Student Pages with MainLayout */}
            <Route path="/" element={<MainLayout><HomePage /></MainLayout>} />
            <Route path="/timetable" element={<MainLayout><TimetablePage /></MainLayout>} />
            <Route path="/classes" element={<MainLayout><ClassesPage /></MainLayout>} />
            <Route path="/inbox" element={<ProtectedRoute requiredRole="authenticated"><MainLayout><InboxPage /></MainLayout></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute requiredRole="authenticated"><MainLayout><AccountPage /></MainLayout></ProtectedRoute>} />

            {/* Student Dashboard Routes */}
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><StudentDashboard /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/replays" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><ReplayLibrary /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/quizzes" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><QuizList /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/learning" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><LearningHub /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/learning/quizzes" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><LearningHub /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/learning/flashcards" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><LearningHub /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/notes" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><NotesBank /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/achievements" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><Achievements /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/learning/flashcards/play" element={<ProtectedRoute requiredRole="authenticated"><FlashcardSwipeEngine /></ProtectedRoute>} />

            {/* Quiz Routes */}
            <Route path="/quiz/:quizId/lobby" element={<ProtectedRoute requiredRole="authenticated"><DashboardLayout><QuizLobby /></DashboardLayout></ProtectedRoute>} />
            <Route path="/quiz/:quizId/play" element={<ProtectedRoute requiredRole="authenticated"><QuizPlay /></ProtectedRoute>} />
            <Route path="/quiz/:quizId" element={<ProtectedRoute requiredRole="authenticated"><QuizPlay /></ProtectedRoute>} />

            {/* Tutor Routes */}
            <Route path="/tutor" element={<ProtectedRoute tutorOnly><TutorLayout><TutorDashboard /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/classes" element={<ProtectedRoute tutorOnly><TutorLayout><TutorClasses /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/students" element={<ProtectedRoute tutorOnly><TutorLayout><TutorStudents /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/grading" element={<ProtectedRoute tutorOnly><TutorLayout><TutorGrading /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/notes" element={<ProtectedRoute tutorOnly><TutorLayout><TutorNotes /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/upload" element={<ProtectedRoute tutorOnly><TutorLayout><TutorUpload /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/quizzes/new" element={<ProtectedRoute tutorOnly><TutorLayout><TutorQuizBuilder /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/questions" element={<ProtectedRoute tutorOnly><TutorLayout><TutorQuestions /></TutorLayout></ProtectedRoute>} />
            <Route path="/tutor/quiz-analytics" element={<ProtectedRoute tutorOnly><TutorLayout><QuizAnalytics /></TutorLayout></ProtectedRoute>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/leads" element={<ProtectedRoute adminOnly><AdminLayout><LeadsManagement /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/content" element={<ProtectedRoute adminOnly><AdminLayout><ContentCMS /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminLayout><UsersManagement /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/schedule" element={<ProtectedRoute adminOnly><AdminLayout><ScheduleManager /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/notes" element={<ProtectedRoute adminOnly><AdminLayout><NotesManagement /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/payments" element={<ProtectedRoute adminOnly><AdminLayout><PaymentVerification /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute adminOnly><AdminLayout><AnalyticsDashboard /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/grading" element={<ProtectedRoute adminOnly><AdminLayout><GradingPage /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/quiz-analytics" element={<ProtectedRoute adminOnly><AdminLayout><QuizAnalytics /></AdminLayout></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute adminOnly><AdminLayout><AdminSettings /></AdminLayout></ProtectedRoute>} />

            {/* Guardian Routes */}
            <Route path="/guardian" element={<ProtectedRoute requiredRole="authenticated"><GuardianLayout><ParentOverview /></GuardianLayout></ProtectedRoute>} />
            <Route path="/guardian/reports" element={<ProtectedRoute requiredRole="authenticated"><GuardianLayout><AcademicReports /></GuardianLayout></ProtectedRoute>} />
            <Route path="/guardian/billing" element={<ProtectedRoute requiredRole="authenticated"><GuardianLayout><GuardianBilling /></GuardianLayout></ProtectedRoute>} />

            {/* Standalone Routes */}
            <Route path="/guardian-pulse" element={<ParentPulse />} />
            <Route path="/mobile-onboarding" element={<MobileOnboarding />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        </MaintenanceGate>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
