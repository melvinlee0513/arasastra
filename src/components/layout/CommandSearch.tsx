import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, Video, HelpCircle, BookOpen, Home } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

interface SearchResult {
  id: string;
  title: string;
  type: "class" | "note" | "quiz" | "page";
  subtitle?: string;
  path: string;
}

const staticPages: SearchResult[] = [
  { id: "home", title: "Home", type: "page", subtitle: "Landing page", path: "/" },
  { id: "dashboard", title: "Dashboard", type: "page", subtitle: "Student dashboard", path: "/dashboard" },
  { id: "timetable", title: "Timetable", type: "page", subtitle: "Class schedule", path: "/timetable" },
  { id: "classes", title: "Classes", type: "page", subtitle: "Subject hub", path: "/classes" },
  { id: "notes", title: "Notes Bank", type: "page", subtitle: "Study materials", path: "/dashboard/notes" },
  { id: "quizzes", title: "Quizzes", type: "page", subtitle: "Test your knowledge", path: "/dashboard/quizzes" },
  { id: "replays", title: "Replay Library", type: "page", subtitle: "Watch past classes", path: "/dashboard/replays" },
  { id: "account", title: "Account", type: "page", subtitle: "Profile & subscription", path: "/account" },
];

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }

    const searchTerm = `%${q}%`;

    const [classesRes, notesRes, quizzesRes] = await Promise.all([
      supabase
        .from("classes")
        .select("id, title, subject:subjects(name)")
        .ilike("title", searchTerm)
        .eq("is_published", true)
        .limit(5),
      supabase
        .from("notes")
        .select("id, title, subject:subjects(name)")
        .ilike("title", searchTerm)
        .limit(5),
      supabase
        .from("quizzes")
        .select("id, title")
        .ilike("title", searchTerm)
        .limit(5),
    ]);

    const items: SearchResult[] = [
      ...(classesRes.data || []).map((c) => ({
        id: c.id,
        title: c.title,
        type: "class" as const,
        subtitle: (c.subject as { name: string } | null)?.name,
        path: "/dashboard/replays",
      })),
      ...(notesRes.data || []).map((n) => ({
        id: n.id,
        title: n.title,
        type: "note" as const,
        subtitle: (n.subject as { name: string } | null)?.name,
        path: "/dashboard/notes",
      })),
      ...(quizzesRes.data || []).map((q) => ({
        id: q.id,
        title: q.title,
        type: "quiz" as const,
        path: `/quiz/${q.id}`,
      })),
    ];

    setResults(items);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const getIcon = (type: string) => {
    switch (type) {
      case "class": return <Video className="w-4 h-4 text-accent" />;
      case "note": return <FileText className="w-4 h-4 text-accent" />;
      case "quiz": return <HelpCircle className="w-4 h-4 text-accent" />;
      case "page": return <Home className="w-4 h-4 text-muted-foreground" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const filteredPages = staticPages.filter(
    (p) =>
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.subtitle?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search classes, notes, quizzes..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {filteredPages.length > 0 && (
          <CommandGroup heading="Pages">
            {filteredPages.map((page) => (
              <CommandItem
                key={page.id}
                onSelect={() => handleSelect(page.path)}
                className="gap-3"
              >
                {getIcon(page.type)}
                <div>
                  <p className="font-medium">{page.title}</p>
                  {page.subtitle && (
                    <p className="text-xs text-muted-foreground">{page.subtitle}</p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.length > 0 && (
          <CommandGroup heading="Search Results">
            {results.map((result) => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result.path)}
                className="gap-3"
              >
                {getIcon(result.type)}
                <div>
                  <p className="font-medium">{result.title}</p>
                  {result.subtitle && (
                    <p className="text-xs text-muted-foreground">{result.subtitle}</p>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
