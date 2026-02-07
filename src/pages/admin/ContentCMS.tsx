import { Calendar, Users, BookOpen, FileText, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WeeklyScheduleTab } from "@/components/admin/cms/WeeklyScheduleTab";
import { TutorProfilesTab } from "@/components/admin/cms/TutorProfilesTab";
import { ClassCategoriesTab } from "@/components/admin/cms/ClassCategoriesTab";
import { SiteContentTab } from "@/components/admin/cms/SiteContentTab";
import { useState } from "react";

export function ContentCMS() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    toast({ title: "✅ Refreshed", description: "Content data has been updated" });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content Management</h1>
          <p className="text-muted-foreground">
            Manage all site data, schedules, tutors, classes, and videos
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border rounded-none">
          <TabsTrigger
            value="schedule"
            className="gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5"
          >
            <Calendar className="w-4 h-4" />
            Weekly Schedule
          </TabsTrigger>
          <TabsTrigger
            value="tutors"
            className="gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5"
          >
            <Users className="w-4 h-4" />
            Tutor Profiles
          </TabsTrigger>
          <TabsTrigger
            value="categories"
            className="gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5"
          >
            <BookOpen className="w-4 h-4" />
            Class Categories
          </TabsTrigger>
          <TabsTrigger
            value="content"
            className="gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5"
          >
            <FileText className="w-4 h-4" />
            Site Content
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6" key={`schedule-${refreshKey}`}>
          <WeeklyScheduleTab />
        </TabsContent>

        <TabsContent value="tutors" className="mt-6" key={`tutors-${refreshKey}`}>
          <TutorProfilesTab />
        </TabsContent>

        <TabsContent value="categories" className="mt-6" key={`categories-${refreshKey}`}>
          <ClassCategoriesTab />
        </TabsContent>

        <TabsContent value="content" className="mt-6" key={`content-${refreshKey}`}>
          <SiteContentTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
