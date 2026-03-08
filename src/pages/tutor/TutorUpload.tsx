import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Upload, Link2, Tag, FileText, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = ["Class Details", "Media Linking", "Resource Tagging"];

export function TutorUpload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [tutorRecord, setTutorRecord] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Step 1: Class Details
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [duration, setDuration] = useState("60");

  // Step 2: Media
  const [videoUrl, setVideoUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [noteTitle, setNoteTitle] = useState("");

  // Step 3: Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (user?.id) fetchTutorData();
  }, [user?.id]);

  const fetchTutorData = async () => {
    const { data: tutor } = await supabase
      .from("tutors")
      .select("id, specialization")
      .eq("user_id", user!.id)
      .single();

    if (tutor) {
      setTutorRecord(tutor);
      // Get subjects matching specialization
      const { data: subs } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("is_active", true);
      setSubjects(subs || []);
    }
  };

  const isVideoUrlValid = (url: string) => {
    if (!url) return true; // optional
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\/.+/.test(url);
  };

  const canProceed = () => {
    if (step === 0) return title.trim() && subjectId && scheduledDate && scheduledTime;
    if (step === 1) return !videoUrl || isVideoUrlValid(videoUrl);
    if (step === 2) return tags.length > 0;
    return false;
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const handleSubmit = async () => {
    if (!tutorRecord || !user) return;
    setIsSubmitting(true);

    try {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

      // 1. Create the class
      const { data: newClass, error: classErr } = await supabase
        .from("classes")
        .insert({
          title,
          description: description || null,
          subject_id: subjectId,
          tutor_id: tutorRecord.id,
          scheduled_at: scheduledAt,
          duration_minutes: parseInt(duration),
          video_url: videoUrl || null,
          is_published: true,
        })
        .select()
        .single();

      if (classErr) throw classErr;

      // 2. Upload PDF if provided
      if (pdfFile && newClass) {
        const fileExt = pdfFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from("notes")
          .upload(fileName, pdfFile);
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from("notes").getPublicUrl(fileName);

        await supabase.from("notes").insert({
          title: noteTitle || `${title} - Notes`,
          subject_id: subjectId,
          file_url: urlData.publicUrl,
          file_name: pdfFile.name,
          file_size: pdfFile.size,
          file_type: pdfFile.type,
          uploaded_by: user.id,
          description: `Tags: ${tags.join(", ")}`,
        });
      }

      setShowSuccess(true);
      toast({ title: "🎉 Class Published!", description: "Your class is now visible to students." });

      setTimeout(() => navigate("/tutor/classes"), 2500);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to publish", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto"
          >
            <Check className="w-10 h-10 text-primary" />
          </motion.div>
          <h2 className="text-2xl font-bold text-foreground">Class Published! 🎉</h2>
          <p className="text-muted-foreground">Your class is now live on the student schedule.</p>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="p-4 bg-card border-border inline-block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Video className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{tags.join(" • ")}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Content</h1>
        <p className="text-muted-foreground">Create a new class with resources for your students</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i <= step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 ${i < step ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="p-6 bg-card border-border rounded-3xl space-y-5">
            {step === 0 && (
              <>
                <h2 className="text-lg font-semibold text-foreground">Class Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Title *</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Algebra - Quadratic Equations" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Subject *</label>
                    <Select value={subjectId} onValueChange={setSubjectId}>
                      <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Date *</label>
                      <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Time *</label>
                      <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Duration (minutes)</label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["30", "45", "60", "90", "120"].map((d) => (
                          <SelectItem key={d} value={d}>{d} min</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Description (optional)</label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Brief overview of the lesson..." />
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold text-foreground">Media Linking</h2>
                <div className="space-y-5">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                      <Link2 className="w-4 h-4" /> Video URL (YouTube or Vimeo)
                    </label>
                    <Input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                    {videoUrl && !isVideoUrlValid(videoUrl) && (
                      <p className="text-xs text-destructive mt-1">Please enter a valid YouTube or Vimeo URL</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> PDF Notes (optional)
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    />
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      {pdfFile ? (
                        <p className="text-sm font-medium text-foreground">{pdfFile.name}</p>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">Drop PDF here or click to browse</p>
                          <p className="text-xs text-muted-foreground mt-1">Max 10MB</p>
                        </>
                      )}
                    </div>
                    {pdfFile && (
                      <div className="mt-3">
                        <label className="text-sm text-muted-foreground mb-1 block">Note Title</label>
                        <Input
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          placeholder={`${title || "Class"} - Notes`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-semibold text-foreground">Resource Tags</h2>
                <p className="text-sm text-muted-foreground">
                  Add topic tags so the system can identify student weak areas. At least one tag is required.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="e.g. Algebra, Paper 1, Quadratics"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  />
                  <Button variant="outline" onClick={addTag} disabled={!tagInput.trim()}>
                    <Tag className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 min-h-[2rem]">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 cursor-pointer hover:bg-destructive/10"
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                    >
                      {tag} ×
                    </Badge>
                  ))}
                  {tags.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No tags added yet</p>
                  )}
                </div>
              </>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className="rounded-full"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="rounded-full"
          >
            Next <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!canProceed() || isSubmitting}
            className="rounded-full"
          >
            {isSubmitting ? "Publishing..." : "Publish Class"} <Check className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
