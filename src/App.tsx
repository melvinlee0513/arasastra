import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Layouts
import { MainLayout } from "@/components/layout/MainLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

// Public Pages
import { HomePage } from "@/pages/HomePage";
import { AuthPage } from "@/pages/AuthPage";
import { TimetablePage } from "@/pages/TimetablePage";
import { ClassesPage } from "@/pages/ClassesPage";
import { InboxPage } from "@/pages/InboxPage";
import { AccountPage } from "@/pages/AccountPage";
import NotFound from "./pages/NotFound";

// Student Dashboard Pages
import { StudentDashboard } from "@/pages/dashboard/StudentDashboard";
import { ReplayLibrary } from "@/pages/dashboard/ReplayLibrary";
import { QuizList } from "@/pages/dashboard/QuizList";
import { QuizPlay } from "@/pages/quiz/QuizPlay";

// Admin Pages
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { ContentCMS } from "@/pages/admin/ContentCMS";
import { UsersManagement } from "@/pages/admin/UsersManagement";
import { ScheduleManager } from "@/pages/admin/ScheduleManager";
import { AnalyticsDashboard } from "@/pages/admin/AnalyticsDashboard";
import { NotesManagement } from "@/pages/admin/NotesManagement";
import { PaymentVerification } from "@/pages/admin/PaymentVerification";
import { LeadsManagement } from "@/pages/admin/LeadsManagement";
import { GradingPage } from "@/pages/admin/GradingPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Auth Page */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Public/Student Pages with MainLayout */}
            <Route
              path="/"
              element={
                <MainLayout>
                  <HomePage />
                </MainLayout>
              }
            />
            <Route
              path="/timetable"
              element={
                <MainLayout>
                  <TimetablePage />
                </MainLayout>
              }
            />
            <Route
              path="/classes"
              element={
                <MainLayout>
                  <ClassesPage />
                </MainLayout>
              }
            />
            <Route
              path="/inbox"
              element={
                <MainLayout>
                  <InboxPage />
                </MainLayout>
              }
            />
            <Route
              path="/account"
              element={
                <MainLayout>
                  <AccountPage />
                </MainLayout>
              }
            />

            {/* Student Dashboard Routes - Requires authentication */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute requiredRole="authenticated">
                  <DashboardLayout>
                    <StudentDashboard />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/replays"
              element={
                <ProtectedRoute requiredRole="authenticated">
                  <DashboardLayout>
                    <ReplayLibrary />
                  </DashboardLayout>
            </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/quizzes"
              element={
                <ProtectedRoute requiredRole="authenticated">
                  <DashboardLayout>
                    <QuizList />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/quiz/:quizId"
              element={
                <ProtectedRoute requiredRole="authenticated">
                  <QuizPlay />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes - Requires admin role */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <AdminDashboard />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/leads"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <LeadsManagement />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/content"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <ContentCMS />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <UsersManagement />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/schedule"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <ScheduleManager />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/notes"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <NotesManagement />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/payments"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <PaymentVerification />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <AnalyticsDashboard />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/grading"
              element={
                <ProtectedRoute adminOnly>
                  <AdminLayout>
                    <GradingPage />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
