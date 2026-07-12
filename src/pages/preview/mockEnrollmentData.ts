// Isolated static mock data for Priority 3 Enrollment Matrix UI preview.
// Not used by any production route. No Supabase queries.

export type MockAccountStatus = "active" | "pending" | "inactive";
export type MockClassStatus = "active" | "archived";

export interface MockClass {
  id: string;
  subject: string;
  className: string;
  tutorName: string;
  schedule: string;
  academicYear: string;
  status: MockClassStatus;
}

export interface MockStudent {
  id: string;
  name: string;
  email: string;
  formLevel: string; // e.g. "Form 4", "Form 5"
  accountStatus: MockAccountStatus;
  joinedDate: string; // ISO
  enrolledClassIds: string[];
  enrolledDates: Record<string, string>; // classId -> ISO enrolled date
}

export const MOCK_CENTER_NAME = "Sri Sarjana Learning Centre";

export const MOCK_CLASSES: MockClass[] = [
  { id: "cls-phy-5a", subject: "Physics", className: "Form 5 Physics A", tutorName: "Mr. Lee", schedule: "Thursday 1:00 PM", academicYear: "2026", status: "active" },
  { id: "cls-phy-5b", subject: "Physics", className: "Form 5 Physics B", tutorName: "Mr. Lee", schedule: "Saturday 10:00 AM", academicYear: "2026", status: "active" },
  { id: "cls-bio-4w", subject: "Biology", className: "Form 4 Biology - Weekend", tutorName: "Ms. Aisha", schedule: "Sunday 9:00 AM", academicYear: "2026", status: "active" },
  { id: "cls-chem-5", subject: "Chemistry", className: "Form 5 Chemistry", tutorName: "Dr. Tan", schedule: "Wednesday 4:00 PM", academicYear: "2026", status: "active" },
  { id: "cls-math-4", subject: "Add Maths", className: "Form 4 Add Maths", tutorName: "Ms. Priya", schedule: "Tuesday 5:00 PM", academicYear: "2026", status: "active" },
  { id: "cls-math-5-arch", subject: "Add Maths", className: "Form 5 Add Maths (2025)", tutorName: "Ms. Priya", schedule: "Monday 6:00 PM", academicYear: "2025", status: "archived" },
];

const FIRST = ["Aarav", "Bella", "Chin", "Divya", "Ethan", "Farah", "Gopal", "Hana", "Iman", "Jia", "Kavin", "Lina", "Mira", "Nadia", "Omar", "Priya", "Qi", "Rahul", "Sara", "Tariq", "Umi", "Vik", "Wen", "Xin", "Yasmin", "Zaid"];
const LAST = ["Tan", "Lim", "Kumar", "Rahman", "Wong", "Singh", "Ismail", "Chen", "Yusof", "Devi", "Ng", "Farid", "Krishnan", "Ali", "Ong", "Suresh"];
const FORMS = ["Form 3", "Form 4", "Form 5"];

function seededStudents(count: number): MockStudent[] {
  const students: MockStudent[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3) % LAST.length];
    const name = `${first} ${last}`;
    const form = FORMS[i % FORMS.length];
    const statusRoll = i % 11;
    const accountStatus: MockAccountStatus =
      statusRoll === 0 ? "inactive" : statusRoll === 1 ? "pending" : "active";
    // Deterministic enrollments across mock classes
    const enrolled: string[] = [];
    const enrolledDates: Record<string, string> = {};
    MOCK_CLASSES.forEach((c, idx) => {
      if ((i + idx) % 4 === 0 && c.status === "active") {
        enrolled.push(c.id);
        const day = ((i * 7 + idx * 3) % 27) + 1;
        enrolledDates[c.id] = `2026-01-${String(day).padStart(2, "0")}`;
      }
    });
    const joinedDay = ((i * 5) % 27) + 1;
    students.push({
      id: `stu-${i + 1}`,
      name,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      formLevel: form,
      accountStatus,
      joinedDate: `2025-09-${String(joinedDay).padStart(2, "0")}`,
      enrolledClassIds: enrolled,
      enrolledDates,
    });
  }
  return students;
}

export const MOCK_STUDENTS: MockStudent[] = seededStudents(84);
