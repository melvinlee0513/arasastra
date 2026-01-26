import { BookOpen, FileText, Video, ChevronRight } from "lucide-react";

// Empty state component for professional "no data" illustrations
interface EmptyStateProps {
  type: "users" | "classes" | "subjects" | "notes" | "replays" | "general";
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const illustrations = {
  users: <div className="text-6xl">👥</div>,
  classes: <Video className="w-16 h-16 text-muted-foreground" />,
  subjects: <BookOpen className="w-16 h-16 text-muted-foreground" />,
  notes: <FileText className="w-16 h-16 text-muted-foreground" />,
  replays: <Video className="w-16 h-16 text-muted-foreground" />,
  general: <div className="text-6xl">📭</div>,
};

const defaultMessages = {
  users: {
    title: "No users yet",
    description: "Users will appear here when they sign up for the platform.",
  },
  classes: {
    title: "No classes scheduled",
    description: "Schedule your first class to get started.",
  },
  subjects: {
    title: "No subjects added",
    description: "Add subjects to organize your curriculum.",
  },
  notes: {
    title: "No notes available",
    description: "Notes will appear here when uploaded by tutors.",
  },
  replays: {
    title: "No replays available",
    description: "Class recordings will appear here after sessions are recorded.",
  },
  general: {
    title: "No data found",
    description: "There's nothing here yet.",
  },
};

export function EmptyState({ type, title, description, action }: EmptyStateProps) {
  const defaults = defaultMessages[type];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-6 opacity-60">{illustrations[type]}</div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title || defaults.title}
      </h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        {description || defaults.description}
      </p>
      {action}
    </div>
  );
}
