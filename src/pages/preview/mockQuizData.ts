// Isolated static mock data for Priority 2 Quiz Builder UI preview.
// Not used by any production route.
export type MockQuestionType = "mcq" | "true_false";

export interface MockOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface MockQuestion {
  id: string;
  type: MockQuestionType;
  text: string;
  points: number;
  options: MockOption[];
  explanation?: string;
}

export interface MockQuizSettings {
  title: string;
  description: string;
  classId: string;
  className: string;
  timeLimitEnabled: boolean;
  timeLimitMinutes: number;
  attemptLimit: number;
  passingScore: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showScoreImmediately: boolean;
  showCorrectAfterSubmit: boolean;
  status: "draft" | "published";
}

export const MOCK_QUIZ_SETTINGS: MockQuizSettings = {
  title: "Chapter 3 Mastery Check",
  description: "Covers plant transport, xylem, phloem, and transpiration.",
  classId: "mock-1",
  className: "Form 4 Biology — Weekend Cohort",
  timeLimitEnabled: true,
  timeLimitMinutes: 15,
  attemptLimit: 2,
  passingScore: 60,
  shuffleQuestions: true,
  shuffleOptions: true,
  showScoreImmediately: true,
  showCorrectAfterSubmit: true,
  status: "draft",
};

export const MOCK_QUESTIONS: MockQuestion[] = [
  {
    id: "q1",
    type: "mcq",
    text: "Which tissue transports water from roots to leaves?",
    points: 2,
    options: [
      { id: "o1", text: "Xylem", isCorrect: true },
      { id: "o2", text: "Phloem", isCorrect: false },
      { id: "o3", text: "Cambium", isCorrect: false },
      { id: "o4", text: "Epidermis", isCorrect: false },
    ],
    explanation: "Xylem carries water and dissolved minerals upward.",
  },
  {
    id: "q2",
    type: "true_false",
    text: "Transpiration occurs mainly through the stomata of leaves.",
    points: 1,
    options: [
      { id: "t1", text: "True", isCorrect: true },
      { id: "t2", text: "False", isCorrect: false },
    ],
    explanation: "Most water loss happens via stomata on the underside of leaves.",
  },
  {
    id: "q3",
    type: "mcq",
    text: "Which factor does NOT increase transpiration rate?",
    points: 2,
    options: [
      { id: "a1", text: "High humidity", isCorrect: true },
      { id: "a2", text: "Wind", isCorrect: false },
      { id: "a3", text: "Higher temperature", isCorrect: false },
      { id: "a4", text: "Bright light", isCorrect: false },
    ],
  },
];
