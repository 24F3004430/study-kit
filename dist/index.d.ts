/**
 * Subject-agnostic study kit.
 *
 * Everything here is content-free: you supply a `Subject` (courses, cards,
 * questions, terms, milestones) and get the tutor, study lab, practice marking,
 * progress maths and deadline export back. Nothing in this file knows what the
 * subject actually is — swap algebra for anatomy or law by passing a different
 * bundle.
 *
 * Usage:
 *   const kit = createSubjectKit(algebra);
 *   kit.answer(1, "Explain like I'm 12");
 *   kit.practiceTest(1);
 *   kit.projectedTermScore({ "quiz-1": 72 }, 1);
 */
export interface Section {
    title: string;
    content: string;
    /** A list section is rendered as ordered points when explaining steps. */
    type?: "text" | "list";
}
export interface Course {
    id: number;
    code: string;
    title: string;
    subtitle: string;
    description: string;
    objectives: string[];
    exitCriteria: string[];
    sections: Section[];
}
export interface Card {
    id: string;
    course: number;
    question: string;
    answer: string;
}
export interface ChoiceQuestion {
    id: string;
    course: number;
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
}
export interface Term {
    id: number;
    /** First teaching week of the term, matching the `week` used by milestones. */
    startWeek: number;
    /** ISO date (YYYY-MM-DD) the term starts. */
    startDate: string;
}
export interface MilestoneSpec {
    id: string;
    code?: string;
    title: string;
    termId: number;
    week: number;
    /** Share of the term result, e.g. 15 for 15%. */
    weightPercent: number;
    /** Percentage needed to clear it. Defaults to 40. */
    qualifying?: number;
    coversCourses?: number[];
}
export interface Subject {
    name: string;
    courses: Course[];
    cards?: Card[];
    questions?: ChoiceQuestion[];
    terms?: Term[];
    milestones?: MilestoneSpec[];
}
/** Text the learner pasted or uploaded, reduced to what the lab needs. */
export interface Material {
    title: string;
    summary: string[];
    keywords: string[];
    cards: {
        id: string;
        question: string;
        answer: string;
    }[];
    questions: {
        id: string;
        prompt: string;
        answer: string;
        explanation: string;
    }[];
}
export declare function stem(word: string): string;
export declare function tokens(text: string): string[];
export declare function firstSentence(text: string): string;
export declare function clip(text: string, max?: number): string;
/** Strips asides and long clauses so a definition reads in plain language. */
export declare function plainify(text: string): string;
/** One-edit tolerance, so a typo in one letter is not a missing marking point. */
export declare function mentions(answer: string, keyword: string): boolean;
export interface SectionMatch {
    courseId: number;
    section: Section;
    score: number;
}
export declare function courseOf(subject: Subject, courseId: number): Course;
/** Sections of one course ranked against the question. */
export declare function rankSections(subject: Subject, courseId: number, question: string): SectionMatch[];
/** The best section for a question across every course, used before giving up. */
export declare function searchAllSections(subject: Subject, question: string, limit?: number): SectionMatch[];
/** The section a question or card belongs to, for concept-level mastery. */
export declare function conceptFor(subject: Subject, courseId: number, text: string): string;
export type TutorIntent = "explain" | "simplify" | "summarise" | "keypoints" | "compare" | "steps" | "example" | "exam" | "quiz" | "help";
export interface Citation {
    courseId: number;
    courseTitle: string;
    section: string;
}
export interface PracticeQuestion {
    id: string;
    kind: "mcq" | "blank" | "short";
    course: number;
    prompt: string;
    options?: string[];
    correctIndex?: number;
    answer: string;
    explanation: string;
    keywords: string[];
    source?: string;
}
export interface TutorReply {
    intent: TutorIntent;
    title: string;
    body: string[];
    bullets: string[];
    citations: Citation[];
    followUps: string[];
    practice?: PracticeQuestion[];
}
export declare function detectIntent(question: string): TutorIntent;
/** Builds one grounded answer, citing the sections it came from. */
export declare function answerTutor(subject: Subject, courseId: number, question: string): TutorReply;
/** Auto-marked questions: the multiple-choice bank plus cloze cards. */
export declare function quizQuestions(subject: Subject, courseId: number, count?: number): PracticeQuestion[];
/** Written questions with a keyword rubric, one per exit criterion. */
export declare function writtenQuestions(subject: Subject, courseId: number, count?: number): PracticeQuestion[];
export interface ShortAnswerGrade {
    score: number;
    matched: string[];
    missed: string[];
    feedback: string;
}
/** Marking by keyword coverage, with the same one-edit tolerance as retrieval. */
export declare function gradeShortAnswer(question: PracticeQuestion, response: string): ShortAnswerGrade;
export declare const masteryLevels: readonly ["Unfamiliar", "Learning", "Familiar", "Mastered"];
export type MasteryLevel = (typeof masteryLevels)[number];
export interface MasteryState {
    level: MasteryLevel;
    index: number;
}
/** Two attempts before anything can be familiar, five before mastered. */
export declare function masteryLevel(correct: number, attempted: number): MasteryState;
export type CardRating = "again" | "good" | "easy";
export interface ReviewSchedule {
    intervalDays: number;
    ease: number;
    dueAt: string;
}
/** A small SM-2 style scheduler: enough for a due queue, nothing more. */
export declare function scheduleReview(rating: CardRating, previous?: {
    intervalDays?: number;
    ease?: number;
}, now?: Date): ReviewSchedule;
export interface StudyGuide {
    title: string;
    overview: string;
    sections: {
        title: string;
        points: string[];
    }[];
    keyTerms: {
        term: string;
        definition: string;
    }[];
    examTips: string[];
    source: "course" | "mixed";
}
export interface MatchPair {
    id: string;
    term: string;
    definition: string;
}
/** A written study guide: overview, one section per concept, key terms, tips. */
export declare function buildStudyGuide(subject: Subject, courseId: number, material?: Material | null): StudyGuide;
/** A timed-test paper: course questions interleaved with material questions. */
export declare function buildPracticeTest(subject: Subject, courseId: number, material?: Material | null, count?: number): PracticeQuestion[];
/** Terms and definitions for the matching game. */
export declare function buildMatchPairs(subject: Subject, courseId: number, material?: Material | null, count?: number): MatchPair[];
export interface ActivityInput {
    lessonDone: boolean;
    labsDone: number;
    labsTotal: number;
    projectsDone: number;
    projectsTotal: number;
}
/** Work done, with absent components renormalised rather than counted as zero. */
export declare function activityPercent(input: ActivityInput): number;
export interface ReadinessInput {
    milestones: {
        weight: number;
        score?: number;
    }[];
    conceptPercent?: number;
}
/** Weighted assessment average, falling back to concept accuracy, else null. */
export declare function readinessPercent(input: ReadinessInput): number | null;
export interface TermProjection {
    recordedWeight: number;
    totalWeight: number;
    score: number | null;
    passing: boolean;
    complete: boolean;
}
export declare function projectedTermScore(subject: Subject, scores: Record<string, number | undefined>, termId: number): TermProjection;
export declare function milestoneDate(subject: Subject, milestone: MilestoneSpec): Date;
export declare function daysUntil(date: Date, now?: Date): number;
export interface UpcomingMilestone {
    milestone: MilestoneSpec;
    date: Date;
    days: number;
}
export declare function nextMilestone(subject: Subject, cleared?: string[], now?: Date): UpcomingMilestone | null;
/** One all-day calendar event per milestone, in a single .ics string. */
export declare function milestonesToIcs(subject: Subject, now?: Date): string;
export interface SubjectKit {
    subject: Subject;
    answer: (courseId: number, question: string) => TutorReply;
    detectIntent: (question: string) => TutorIntent;
    search: (question: string, limit?: number) => SectionMatch[];
    quiz: (courseId: number, count?: number) => PracticeQuestion[];
    written: (courseId: number, count?: number) => PracticeQuestion[];
    grade: (question: PracticeQuestion, response: string) => ShortAnswerGrade;
    mastery: (correct: number, attempted: number) => MasteryState;
    studyGuide: (courseId: number, material?: Material | null) => StudyGuide;
    practiceTest: (courseId: number, material?: Material | null, count?: number) => PracticeQuestion[];
    matchPairs: (courseId: number, material?: Material | null, count?: number) => MatchPair[];
    activityPercent: (input: ActivityInput) => number;
    readinessPercent: (input: ReadinessInput) => number | null;
    projectedTermScore: (scores: Record<string, number | undefined>, termId: number) => TermProjection;
    nextMilestone: (cleared?: string[], now?: Date) => UpcomingMilestone | null;
    milestoneDate: (milestone: MilestoneSpec) => Date;
    milestonesToIcs: (now?: Date) => string;
}
/** Binds a subject once, so pages and hooks call `kit.answer(1, "…")`. */
export declare function createSubjectKit(subject: Subject): SubjectKit;
//# sourceMappingURL=index.d.ts.map