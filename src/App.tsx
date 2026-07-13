import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import { AppUpdatePrompt } from "@/components/pwa/AppUpdatePrompt";
import { MaintenanceGate } from "@/components/admin/MaintenanceGate";
import { TenantProvider } from "@/contexts/TenantContext";

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
const TenantDashboard = lazy(() => import("@/pages/tenant/TenantDashboard").then(m => ({ default: m.TenantDashboard })));
const InvitePage = lazy(() => import("@/pages/InvitePage"));
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
import { TenantGuard } from "@/components/tenant/TenantGuard";

// Student Dashboard
const StudentDashboard = lazy(() => import("@/pages/dashboard/StudentDashboard").then(m => ({ default: m.StudentDashboard })));
const ReplayLibrary = lazy(() => import("@/pages/dashboard/ReplayLibrary").then(m => ({ default: m.ReplayLibrary })));
const QuizList = lazy(() => import("@/pages/dashboard/QuizList").then(m => ({ default: m.QuizList })));
const NotesBank = lazy(() => import("@/pages/dashboard/NotesBank").then(m => ({ default: m.NotesBank })));
const LearningHub = lazy(() => import("@/pages/dashboard/LearningHub").then(m => ({ default: m.LearningHub })));
const Achievements = lazy(() => import("@/pages/dashboard/Achievements").then(m => ({ default: m.Achievements })));
const FlashcardSwipeEngine = lazy(() => import("@/pages/dashboard/FlashcardSwipeEngine").then(m => ({ default: m.FlashcardSwipeEngine })));
const MyClasses = lazy(() => import("@/pages/dashboard/MyClasses").then(m => ({ default: m.MyClasses })));
const ClassRoom = lazy(() => import("@/pages/dashboard/ClassRoom").then(m => ({ default: m.ClassRoom })));
const ResourceHub = lazy(() => import("@/pages/resources/ResourceHub"));

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
const TutorVideos = lazy(() => import("@/pages/tutor/TutorVideos").then(m => ({ default: m.TutorVideos })));
const TutorClassResources = lazy(() => import("@/pages/tutor/TutorClassResources"));
const TutorClassRoom = lazy(() => import("@/pages/tutor/TutorClassRoom").then(m => ({ default: m.TutorClassRoom })));
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
const QuizAnalytics = lazy(() => import("@/pages/admin/QuizAnalytics").then(m => ({ default: m.QuizAnalytics })));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings").then(m => ({ default: m.AdminSettings })));
const CurriculumManager = lazy(() => import("@/pages/admin/CurriculumManager"));

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
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth Pages */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/invite" element={<InvitePage />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

            {/* Public/Student Pages with MainLayout */}
            <Route path="/" element={<MainLayout><HomePage /></MainLayout>} />
            <Route path="/timetable" element={<MainLayout><TimetablePage /></MainLayout>} />
            <Route path="/classes" element={<Navigate to="/dashboard/classes" replace />} />
            <Route path="/inbox" element={<ProtectedRoute requiredRole="authenticated"><MainLayout><InboxPage /></MainLayout></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute requiredRole="authenticated"><MainLayout><AccountPage /></MainLayout></ProtectedRoute>} />

            {/* Student Dashboard Routes */}
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><StudentDashboard /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            {/* Learning Hub — canonical parent route with nested tabs */}
            <Route path="/dashboard/learning" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LearningHub /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/learning/notes" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LearningHub /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/learning/quizzes" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LearningHub /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/learning/flashcards" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LearningHub /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/learning/replays" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><LearningHub /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/learning/flashcards/play" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><FlashcardSwipeEngine /></TenantGuard></ProtectedRoute>} />

            {/* Legacy learning paths → redirect to canonical Learning tabs */}
            <Route path="/dashboard/notes" element={<Navigate to="/dashboard/learning/notes" replace />} />
            <Route path="/dashboard/quizzes" element={<Navigate to="/dashboard/learning/quizzes" replace />} />
            <Route path="/dashboard/flashcards" element={<Navigate to="/dashboard/learning/flashcards" replace />} />
            <Route path="/dashboard/replays" element={<Navigate to="/dashboard/learning/replays" replace />} />

            <Route path="/dashboard/resources" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><ResourceHub /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/achievements" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><Achievements /></DashboardLayout></TenantGuard></ProtectedRoute>} />


            {/* Quiz Routes */}
            <Route path="/quiz/:quizId/lobby" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><QuizLobby /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/quiz/:quizId/play" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><QuizPlay /></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><MyClasses /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><DashboardLayout><ClassRoom /></DashboardLayout></TenantGuard></ProtectedRoute>} />
            {/* UI-only previews — superadmin-gated, never linked from production nav. Isolated mock data, no backend calls. */}
            <Route path="/dashboard/classes/:classId/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><ClassRoomPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TutorClassRoomPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/new/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TutorQuizBuilderPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/quizzes/:quizId/edit/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TutorQuizBuilderPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/quizzes/:quizId/attempt/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><StudentQuizAttemptPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/dashboard/classes/:classId/quizzes/:quizId/results/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><StudentQuizResultsPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/admin/enrollment-matrix/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><EnrollmentMatrixPreview /></DevPreviewGuard></ProtectedRoute>} />
            <Route path="/superadmin/tenants/:centerId/configuration/preview" element={<ProtectedRoute requiredRole="authenticated"><DevPreviewGuard><TenantConfigurationPreview /></DevPreviewGuard></ProtectedRoute>} />

            {/* Quiz Routes */}
            <Route path="/quiz/:quizId" element={<ProtectedRoute requiredRole="authenticated"><TenantGuard><QuizPlay /></TenantGuard></ProtectedRoute>} />

            {/* Tutor Routes */}
            <Route path="/tutor" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorDashboard /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClasses /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClassRoom /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/classes/:classId/resources" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorClassResources /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/classes/:classId/resources" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorClassResources /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/students" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorStudents /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/grading" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorGrading /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/notes" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorNotes /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/upload" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorUpload /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/videos" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorVideos /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/quizzes/new" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorQuizBuilder /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/questions" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><TutorQuestions /></TutorLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/tutor/quiz-analytics" element={<ProtectedRoute tutorOnly><TenantGuard><TutorLayout><QuizAnalytics /></TutorLayout></TenantGuard></ProtectedRoute>} />
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
            <Route path="/admin/quiz-analytics" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><QuizAnalytics /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><AdminSettings /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/videos" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><TutorVideos /></AdminLayout></TenantGuard></ProtectedRoute>} />
            <Route path="/admin/curriculum" element={<ProtectedRoute adminOnly><TenantGuard><AdminLayout><CurriculumManager /></AdminLayout></TenantGuard></ProtectedRoute>} />
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
        </BrowserRouter>
        </MaintenanceGate>
      </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
