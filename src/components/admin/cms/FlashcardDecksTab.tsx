import { useEffect, useState } from "react";
import { Plus, Trash2, Edit, Save, BrainCircuit, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Deck {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  created_at: string;
  card_count?: number;
  subject_name?: string;
}

interface CardForm {
  id?: string;
  front_text: string;
  back_text: string;
  sort_order: number;
}

export function FlashcardDecksTab() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeckDialog, setShowDeckDialog] = useState(false);
  const [showCardsDialog, setShowCardsDialog] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [deckForm, setDeckForm] = useState({ title: "", description: "", subject_id: "" });
  const [cards, setCards] = useState<CardForm[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [decksRes, subjectsRes] = await Promise.all([
      supabase.from("flashcard_decks").select("id, title, description, subject_id, created_at, subject:subjects(name)").order("created_at", { ascending: false }),
      supabase.from("subjects").select("id, name").eq("is_active", true),
    ]);

    if (decksRes.data) {
      const deckIds = decksRes.data.map((d) => d.id);
      const { data: allCards } = await supabase.from("flashcards").select("deck_id").in("deck_id", deckIds);
      const countMap = new Map<string, number>();
      (allCards || []).forEach((c) => { countMap.set(c.deck_id, (countMap.get(c.deck_id) || 0) + 1); });

      setDecks(decksRes.data.map((d) => ({
        ...d,
        subject_name: (d.subject as any)?.name || undefined,
        card_count: countMap.get(d.id) || 0,
      })));
    }
    if (subjectsRes.data) setSubjects(subjectsRes.data);
    setIsLoading(false);
  };

  const saveDeck = async () => {
    setIsSaving(true);
    try {
      if (editingDeck) {
        await supabase.from("flashcard_decks").update({
          title: deckForm.title,
          description: deckForm.description || null,
          subject_id: deckForm.subject_id || null,
        }).eq("id", editingDeck.id);
        toast({ title: "✅ Deck updated" });
      } else {
        await supabase.from("flashcard_decks").insert({
          title: deckForm.title,
          description: deckForm.description || null,
          subject_id: deckForm.subject_id || null,
        });
        toast({ title: "✅ Deck created" });
      }
      setShowDeckDialog(false);
      setEditingDeck(null);
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to save deck", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const deleteDeck = async (id: string) => {
    await supabase.from("flashcards").delete().eq("deck_id", id);
    await supabase.from("flashcard_decks").delete().eq("id", id);
    toast({ title: "🗑️ Deck deleted" });
    fetchData();
  };

  const openCards = async (deck: Deck) => {
    setEditingDeck(deck);
    const { data } = await supabase.from("flashcards").select("*").eq("deck_id", deck.id).order("sort_order");
    setCards((data || []).map((c) => ({ id: c.id, front_text: c.front_text, back_text: c.back_text, sort_order: c.sort_order || 0 })));
    setShowCardsDialog(true);
  };

  const addCard = () => {
    setCards((prev) => [...prev, { front_text: "", back_text: "", sort_order: prev.length }]);
  };

  const updateCard = (index: number, field: string, value: string) => {
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const removeCard = (index: number) => {
    setCards((prev) => prev.filter((_, i) => i !== index));
  };

  const saveCards = async () => {
    if (!editingDeck) return;
    setIsSaving(true);
    try {
      for (const c of cards) {
        if (!c.front_text.trim() || !c.back_text.trim()) throw new Error("All cards must have front and back text");
      }
      await supabase.from("flashcards").delete().eq("deck_id", editingDeck.id);
      if (cards.length > 0) {
        await supabase.from("flashcards").insert(
          cards.map((c, i) => ({ deck_id: editingDeck.id, front_text: c.front_text, back_text: c.back_text, sort_order: i }))
        );
      }
      toast({ title: "✅ Cards saved" });
      setShowCardsDialog(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Flashcard Decks</h2>
          <p className="text-sm text-muted-foreground">{decks.length} decks total</p>
        </div>
        <Button onClick={() => { setEditingDeck(null); setDeckForm({ title: "", description: "", subject_id: "" }); setShowDeckDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Deck
        </Button>
      </div>

      {decks.length === 0 ? (
        <Card className="p-12 text-center border-border">
          <BrainCircuit className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-foreground mb-2">No flashcard decks yet</h3>
          <p className="text-sm text-muted-foreground">Create your first deck to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {decks.map((deck) => (
            <Card key={deck.id} className="p-4 border-border flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{deck.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">{deck.card_count} cards</Badge>
                  {deck.subject_name && <Badge variant="outline" className="text-xs">{deck.subject_name}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => openCards(deck)}>
                  <Layers className="w-4 h-4 mr-1" /> Cards
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  setEditingDeck(deck);
                  setDeckForm({ title: deck.title, description: deck.description || "", subject_id: deck.subject_id || "" });
                  setShowDeckDialog(true);
                }}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => deleteDeck(deck.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Deck Dialog */}
      <Dialog open={showDeckDialog} onOpenChange={setShowDeckDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDeck ? "Edit Deck" : "Create Deck"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Deck Title</Label>
              <Input value={deckForm.title} onChange={(e) => setDeckForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. SPM Physics Chapter 3" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea value={deckForm.description} onChange={(e) => setDeckForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description..." />
            </div>
            <div className="space-y-2">
              <Label>Subject (optional)</Label>
              <Select value={deckForm.subject_id} onValueChange={(v) => setDeckForm((f) => ({ ...f, subject_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select subject..." /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeckDialog(false)}>Cancel</Button>
            <Button onClick={saveDeck} disabled={!deckForm.title || isSaving}>{isSaving ? "Saving..." : "Save Deck"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cards Editor Dialog */}
      <Dialog open={showCardsDialog} onOpenChange={setShowCardsDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Cards — {editingDeck?.title}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {cards.map((c, ci) => (
              <Card key={ci} className="p-4 border-border space-y-3">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="text-xs shrink-0 mt-2">#{ci + 1}</Badge>
                  <div className="flex-1 space-y-2">
                    <Input value={c.front_text} onChange={(e) => updateCard(ci, "front_text", e.target.value)} placeholder="Front (Question)" />
                    <Textarea value={c.back_text} onChange={(e) => updateCard(ci, "back_text", e.target.value)} placeholder="Back (Answer)" className="min-h-[60px]" />
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => removeCard(ci)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
            <Button variant="outline" className="w-full" onClick={addCard}>
              <Plus className="w-4 h-4 mr-2" /> Add Card
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCardsDialog(false)}>Cancel</Button>
            <Button onClick={saveCards} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />{isSaving ? "Saving..." : "Save All Cards"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
