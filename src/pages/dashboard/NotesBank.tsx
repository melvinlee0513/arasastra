import { FileText, Download, Search, Filter } from "lucide-react";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NoteItem {
  id: string;
  title: string;
  subject: string;
  type: string;
  size: string;
  date: string;
}

// Mock data for notes
const mockNotes: NoteItem[] = [
  {
    id: "1",
    title: "Chapter 1 - Introduction to Algebra",
    subject: "Mathematics",
    type: "PDF",
    size: "2.4 MB",
    date: "2024-01-15",
  },
  {
    id: "2",
    title: "Physics Formulas Summary",
    subject: "Physics",
    type: "PDF",
    size: "1.8 MB",
    date: "2024-01-10",
  },
  {
    id: "3",
    title: "Chemistry Lab Report Template",
    subject: "Chemistry",
    type: "DOCX",
    size: "0.5 MB",
    date: "2024-01-08",
  },
  {
    id: "4",
    title: "Biology Cell Structure Notes",
    subject: "Biology",
    type: "PDF",
    size: "3.2 MB",
    date: "2024-01-05",
  },
];

export function NotesBank() {
  const [notes, setNotes] = useState<NoteItem[]>(mockNotes);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  const subjects = [...new Set(mockNotes.map((n) => n.subject))];

  const filteredNotes = notes.filter((note) => {
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = selectedSubject === "all" || note.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Notes Bank</h1>
        <p className="text-muted-foreground">Download study materials and resources</p>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-card border-border">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject} value={subject}>
                  {subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No notes found</h3>
          <p className="text-muted-foreground">
            {searchQuery || selectedSubject !== "all"
              ? "Try adjusting your filters"
              : "Notes will appear here when added by tutors"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => (
            <Card
              key={note.id}
              className="p-4 bg-card border-border hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{note.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {note.subject}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {note.type} • {note.size}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
