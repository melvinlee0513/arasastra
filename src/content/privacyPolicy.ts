/**
 * Aras A+ Privacy Policy content.
 *
 * INTERNAL NOTE — Privacy copy requires Malaysian privacy/legal (PDPA) review
 * before broad commercial launch. Nothing here should be presented as
 * certified or legally approved.
 *
 * INTERNAL TODO — Section 7 (Data Retention): LEGAL REVIEW REQUIRED BEFORE
 * COMMERCIAL V1. Do not add numeric retention periods until confirmed.
 *
 * `lastUpdated` is deliberately a hand-maintained value: a redeploy is not a
 * privacy-policy amendment.
 */

export const PRIVACY_LAST_UPDATED = "23 August 2026";

export interface PrivacySection {
  /** Stable slug used for the URL hash and scroll anchors. */
  id: string;
  number: number;
  title: string;
  /** Paragraphs of plain text. */
  paragraphs: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
  /** Optional closing paragraphs rendered after the bullets. */
  closing?: string[];
}

export const PRIVACY_SUMMARY = {
  title: "Your Privacy",
  paragraphs: [
    "Aras A+ stores the information needed to provide your tuition centre's learning platform.",
    "We use this information to provide your classes, learning materials, timetable, account features and platform security.",
  ],
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: "introduction",
    number: 1,
    title: "Introduction",
    paragraphs: [
      "Aras A+ is a learning platform provided by Futron Digital. Tuition centres use Aras A+ to deliver learning services to their students.",
      "This Privacy Policy explains what information Aras A+ collects, how it is used, and how it is protected when you use the platform.",
      "Your tuition centre decides who is given an account, which classes you are enrolled in, and what learning content is published to you. Aras A+ provides and operates the platform on the centre's behalf.",
      "We may update this policy as the service evolves. Please read it together with any information your tuition centre provides about its own handling of student records.",
    ],
  },
  {
    id: "information-we-collect",
    number: 2,
    title: "Information We Collect",
    paragraphs: ["We collect only what the platform needs in order to work:"],
    bullets: [
      "Account details — name, email address and your role (student, tutor or centre administrator).",
      "Profile information — display name, short About me text and profile picture, if you add them.",
      "Tuition centre and class information — the centre your account belongs to, your enrolments and assigned classes.",
      "Learning activity — materials you open, quiz attempts and results, flashcard study progress, and which announcements you have read.",
      "Progress and gamification data — experience points and streak information, where your centre has these features enabled.",
      "Support requests — the category, subject, description and any file you attach when you contact support.",
      "Technical and security information — basic request and error logs used to keep the platform working and secure.",
    ],
    closing: [
      "Aras A+ does not collect payment card details through the platform, and does not ask for identity documents.",
    ],
  },
  {
    id: "how-we-use-information",
    number: 3,
    title: "How We Use Information",
    paragraphs: ["Information is used to:"],
    bullets: [
      "Authenticate your account and keep you signed in.",
      "Show the classes you are enrolled in and the materials published to them.",
      "Provide your schedule, timetable and class announcements.",
      "Run learning features such as quizzes and flashcards, and record your results.",
      "Provide progress, experience points and streaks where your centre enables them.",
      "Keep the platform secure and detect misuse.",
      "Respond to your support requests.",
      "Administer, maintain and improve the service.",
    ],
    closing: [
      "Aras A+ does not sell your information, and does not use your learning data for advertising.",
    ],
  },
  {
    id: "information-sharing",
    number: 4,
    title: "Information Sharing",
    paragraphs: [
      "Your information is visible to your own tuition centre — its administrators and the tutors assigned to your classes — so they can teach and support you.",
      "To operate the platform we rely on infrastructure and service providers, including application hosting and managed cloud database, authentication, file storage and email delivery services. These providers process information only in order to host and run Aras A+.",
      "We may also disclose information where we are required to do so by law, or to protect the safety and security of users and the platform.",
    ],
    closing: [
      "We do not share your personal information with third parties for their own marketing purposes.",
    ],
  },
  {
    id: "data-storage-security",
    number: 5,
    title: "Data Storage & Security",
    paragraphs: [
      "Access to the platform requires an authenticated account. Each tuition centre's data is kept separate from other centres, and permissions are enforced by the platform rather than by hiding buttons in the interface.",
      "Learning resources such as notes and recordings are stored privately and served only to people entitled to view them. Administrative actions and security-relevant events are logged.",
      "No online service can promise perfect security. We work to protect your information using appropriate technical and organisational measures, and we ask that you keep your password confidential and sign out on shared devices.",
    ],
  },
  {
    id: "your-rights",
    number: 6,
    title: "Your Rights",
    paragraphs: [
      "You can ask to access the personal information held about you, to correct it if it is inaccurate, to request account-related changes, and to request deletion where that applies.",
      "Some requests are handled by your tuition centre, because the centre manages accounts, enrolments and its own academic records.",
      "To make a request or ask a privacy question, contact us using the support details on this page, or speak to your tuition centre.",
    ],
  },
  {
    id: "data-retention",
    number: 7,
    title: "Data Retention",
    paragraphs: [
      "We keep information only while there is a legitimate reason to do so — operating the service, supporting your centre's academic records where applicable, platform security, handling support requests, and meeting legal or contractual obligations.",
      "If you stop studying with a centre, your account and learning records may be retained by that centre for its own records for a period, and may be deactivated rather than removed immediately.",
      "If a centre stops using Aras A+, its data is handled in line with the arrangement between the centre and Futron Digital.",
      "When an account deletion request is completed, personal account information is removed from the live platform. Some records may persist briefly in routine backups or in anonymised or aggregated form.",
    ],
  },
  {
    id: "students-younger-users",
    number: 8,
    title: "Students & Younger Users",
    paragraphs: [
      "Aras A+ is built for tuition centres serving secondary-school students, some of whom may be minors.",
      "We aim to collect only the information relevant to providing the learning service, and to use it for educational and platform purposes.",
      "Tuition centres — and, where applicable, parents or guardians — may have a role in authorising a student's account and in how student information is handled, in line with applicable law and the centre's own policies.",
      "If a parent, guardian or student has a privacy question or concern, it can be raised with the tuition centre or with Aras A+ support.",
    ],
  },
  {
    id: "changes-to-this-policy",
    number: 9,
    title: "Changes to This Policy",
    paragraphs: [
      "We may update this policy as Aras A+ develops, or as legal and operational requirements change.",
      "The date at the bottom of this page shows when the policy was last updated. Where a change materially affects how your information is handled, we will communicate it through appropriate means, such as in-platform information or via your tuition centre.",
    ],
  },
  {
    id: "contact-us",
    number: 10,
    title: "Contact Us",
    paragraphs: [
      "Aras A+ is provided by Futron Digital.",
      "For privacy questions, access or correction requests, or anything else about this policy, use the Help & Support page to send us a request. Your tuition centre can also help with questions about your account, enrolment and centre records.",
    ],
  },
];

export const PRIVACY_TOC = PRIVACY_SECTIONS.map((s) => ({
  id: s.id,
  number: s.number,
  title: s.title,
}));
