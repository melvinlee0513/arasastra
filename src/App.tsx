import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { StudentWorkspaceRoute } from "@/components/auth/StudentWorkspaceRoute";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import { AppUpdatePrompt } from "@/components/pwa/AppUpdatePrompt";
import { MaintenanceGate } from "@/components/admin/MaintenanceGate";
import { TenantProvider } from "@/contexts/TenantContext";
import { FeatureRoute } from "@/components/common/FeatureRoute";
import { ScrollRestoration } from "@/lib/scrollRestoration";
import { AppErrorBoundary } from "@/components/common/AppErrorBoundary";
// Every route is code-split. `lazyWithRetry` is React.lazy plus a one-shot
// reload when a chunk 404s, which is what a tab left open across a deploy sees.
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";


// Layouts (kept eager – small, used on every page)
import { MainLayout } from "@/components/layout/MainLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { TutorLayout } from "@/components/tutor/TutorLayout";
import { GuardianLayout } from "@/components/guardian/GuardianLayout";

// ── Lazy-loaded pages ────────────────────────────────────────────
// Public
const AuthPage = lazy(() => import("@/pages/AuthPage").then(m => ({ default: m.AuthPage })));
const TimetablePage = lazy(() => import("@/pages/TimetablePage").then(m => ({ default: m.TimetablePage })));
const ClassesPage = lazy(() => import("@/pages/ClassesPage").then(m => ({ default: m.ClassesPage })));
const InboxPage = lazy(() => import("@/pages/InboxPage").then(m => ({ default: m.InboxPage })));
const AccountPage = lazy(() => import("@/pages/AccountPage").then(m => ({ default: m.AccountPage })));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const NotFound = lazy(() => import("@/pages/NotFound"));
const MobileOnboarding = lazy(() => import("@/pages/MobileOnboarding").then(m => ({ default: m.MobileOnboarding })));
const TenantDashboard = lazy(() => import("@/pages/tenant/TenantDashboard").then(m => ({ default: m.TenantDashboard })));
const InvitePage = lazy(() => import("@/pages/InvitePage"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
import { TenantGuard } from "@/components/tenant/TenantGuard";
import { RootLanding } from "@/components/auth/RootLanding";
import { GuestRoute } from "@/components/guest/GuestRoute";
import { GuestMore } from "@/pages/guest/GuestMore";
import { GuestStudy } from "@/pages/guest/GuestStudy";
import { GuestProfile } from "@/pages/guest/GuestProfile";
import { SupportPage } from "@/pages/SupportPage";
import { PrivacyPolicyPage } from "@/pages/PrivacyPolicyPage";
import { SharedInfoShell } from "@/components/layout/SharedInfoShell";


// Student Dashboard
const StudentDashboard = lazy(() => import("@/pages/dashboard/StudentDashboard").then(m => ({ default: m.StudentDashboard })));
const ReplayLibrary = lazy(() => import("@/pages/dashboard/ReplayLibrary").then(m => ({ default: m.ReplayLibrary })));
const NotesBank = lazy(() => import("@/pages/dashboard/NotesBank").then(m => ({ default: m.NotesBank })));
const Achievements = lazy(() => import("@/pages/dashboard/Achievements").then(m => ({ default: m.Achievements })));
const MorePage = lazy(() => import("@/pages/dashboard/MorePage").then(m => ({ default: m.MorePage })));
const LeaderboardPage = lazy(() => import("@/pages/dashboard/LeaderboardPage").then(m => ({ default: m.LeaderboardPage })));
const MyClasses = lazy(() => import("@/pages/dashboard/MyClasses").then(m => ({ default: m.MyClasses })));
const StudentClassHome = lazy(() => import("@/pages/dashboard/class/StudentClassHome").then(m => ({ default: m.StudentClassHome })));
const StudentClassMaterials = lazy(() => import("@/pages/dashboard/class/StudentClassMaterials").then(m => ({ default: m.StudentClassMaterials })));
const StudentClassAnnouncements = lazy(() => import("@/pages/dashboard/class/StudentClassAnnouncements").then(m => ({ default: m.StudentClassAnnouncements })));
const ClassAboutPage = lazy(() => import("@/pages/class/ClassAboutPage").then(m => ({ default: m.ClassAboutPage })));
const StudentClassQuizzes = lazy(() => import("@/pages/dashboard/class/StudentClassQuizzes").then(m => ({ default: m.StudentClassQuizzes })));
const StudentQuizAttempt = lazy(() => import("@/pages/dashboard/class/StudentQuizAttempt").then(m => ({ default: m.StudentQuizAttempt })));
const StudentQuizResult = lazy(() => import("@/pages/dashboard/class/StudentQuizResult").then(m => ({ default: m.StudentQuizResult })));
const ResourceHub = lazy(() => import("@/pages/resources/ResourceHub"));
const QuizHub = lazy(() => import("@/pages/dashboard/quiz/QuizHub").then(m => ({ default: m.QuizHub })));
const QuizLibrary = lazy(() => import("@/pages/dashboard/quiz/QuizLibrary").then(m => ({ default: m.QuizLibrary })));

// Quiz — legacy /quiz/* URLs resolve into the canonical class quiz hub.
const LegacyQuizRedirect = lazy(() => import("@/pages/quiz/LegacyQuizRedirect").then(m => ({ default: m.LegacyQuizRedirect })));

// Tutor
const TutorDashboard = lazy(() => import("@/pages/tutor/TutorDashboard").then(m => ({ default: m.TutorDashboard })));
const TutorClasses = lazy(() => import("@/pages/tutor/TutorClasses").then(m => ({ default: m.TutorClasses })));
const TutorStudents = lazy(() => import("@/pages/tutor/TutorStudents").then(m => ({ default: m.TutorStudents })));
const TutorGrading = lazy(() => import("@/pages/tutor/TutorGrading").then(m => ({ default: m.TutorGrading })));
const TutorNotes = lazy(() => import("@/pages/tutor/TutorNotes").then(m => ({ default: m.TutorNotes })));
const TutorUpload = lazy(() => import("@/pages/tutor/TutorUpload").then(m => ({ default: m.TutorUpload })));
const ClassQuizzesManager = lazy(() => import("@/pages/class/ClassQuizzesManager").then(m => ({ default: m.ClassQuizzesManager })));
const ClassQuizBuilder = lazy(() => import("@/pages/class/ClassQuizBuilder").then(m => ({ default: m.ClassQuizBuilder })));
// Live multiplayer — gated behind the liveQuizMultiplayer flag (off by default).
const HostLiveQuizSetup = lazy(() => import("@/pages/class/HostLiveQuizSetup").then(m => ({ default: m.HostLiveQuizSetup })));
const LiveQuizHost = lazy(() => import("@/pages/quiz/LiveQuizHost").then(m => ({ default: m.LiveQuizHost })));
const LiveQuizJoin = lazy(() => import("@/pages/quiz/LiveQuizJoin").then(m => ({ default: m.LiveQuizJoin })));
const LiveQuizPlay = lazy(() => import("@/pages/quiz/LiveQuizPlay").then(m => ({ default: m.LiveQuizPlay })));
// Superadmin-only QA harness. Real RPCs + realtime, independent of the flag.
// Phase 4 — question bank (gated behind questionBank, off by default).
const QuestionBankHome = lazy(() => import("@/pages/bank/QuestionBankHome").then(m => ({ default: m.QuestionBankHome })));
const QuestionBankBrowse = lazy(() => import("@/pages/bank/QuestionBankBrowse").then(m => ({ default: m.QuestionBankBrowse })));
const QuestionBankDetail = lazy(() => import("@/pages/bank/QuestionBankDetail").then(m => ({ default: m.QuestionBankDetail })));
const QuestionBankEditor = lazy(() => import("@/pages/bank/QuestionBankEditor").then(m => ({ default: m.QuestionBankEditor })));

// Phase 3 — quiz analytics (gated behind quizAnalytics, off by default).
const QuizAnalyticsOverview = lazy(() => import("@/pages/class/QuizAnalyticsOverview").then(m => ({ default: m.QuizAnalyticsOverview })));
const QuizQuestionInsights = lazy(() => import("@/pages/class/QuizQuestionInsights").then(m => ({ default: m.QuizQuestionInsights })));
const QuizStudentAnalyticsPage = lazy(() => import("@/pages/class/QuizStudentAnalytics").then(m => ({ default: m.QuizStudentAnalytics })));
const QuizStudentReportPage = lazy(() => import("@/pages/class/QuizStudentReport").then(m => ({ default: m.QuizStudentReport })));

const LiveQuizHarness = lazy(() => import("@/pages/dev/LiveQuizHarness").then(m => ({ default: m.LiveQuizHarness })));
const ClassQuizResultsManager = lazy(() => import("@/pages/class/ClassQuizResultsManager").then(m => ({ default: m.ClassQuizResultsManager })));
const StudentClassFlashcards = lazy(() => import("@/pages/dashboard/class/StudentClassFlashcards").then(m => ({ default: m.StudentClassFlashcards })));
const StudentFlashcardStudy = lazy(() => import("@/pages/dashboard/class/StudentFlashcardStudy").then(m => ({ default: m.StudentFlashcardStudy })));
const ClassFlashcardsManager = lazy(() => import("@/pages/class/ClassFlashcardsManager").then(m => ({ default: m.ClassFlashcardsManager })));
const ClassFlashcardBuilder = lazy(() => import("@/pages/class/ClassFlashcardBuilder").then(m => ({ default: m.ClassFlashcardBuilder })));
const TutorQuestions = lazy(() => import("@/pages/tutor/TutorQuestions").then(m => ({ default: m.TutorQuestions })));
const TutorVideos = lazy(() => import("@/pages/tutor/TutorVideos").then(m => ({ default: m.TutorVideos })));
const TutorClassResources = lazy(() => import("@/pages/tutor/TutorClassResources"));
const TutorClassHome = lazy(() => import("@/pages/tutor/class/TutorClassHome").then(m => ({ default: m.TutorClassHome })));
const TutorClassAnnouncements = lazy(() => import("@/pages/tutor/class/TutorClassAnnouncements").then(m => ({ default: m.TutorClassAnnouncements })));
const TutorClassStudents = lazy(() => import("@/pages/tutor/class/TutorClassStudents").then(m => ({ default: m.TutorClassStudents })));
const TutorAccount = lazy(() => import("@/pages/tutor/TutorAccount").then(m => ({ default: m.TutorAccount })));
const ClassRoomPreview = lazy(() => import("@/pages/dashboard/ClassRoomPreview"));
const TutorClassRoomPreview = lazy(() => import("@/pages/tutor/TutorClassRoomPreview"));
const TutorQuizBuilderPreview = lazy(() => import("@/pages/preview/TutorQuizBuilderPreview"));
const StudentQuizAttemptPreview = lazy(() => import("@/pages/preview/StudentQuizAttemptPreview"));
const StudentQuizResultsPreview = lazy(() => import("@/pages/preview/StudentQuizResultsPreview"));
const EnrollmentMatrixPreview = lazy(() => import("@/pages/preview/EnrollmentMatrixPreview"));
const TenantConfigurationPreview = lazy(() => import("@/pages/preview/TenantConfigurationPreview"));
import { DevPreviewGuard } from "@/components/common/DevPreviewGuard";

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
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings").then(m => ({ default: m.AdminSettings })));
const CurriculumManager = lazy(() => import("@/pages/admin/CurriculumManager"));
const EnrollmentMatrix = lazy(() => import("@/pages/admin/EnrollmentMatrix"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

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
      <TenantProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <AppUpdatePrompt />
        <MaintenanceGate>
        <BrowserRouter>
          <ScrollRestoration />
          {/* Inside the router, so the reload button lands the user back where
              they were, and outside Suspense, so a chunk that fails on its
              SECOND attempt shows a message instead of a blank page. */}
          <AppErrorBoundary>
          <Suspense fallback={<PageLoader />}>

          <Routes>
            {/* Auth Pages */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/invite" element={<InvitePage />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

            {/* Public/Student Pages with MainLayout */}
            {/* Canonical app entry (also the PWA start_url) — role-aware. */}
            <Route path="/" element={<RootLanding />} />
            {/* Guest (signed-out) experience — authenticated users are redirected. */}
            <Route path="/more" element={<GuestRoute authenticatedTo="/dashboard/more"><GuestMore /></GuestRoute>} />
            <Route path="/study" element={<GuestRoute authenticatedTo="/dashboard/classes"><GuestStudy /></GuestRoute>} />
            <Route path="/profile" element={<GuestRoute authenticatedTo="/dashboard/profile"><GuestProfile /></GuestRoute>} />
            {/* Shared informational pages — one implementation for guests, students, tutors and admins. */}
            <Route path="/support" element={<SharedInfoShell><SupportPage /></SharedInfoShell>} />
            <Route path="/privacy" element={<SharedInfoShell><PrivacyPolicyPage /></SharedInfoShell>} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/student" element={<Navigate to="/dashboard" replace />} />

            <Route path="/timetable" element={<ProtectedRoute requiredRole="authenticated"><MainLayout><TimetablePage /></MainLayout></ProtectedRoute>} />
            <Route path="/classes" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/inbox" element={<ProtectedRoute requiredRole="authenticated"><MainLayout><InboxPage /></MainLayout></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute requiredRole="authenticated"><MainLayout><AccountPage /></MainLayout></ProtectedRoute>} />

            {/* Student Dashboard Routes */}
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="authenticated"><StudentWorkspaceRoute><TenantGuard><DashboardLayout><StudentDashboard /></DashboardLayout></TenantGuard></StudentWorkspaceRoute></ProtectedRoute>} />
            {/* Retired global "My Learning" hub — students now access
                learning materials inside their enrolled classes. All legacy
                URLs redirect to /dashboard/classes. */}
            <Route path="/dashboard/learning" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/dashboard/learning/notes" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/dashboard/learning/quizzes" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/dashboard/learning/flashcards" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/dashboard/learning/replays" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/dashboard/learning/flashcards/play" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/dashboard/notes" element={<Navigate to="/dashboard/classes" replace />} />
            {/* Cross-class student quiz hub + library */}
            <Route path="/dashboard/quizzes" element={<ProtectedRoute requiredRole="authenticated"><StudentWorkspaceRoute><TenantGuard><DashboardLayout><QuizHub /></DashboardLayout></TenantGuard></StudentWorkspaceRoute></ProtectedRoute>} />
            <Route path="/dashboard/quizzes/library" element={<ProtectedRoute requiredRole="authenticated"><StudentWorkspaceRoute><TenantGuard><DashboardLayout><QuizLibrary /></DashboardLayout></TenantGuard></StudentWorkspaceRoute></ProtectedRoute>} />
            <Route path="/dashboard/flashcards" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/dashboard/replays" element={<Navigate to="/dashboard/classes" replace />} />

            {/* Student "More" hub + root-level services reached from it */}
            <Route path="/dashboard/more" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><MorePage /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/leaderboard" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><FeatureRoute flag="leaderboards" label="Leaderboard"><DashboardLayout><LeaderboardPage /></DashboardLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/profile" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><AccountPage /></DashboardLayout></TenantGuard></ProtectedRoute>} />

            <Route path="/dashboard/resources" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><ResourceHub /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/achievements" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><Achievements /></DashboardLayout></TenantGuard></ProtectedRoute>} />


            {/* Legacy quiz URLs — resolved to the class quiz hub */}
            <Route path="/quiz/:quizId/lobby" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LegacyQuizRedirect /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/quiz/:quizId/play" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LegacyQuizRedirect /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><MyClasses /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><StudentClassHome /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/materials" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><StudentClassMaterials /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/announcements" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><StudentClassAnnouncements /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/about" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><ClassAboutPage variant="student" /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/flashcards" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><DashboardLayout><StudentClassFlashcards /></DashboardLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/flashcards/:deckId/study" element={<ProtectedRoute requiredRole="authenticated"><StudentWorkspaceRoute><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><StudentFlashcardStudy /></FeatureRoute></TenantGuard></StudentWorkspaceRoute></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/quizzes" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><StudentClassQuizzes /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/quizzes/:quizId/attempt/:attemptId" element={<ProtectedRoute requiredRole="authenticated"><StudentWorkspaceRoute><TenantGuard><StudentQuizAttempt /></TenantGuard></StudentWorkspaceRoute></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/quizzes/:quizId/results/:attemptId" element={<ProtectedRoute requiredRole="authenticated"><StudentWorkspaceRoute><TenantGuard><StudentQuizResult /></TenantGuard></StudentWorkspaceRoute></ProtectedRoute>} />

            {/* Live multiplayer — student. Off until liveQuizMultiplayer is enabled. */}
            {/* Superadmin-only live QA harness. Deliberately NOT behind
                liveQuizMultiplayer so the backend can be driven from real
                browser sessions before the flag is enabled. */}
            <Route path="/dev/live-quiz" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><LiveQuizHarness /></DevPreviewGuard></ProtectedRoute>} />

            <Route path="/dashboard/quiz/join" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><FeatureRoute flag="liveQuizMultiplayer" label="Live quiz"><LiveQuizJoin /></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/quiz/live/:sessionId" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><FeatureRoute flag="liveQuizMultiplayer" label="Live quiz"><LiveQuizPlay /></FeatureRoute></TenantGuard></ProtectedRoute>} />


            {/* UI-only previews — superadmin-gated, never linked from production nav. Isolated mock data, no backend calls. */}
            <Route path="/dashboard/classes/:classId/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><ClassRoomPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TutorClassRoomPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/new/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TutorQuizBuilderPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/edit/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TutorQuizBuilderPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/quizzes/:quizId/attempt/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><StudentQuizAttemptPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/quizzes/:quizId/results/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><StudentQuizResultsPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/admin/enrollment-matrix/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><EnrollmentMatrixPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/superadmin/tenants/:centerId/configuration/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TenantConfigurationPreview /></DevPreviewGuard></ProtectedRoute>} />

            {/* Legacy quiz entry point */}
            <Route path="/quiz/:quizId" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LegacyQuizRedirect /></DashboardLayout></TenantGuard></ProtectedRoute>} />

            {/* Tutor Routes */}
            <Route path="/tutor" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorDashboard /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClasses /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClassHome /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/about" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><ClassAboutPage variant="tutor" /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/announcements" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClassAnnouncements /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/resources" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClassResources /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/students" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClassStudents /></TutorLayout></TenantGuard></ProtectedRoute>} />
            {/* Admin Class Hub — mirrors the tutor hub for same-centre admins */}
            <Route path="/admin/classes/:classId" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorClassHome /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/about" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ClassAboutPage variant="tutor" /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/announcements" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorClassAnnouncements /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/materials" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorClassResources /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/resources" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorClassResources /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/students" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorClassStudents /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ClassQuizzesManager variant="admin" /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/new" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ClassQuizBuilder variant="admin" /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/:quizId/edit" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ClassQuizBuilder variant="admin" /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/:quizId/results" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ClassQuizResultsManager variant="admin" /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/:quizId/analytics" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><AdminLayout><QuizAnalyticsOverview variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/:quizId/analytics/questions" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><AdminLayout><QuizQuestionInsights variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/:quizId/analytics/students" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><AdminLayout><QuizStudentAnalyticsPage variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/:quizId/analytics/students/:userId" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><AdminLayout><QuizStudentReportPage variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/question-bank" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><AdminLayout><QuestionBankHome variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/question-bank/questions" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><AdminLayout><QuestionBankBrowse variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/question-bank/questions/new" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><AdminLayout><QuestionBankEditor variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/question-bank/questions/:questionId" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><AdminLayout><QuestionBankDetail variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/question-bank/questions/:questionId/edit" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><AdminLayout><QuestionBankEditor variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/question-bank/collections/:collectionId" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><AdminLayout><QuestionBankBrowse variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/live/new" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="liveQuizMultiplayer" label="Live quiz"><AdminLayout><HostLiveQuizSetup variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/live/:sessionId" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="liveQuizMultiplayer" label="Live quiz"><LiveQuizHost variant="admin" /></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/quizzes/:quizId/results/:attemptId" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ClassQuizResultsManager variant="admin" /></AdminLayout></TenantGuard></ProtectedRoute>} />
            {/* Class flashcards (Phase 3B1) — tenant `flashcards` flag gated; server enforces role/tenant */}
            <Route path="/admin/classes/:classId/flashcards" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><AdminLayout><ClassFlashcardsManager variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/flashcards/new" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><AdminLayout><ClassFlashcardBuilder variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/flashcards/:deckId/edit" element={<ProtectedRoute adminOnly><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><AdminLayout><ClassFlashcardBuilder variant="admin" /></AdminLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/flashcards" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><TutorLayout><ClassFlashcardsManager variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/flashcards/new" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><TutorLayout><ClassFlashcardBuilder variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/flashcards/:deckId/edit" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="flashcards" label="Flashcards"><TutorLayout><ClassFlashcardBuilder variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/students" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorStudents /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/grading" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorGrading /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/notes" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorNotes /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/upload" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorUpload /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/videos" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorVideos /></TutorLayout></TenantGuard></ProtectedRoute>} />
            {/* Legacy tutor quiz builder → redirect to tutor classes list; real builder ships in B2b under /tutor/classes/:classId/quizzes/... */}
            <Route path="/tutor/quizzes/new" element={<Navigate to="/tutor/classes" replace />} />
            <Route path="/tutor/classes/:classId/quizzes" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><ClassQuizzesManager variant="tutor" /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/new" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><ClassQuizBuilder variant="tutor" /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/edit" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><ClassQuizBuilder variant="tutor" /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/results" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><ClassQuizResultsManager variant="tutor" /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/live/new" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="liveQuizMultiplayer" label="Live quiz"><TutorLayout><HostLiveQuizSetup variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/live/:sessionId" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="liveQuizMultiplayer" label="Live quiz"><LiveQuizHost variant="tutor" /></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/results/:attemptId" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><ClassQuizResultsManager variant="tutor" /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/analytics" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><TutorLayout><QuizAnalyticsOverview variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/analytics/questions" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><TutorLayout><QuizQuestionInsights variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/analytics/students" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><TutorLayout><QuizStudentAnalyticsPage variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/analytics/students/:userId" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="quizAnalytics" label="Quiz analytics"><TutorLayout><QuizStudentReportPage variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/question-bank" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><TutorLayout><QuestionBankHome variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/question-bank/questions" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><TutorLayout><QuestionBankBrowse variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/question-bank/questions/new" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><TutorLayout><QuestionBankEditor variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/question-bank/questions/:questionId" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><TutorLayout><QuestionBankDetail variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/question-bank/questions/:questionId/edit" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><TutorLayout><QuestionBankEditor variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/question-bank/collections/:collectionId" element={<ProtectedRoute tutorOnly><TenantGuard><FeatureRoute flag="questionBank" label="Question bank"><TutorLayout><QuestionBankBrowse variant="tutor" /></TutorLayout></FeatureRoute></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/questions" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorQuestions /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/account" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorAccount /></TutorLayout></TenantGuard></ProtectedRoute>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><AdminDashboard /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/leads" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><LeadsManagement /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/content" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ContentCMS /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><UsersManagement /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/schedule" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><ScheduleManager /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/notes" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><NotesManagement /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/payments" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><PaymentVerification /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><AnalyticsDashboard /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/grading" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><GradingPage /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><AdminSettings /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/videos" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorVideos /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/curriculum" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><CurriculumManager /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/enrollment-matrix" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><EnrollmentMatrix /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/curriculum" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><CurriculumManager /></AdminLayout></TenantGuard></ProtectedRoute>} />


            {/* Guardian Routes */}
            <Route path="/guardian" element={<ProtectedRoute requiredRole="authenticated"><GuardianLayout><ParentOverview /></GuardianLayout></ProtectedRoute>} />
            <Route path="/guardian/reports" element={<ProtectedRoute requiredRole="authenticated"><GuardianLayout><AcademicReports /></GuardianLayout></ProtectedRoute>} />
            <Route path="/guardian/billing" element={<ProtectedRoute requiredRole="authenticated"><GuardianLayout><GuardianBilling /></GuardianLayout></ProtectedRoute>} />

            {/* Standalone Routes */}
            <Route path="/guardian-pulse" element={<ParentPulse />} />
            <Route path="/mobile-onboarding" element={<MobileOnboarding />} />
            <Route path="/center" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><TenantDashboard /></TenantGuard></ProtectedRoute>} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </AppErrorBoundary>
        </BrowserRouter>
        </MaintenanceGate>
      </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
