/**
 * Semantic illustration registry for the general student service pages
 * (More, Inbox, Achievements, Timetable).
 *
 * Every path below was verified against `public/assets/illustrations/`.
 * Components must reference these semantic names instead of raw asset URLs.
 */

const BASE = "/assets/illustrations";

function asset(relative: string): string {
  return `${BASE}/${relative.split("/").map(encodeURIComponent).join("/")}`;
}

/** "More" hub service tiles. */
export const STUDENT_SERVICE_ART = {
  timetable: asset("learning/glossy_pastel_calendar_with_checkmark.webp"),
  inbox: asset("learning/notification-messages.webp"),
  achievements: asset("decorative/glossy_golden_star_trophy_icon.webp"),
  leaderboard: asset("gamification/glossy_jewelled_golden_crown_icon.webp"),
  hub: asset("ui/glossy_3d_study_folder_icon.webp"),
  support: asset("ui/help-support-headset.webp"),
  privacy: asset("ui/privacy-policy-shield-icon.webp"),
} as const;

/** Inbox message artwork. */
export const INBOX_ART = {
  inbox: asset("learning/notification-messages.webp"),
  announcement: asset("ui/glossy_3d_megaphone_icon.webp"),
  reminder: asset("learning/glossy_3d_calendar_reminder_icon.webp"),
  bell: asset("decorative/glossy_golden_notification_bell.webp"),
  empty: asset("learning/glossy_lavender_twin_bell_alarm_clock.webp"),
} as const;

/** Achievements artwork. */
export const ACHIEVEMENT_ART = {
  trophy: asset("decorative/glossy_golden_star_trophy_icon.webp"),
  certificate: asset("ui/glossy_3d_certificate_scroll_with_medal.webp"),
  locked: asset("ui/glossy_blue_shield_with_golden_padlock.webp"),
  firstStep: asset("gamification/glossy_bronze_star_medal_badge.webp"),
  streak: asset("gamification/glossy_flame_streak_reward_badge.webp"),
  streakLong: asset("gamification/streak-flame-7.webp"),
  xp: asset("gamification/glossy_golden_lightning_bolt.webp"),
  level: asset("gamification/glossy_gold_star_medal_with_rainbow_ribbon.webp"),
  star: asset("gamification/achievement-star.webp"),
} as const;

/** Timetable artwork. */
export const TIMETABLE_ART = {
  calendar: asset("learning/glossy_pastel_calendar_with_checkmark.webp"),
  reminder: asset("learning/glossy_3d_calendar_reminder_icon.webp"),
  clock: asset("learning/glossy_lavender_twin_bell_alarm_clock.webp"),
  hourglass: asset("learning/glossy_blue_hourglass_with_floating_orbs.webp"),
  empty: asset("learning/glossy_pastel_calendar_with_checkmark.webp"),
} as const;

/** Student Profile page artwork. */
export const PROFILE_ART = {
  starBadge: asset("ui/profile-star-badge.png"),
  starAward: asset("gamification/profile-star-award.png"),
  editPencil: asset("gamification/edit-pencil-blue.png"),
  palette: asset("ui/personalisation-palette.png"),
  paintbrush: asset("ui/personalisation-paintbrush.png"),
  userBadge: asset("ui/profile-user-badge.png"),
  helpBadge: asset("ui/help-question-badge.png"),
  signOut: asset("ui/sign-out-red.png"),
  selectedCheck: asset("ui/selected-check-blue.png"),
  graduationCap: asset("ui/graduation-cap-blue.png"),
  calendar: asset("ui/calendar-purple.png"),
  /** Single completed decorative composition: clouds + smiling star + heart. */
  cardTile: asset("decorative/sleeping-star-cloud.png"),
  happyStar: asset("decorative/happy-star.png"),
  cloudSoftBlue: asset("decorative/cloud-soft-blue.png"),
  sparklePurple: asset("decorative/sparkle-purple.png"),
  orb: asset("decorative/orb-blue-purple.png"),
  starYellow: asset("ui/sparkle-yellow.webp"),
} as const;

/** Decorative accents — always aria-hidden and pointer-events-none. */

export const DECOR_ART = {
  star: asset("ui/sparkle-yellow.webp"),
  sparkleStar: asset("gamification/achievement-star.webp"),
  cloud: asset("decorative/glossy_fluffy_cloud_icon.webp"),
  cloudSoft: asset("ui/cloud.webp"),
  orb: asset("decorative/orbs-blue-purple.webp"),
  paperPlane: asset("decorative/paper-plane-purple.webp"),
  bell: asset("decorative/glossy_golden_notification_bell.webp"),
} as const;

/** Free-standing decorative artwork helper props. */
export const DECOR_IMG_PROPS = {
  alt: "",
  "aria-hidden": true as const,
  loading: "lazy" as const,
  decoding: "async" as const,
};

/**
 * Help & Support artwork.
 *
 * `ui/help-support/` is reserved for future dedicated compositions; until those
 * land these keys point at verified existing assets so nothing renders broken.
 */
export const HELP_SUPPORT_ART = {
  hero: asset("ui/mascot/aras-guide-owl-waving.webp"),
  headset: asset("ui/help-support-headset.webp"),
  chat: asset("ui/support-chat-bubble.webp"),
  search: asset("ui/magnifying-glass.webp"),
  info: asset("ui/glossy_blue_3d_information_bubble.webp"),
  contactCentre: asset("ui/contact-centre-phone-icon.webp"),
  login: asset("ui/profile-user-badge.png"),
  password: asset("ui/glossy_blue_shield_with_golden_padlock.webp"),
  classes: asset("ui/glossy_blue_graduation_cap_with_gold_tassel.webp"),
  materials: asset("ui/glossy_pastel_notebook_stack_icon.webp"),
  timetable: asset("ui/timetable-calendar-clock.webp"),
  technical: asset("ui/personalisation-puzzle.webp"),
} as const;

/** Privacy Policy artwork. */
export const PRIVACY_ART = {
  hero: asset("ui/privacy/privacy-policy-hero-owl-security-shield.webp"),
  shield: asset("ui/privacy-policy-shield-icon.webp"),
  lock: asset("ui/glossy_blue_shield_with_golden_padlock.webp"),
  info: asset("ui/glossy_blue_3d_information_bubble.webp"),
} as const;

