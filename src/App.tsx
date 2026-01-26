import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";

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

// Admin Pages
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { ContentCMS } from "@/pages/admin/ContentCMS";
import { UsersManagement } from "@/pages/admin/UsersManagement";
import { ScheduleManager } from "@/pages/admin/ScheduleManager";
import { AnalyticsDashboard } from "@/pages/admin/AnalyticsDashboard";

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

            {/* Student Dashboard Routes */}
            <Route
              path="/dashboard"
              element={
                <DashboardLayout>
                  <StudentDashboard />
                </DashboardLayout>
              }
            />
            <Route
              path="/dashboard/replays"
              element={
                <DashboardLayout>
                  <ReplayLibrary />
                </DashboardLayout>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <AdminLayout>
                  <AdminDashboard />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/content"
              element={
                <AdminLayout>
                  <ContentCMS />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminLayout>
                  <UsersManagement />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/schedule"
              element={
                <AdminLayout>
                  <ScheduleManager />
                </AdminLayout>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <AdminLayout>
                  <AnalyticsDashboard />
                </AdminLayout>
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
