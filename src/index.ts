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

// ── The bundle you pass in ─────────────────────────────────────────────────

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
  cards: { id: string; question: string; answer: string }[];
  questions: { id: string; prompt: string; answer: string; explanation: string }[];
}

// ── Text utilities ─────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below
  between both but by can could did do does doing down during each few for from further had has have having
  he her here hers herself him himself his how i if in into is it its itself just me more most my myself no
  nor not now of off on once only or other our ours ourselves out over own same she should so some such than
  that the their theirs them themselves then there these they this those through to too under until up very
  was we were what when where which while who whom why will with would you your yours yourself yourselves
  explain describe define mean means tell give show make use used using work works thing things
  module please help question questions answer answers example examples`
    .split(/\s+/)
    .filter(Boolean),
);

export function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  return text
    .replace(/[^A-Za-z0-9'\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => stem(word.toLowerCase()))
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export function firstSentence(text: string): string {
  const parts = text
    .replace(/\*\*/g, "")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return (parts[0] ?? text).trim();
}

export function clip(text: string, max = 520): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return `${(end > 80 ? cut.slice(0, end + 1) : cut).trimEnd()}…`;
}

/** Strips asides and long clauses so a definition reads in plain language. */
export function plainify(text: string): string {
  return text
    .replace(/\s*\([^)]*\)/g, "")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((sentence) => sentence.trim())
    .join(" ");
}

/** One-edit tolerance, so a typo in one letter is not a missing marking point. */
export function mentions(answer: string, keyword: string): boolean {
  const needle = keyword.toLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return false;
  const haystack = ` ${answer.toLowerCase().replace(/\s+/g, " ")} `;
  if (haystack.includes(` ${needle} `)) return true;
  if (needle.length < 5) return false;
  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) => word.length > 1 && withinOneEdit(word, needle));
}

function withinOneEdit(word: string, target: string): boolean {
  if (Math.abs(word.length - target.length) > 1) return false;
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let i = 1; i <= word.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= target.length; j += 1) {
      const cost = word[i - 1] === target[j - 1] ? 0 : 1;
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost));
    }
    previous = current;
  }
  return previous[target.length] <= 1;
}

// ── Retrieval ──────────────────────────────────────────────────────────────

export interface SectionMatch {
  courseId: number;
  section: Section;
  score: number;
}

export function courseOf(subject: Subject, courseId: number): Course {
  return subject.courses.find((course) => course.id === courseId) ?? subject.courses[0];
}

/** Sections of one course ranked against the question. */
export function rankSections(subject: Subject, courseId: number, question: string): SectionMatch[] {
  const course = courseOf(subject, courseId);
  const terms = [...new Set(tokens(question))];
  return course.sections
    .map((section) => {
      const titleTerms = new Set(tokens(section.title));
      const bodyTerms = tokens(section.content);
      let score = 0;
      for (const term of terms) {
        if (titleTerms.has(term)) score += 4;
        score += bodyTerms.filter((word) => word === term).length;
      }
      return { courseId: course.id, section, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** The best section for a question across every course, used before giving up. */
export function searchAllSections(subject: Subject, question: string, limit = 4): SectionMatch[] {
  return subject.courses
    .map((course) => rankSections(subject, course.id, question)[0])
    .filter((match): match is SectionMatch => Boolean(match) && match.score > 0)
    .sort((a, b) => b.score - a.score || a.courseId - b.courseId)
    .slice(0, limit);
}

/** The section a question or card belongs to, for concept-level mastery. */
export function conceptFor(subject: Subject, courseId: number, text: string): string {
  const best = rankSections(subject, courseId, text)[0];
  return best && best.score > 0 ? best.section.title : courseOf(subject, courseId).title;
}

// ── Tutor ──────────────────────────────────────────────────────────────────

export type TutorIntent =
  | "explain"
  | "simplify"
  | "summarise"
  | "keypoints"
  | "compare"
  | "steps"
  | "example"
  | "exam"
  | "quiz"
  | "help";

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

export function detectIntent(question: string): TutorIntent {
  const text = question.toLowerCase();
  if (/\b(quiz|test me|drill|practice questions?)\b/.test(text)) return "quiz";
  if (/\b(likely|possible|exam|past paper|revision|will be on)\b/.test(text)) return "exam";
  if (/\b(difference|compare|versus|vs\.?|contrast|distinguish)\b/.test(text)) return "compare";
  if (/\b(step[- ]by[- ]step|steps|walk me through|procedure|protocol|how do i|how does)\b/.test(text))
    return "steps";
  if (/\b(like i'?m (12|ten|five|a child)|eli5|simple|simpler|plain english|in plain)\b/.test(text))
    return "simplify";
  if (/\b(summar(y|ise|ize)|notes|recap|overview|tl;?dr)\b/.test(text)) return "summarise";
  if (/\b(key ?points|takeaways?|main points|must know|important)\b/.test(text)) return "keypoints";
  if (/\b(example|examples|real[- ]world|case study|applied)\b/.test(text)) return "example";
  if (tokens(question).length === 0) return "help";
  return "explain";
}

function citationsFor(matches: SectionMatch[], subject: Subject): Citation[] {
  return matches
    .filter((match) => match.score > 0)
    .slice(0, 3)
    .map((match) => ({
      courseId: match.courseId,
      courseTitle: courseOf(subject, match.courseId).title,
      section: match.section.title,
    }));
}

function objectiveFor(course: Course, question: string): string | undefined {
  const asked = new Set(tokens(question));
  return course.objectives.find((objective) => {
    const objectiveTerms = new Set(tokens(objective));
    return [...asked].some((term) => objectiveTerms.has(term));
  });
}

/** Builds one grounded answer, citing the sections it came from. */
export function answerTutor(subject: Subject, courseId: number, question: string): TutorReply {
  const course = courseOf(subject, courseId);
  const intent = detectIntent(question);
  const matches = rankSections(subject, courseId, question);
  const best = matches[0];
  const related = matches.filter((match) => match.score > 0 && match !== best);
  const cards = (subject.cards ?? []).filter((card) => card.course === courseId);
  const citations = citationsFor(matches, subject);
  const topic = best && best.score > 0 ? best.section.title : course.title;
  const followUps = [
    `Explain ${topic.toLowerCase()} like I'm 12`,
    `Give me a practice question on ${topic.toLowerCase()}`,
    `Summarise ${course.title}`,
  ];

  if (intent === "quiz") {
    return {
      intent,
      title: `Practice questions — ${course.title}`,
      body: ["Auto-marked questions drawn from this course's bank and its cards."],
      bullets: [],
      citations: [],
      followUps: ["Summarise this course", "What are the key points?", "What is likely to be on the exam?"],
      practice: quizQuestions(subject, courseId, 6),
    };
  }

  if (intent === "summarise") {
    return {
      intent,
      title: `${course.title} in one page`,
      body: [course.description],
      bullets: course.sections.map((section) => `${section.title} — ${firstSentence(section.content)}`),
      citations: course.sections.slice(0, 3).map((section) => ({
        courseId: course.id,
        courseTitle: course.title,
        section: section.title,
      })),
      followUps: ["What are the key points?", "Quiz me on this course", "Explain that like I'm 12"],
    };
  }

  if (intent === "keypoints") {
    return {
      intent,
      title: `Non-negotiables in ${course.title}`,
      body: ["If you can do these from memory, you have the course."],
      bullets: [...course.objectives, ...course.exitCriteria.slice(0, 2).map((item) => `Check: ${item}`)],
      citations: course.sections.slice(0, 2).map((section) => ({
        courseId: course.id,
        courseTitle: course.title,
        section: section.title,
      })),
      followUps: ["Quiz me on this course", "Summarise this course", "What is likely to be on the exam?"],
    };
  }

  if (intent === "compare") {
    const local = matches.filter((match) => match.score > 0).slice(0, 2);
    // A comparison may straddle two courses, so widen the search when needed.
    const wider =
      local.length < 2
        ? searchAllSections(subject, question, 4).filter(
            (match) =>
              match.courseId !== courseId && !local.some((entry) => entry.section.title === match.section.title),
          )
        : [];
    const chosen = local.length === 2 ? local : [best, ...related, ...wider].slice(0, 2);
    const body =
      chosen.length === 2
        ? [`${chosen[0].section.title} — ${clip(chosen[0].section.content, 360)}`, `${chosen[1].section.title} — ${clip(chosen[1].section.content, 360)}`]
        : [clip(best.section.content)];
    return {
      intent,
      title: `Comparing: ${chosen.map((match) => match.section.title).join(" vs ") || course.title}`,
      body,
      bullets: cards.slice(0, 2).map((card) => firstSentence(card.answer)),
      citations: chosen.map((match) => ({
        courseId: match.courseId,
        courseTitle: courseOf(subject, match.courseId).title,
        section: match.section.title,
      })),
      followUps: ["Explain that like I'm 12", "Give me a real-world example", "Quiz me on this course"],
    };
  }

  if (intent === "steps") {
    const lines =
      best.section.type === "list"
        ? best.section.content
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.replace(/^\d+[.)]\s*/, ""))
        : course.exitCriteria;
    return {
      intent,
      title: `Step by step — ${best.section.title}`,
      body: [firstSentence(best.section.content)],
      bullets: lines,
      citations,
      followUps: [`Explain ${best.section.title.toLowerCase()} like I'm 12`, "Quiz me on this course", "What are the key points?"],
    };
  }

  if (intent === "simplify") {
    return {
      intent,
      title: `${topic} — in plain terms`,
      body: [plainify(best.section.content)],
      bullets: cards.slice(0, 2).map((card) => `${card.question} ${firstSentence(card.answer)}`),
      citations,
      followUps: ["Quiz me on this course", "Give me a real-world example", "Step by step: how does it work?"],
    };
  }

  if (intent === "example") {
    return {
      intent,
      title: `Where ${topic.toLowerCase()} shows up in practice`,
      body: [
        clip(best.section.content, 480),
        "Worked example: name one situation the concept applies to, state what it predicts, and say where it stops working.",
      ],
      bullets: cards.slice(0, 3).map((card) => firstSentence(card.answer)),
      citations,
      followUps: ["Quiz me on this course", "Explain that like I'm 12", "What are the key points?"],
    };
  }

  if (intent === "exam") {
    return {
      intent,
      title: `What ${course.title} is examined on`,
      body: ["Assessments are built from the course's exit criteria, so anything you are asked to *do* is fair game."],
      bullets: course.exitCriteria,
      citations,
      followUps: ["Quiz me on this course", "Summarise this course", "Explain that like I'm 12"],
      practice: quizQuestions(subject, courseId, 4),
    };
  }

  if (intent === "help") {
    return {
      intent,
      title: "Ask about anything in this course",
      body: [`I answer only from ${course.title} and the rest of this subject, so replies stay traceable.`],
      bullets: course.sections.slice(0, 5).map((section) => section.title),
      citations: [],
      followUps: ["Summarise this course", "What are the key points?", "Quiz me on this course"],
    };
  }

  if (best.score === 0) {
    const elsewhere = searchAllSections(subject, question, 3).filter((match) => match.courseId !== courseId);
    if (elsewhere.length > 0) {
      const [match] = elsewhere;
      const other = courseOf(subject, match.courseId);
      return {
        intent: "explain",
        title: `${match.section.title} — ${other.title}`,
        body: [
          `That is not in ${course.title}, but it is covered in ${other.title}:`,
          clip(match.section.content, 560),
        ],
        bullets: elsewhere.slice(1).map((entry) => `${courseOf(subject, entry.courseId).title}: ${entry.section.title}`),
        citations: elsewhere.map((entry) => ({
          courseId: entry.courseId,
          courseTitle: courseOf(subject, entry.courseId).title,
          section: entry.section.title,
        })),
        followUps: [`Summarise ${other.title}`, `Quiz me on ${other.title}`, "Give me a practice question on this"],
      };
    }

    return {
      intent: "help",
      title: `That is not in ${course.title}`,
      body: [`I could not find “${question.trim()}” in this subject, and I will not guess.`],
      bullets: course.sections.map((section) => section.title),
      citations: [],
      followUps: [`Summarise ${course.title}`, "What are the key points?", "Quiz me on this course"],
    };
  }

  const objective = objectiveFor(course, question);
  return {
    intent: "explain",
    title: topic,
    body: [
      clip(best.section.content, 620),
      objective
        ? `Why it matters: ${objective}`
        : `Why it matters: it sits inside ${course.title}, ${course.subtitle}.`,
    ],
    bullets: [
      ...related.slice(0, 3).map((match) => `Related: ${match.section.title}`),
      ...cards.slice(0, 2).map((card) => firstSentence(card.answer)),
    ],
    citations,
    followUps,
  };
}

// ── Practice and marking ───────────────────────────────────────────────────

function keywordsFrom(text: string, limit = 6): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of text.replace(/[^A-Za-z0-9'\-\s]/g, " ").split(/\s+/)) {
    const clean = word.replace(/^[-']+|[-']+$/g, "");
    const key = stem(clean.toLowerCase());
    if (clean.length < 5 || STOPWORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    keywords.push(clean);
    if (keywords.length === limit) break;
  }
  return keywords;
}

function blankFromCard(subject: Subject, card: Card): PracticeQuestion | null {
  const candidates = card.question
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z'-]/g, ""))
    .filter((word) => word.length >= 5 && !STOPWORDS.has(stem(word.toLowerCase())));
  if (candidates.length === 0) return null;
  const target = candidates.reduce((longest, word) => (word.length > longest.length ? word : longest));
  const prompt = card.question.replace(new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), "_____");
  return {
    id: `blank-${card.id}`,
    kind: "blank",
    course: card.course,
    prompt: `${prompt} (fill in the blank)`,
    answer: target,
    explanation: card.answer,
    keywords: [target],
    source: conceptFor(subject, card.course, card.question),
  };
}

/** Auto-marked questions: the multiple-choice bank plus cloze cards. */
export function quizQuestions(subject: Subject, courseId: number, count = 6): PracticeQuestion[] {
  const mcq = (subject.questions ?? [])
    .filter((question) => question.course === courseId)
    .map<PracticeQuestion>((question) => ({
      id: question.id,
      kind: "mcq",
      course: question.course,
      prompt: question.question,
      options: question.options,
      correctIndex: question.correctAnswer,
      answer: question.options[question.correctAnswer],
      explanation: question.explanation,
      keywords: [question.options[question.correctAnswer]],
      source: conceptFor(subject, question.course, question.question),
    }));

  const blanks = (subject.cards ?? [])
    .filter((card) => card.course === courseId)
    .map((card) => blankFromCard(subject, card))
    .filter((question): question is PracticeQuestion => question !== null);

  return [...mcq, ...blanks].slice(0, count);
}

/** Written questions with a keyword rubric, one per exit criterion. */
export function writtenQuestions(subject: Subject, courseId: number, count = 3): PracticeQuestion[] {
  const course = courseOf(subject, courseId);
  return course.exitCriteria.slice(0, count).map((criterion, index) => {
    const best = rankSections(subject, courseId, criterion)[0];
    const answer = best?.section.content ?? course.description;
    return {
      id: `short-${course.id}-${index}`,
      kind: "short",
      course: course.id,
      prompt: criterion,
      answer,
      explanation: best ? `Modelled on “${best.section.title}”.` : "",
      keywords: keywordsFrom(answer),
      source: best?.section.title ?? course.title,
    };
  });
}

export interface ShortAnswerGrade {
  score: number;
  matched: string[];
  missed: string[];
  feedback: string;
}

/** Marking by keyword coverage, with the same one-edit tolerance as retrieval. */
export function gradeShortAnswer(question: PracticeQuestion, response: string): ShortAnswerGrade {
  const matched = question.keywords.filter((keyword) => mentions(response, keyword));
  const missed = question.keywords.filter((keyword) => !matched.includes(keyword));
  const coverage = question.keywords.length === 0 ? 0 : matched.length / question.keywords.length;
  const words = response.trim() ? response.trim().split(/\s+/).length : 0;

  let score = Math.round(coverage * 100);
  if (words === 0) score = 0;
  else if (words < 5) score = Math.min(score, 30);

  const feedback =
    words === 0
      ? "Nothing written yet — a one-line definition plus one example earns partial credit."
      : score >= 80
        ? "That covers the marking points. Tighten the order: principle, then application, then limitation."
        : score >= 50
          ? `Solid start. Add: ${missed.slice(0, 3).join(", ") || "a concrete example"}.`
          : `Too thin for the rubric. Use the terms: ${question.keywords.slice(0, 4).join(", ")}.`;

  return { score, matched, missed, feedback };
}

// ── Mastery and spacing ────────────────────────────────────────────────────

export const masteryLevels = ["Unfamiliar", "Learning", "Familiar", "Mastered"] as const;
export type MasteryLevel = (typeof masteryLevels)[number];

export interface MasteryState {
  level: MasteryLevel;
  index: number;
}

/** Two attempts before anything can be familiar, five before mastered. */
export function masteryLevel(correct: number, attempted: number): MasteryState {
  if (attempted === 0) return { level: "Unfamiliar", index: 0 };
  const accuracy = correct / attempted;
  if (attempted < 2 || accuracy < 0.6) return { level: "Learning", index: 1 };
  if (accuracy >= 0.8 && attempted >= 5) return { level: "Mastered", index: 3 };
  return { level: "Familiar", index: 2 };
}

export type CardRating = "again" | "good" | "easy";

export interface ReviewSchedule {
  intervalDays: number;
  ease: number;
  dueAt: string;
}

/** A small SM-2 style scheduler: enough for a due queue, nothing more. */
export function scheduleReview(
  rating: CardRating,
  previous?: { intervalDays?: number; ease?: number },
  now: Date = new Date(),
): ReviewSchedule {
  const easeBefore = previous?.ease ?? 2.5;
  const intervalBefore = previous?.intervalDays ?? 0;
  let ease = easeBefore;
  let intervalDays: number;

  if (rating === "again") {
    ease = Math.max(1.3, Math.round((easeBefore - 0.2) * 100) / 100);
    intervalDays = 0;
  } else if (rating === "good") {
    intervalDays = intervalBefore === 0 ? 1 : Math.max(2, Math.round(intervalBefore * easeBefore));
  } else {
    ease = Math.min(3.2, Math.round((easeBefore + 0.1) * 100) / 100);
    intervalDays = intervalBefore === 0 ? 3 : Math.max(4, Math.round(intervalBefore * easeBefore * 1.3));
  }

  return { intervalDays, ease, dueAt: new Date(now.getTime() + intervalDays * 86_400_000).toISOString() };
}

// ── Study lab ──────────────────────────────────────────────────────────────

export interface StudyGuide {
  title: string;
  overview: string;
  sections: { title: string; points: string[] }[];
  keyTerms: { term: string; definition: string }[];
  examTips: string[];
  source: "course" | "mixed";
}

export interface MatchPair {
  id: string;
  term: string;
  definition: string;
}

function pointsFor(content: string): string[] {
  const lines = content
    .split("\n")
    .map((line) => line.replace(/\*\*/g, "").replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 6).map((line) => clip(line, 200));
  return content
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((sentence) => clip(sentence, 200));
}

/** A written study guide: overview, one section per concept, key terms, tips. */
export function buildStudyGuide(subject: Subject, courseId: number, material?: Material | null): StudyGuide {
  const course = courseOf(subject, courseId);
  const sections = course.sections.map((section) => ({ title: section.title, points: pointsFor(section.content) }));

  const keyTerms: { term: string; definition: string }[] = [];
  const seen = new Set<string>();
  const addTerm = (term: string, definition: string) => {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key) || !definition.trim()) return;
    seen.add(key);
    keyTerms.push({ term: term.trim(), definition: clip(definition, 180) });
  };

  for (const section of course.sections) addTerm(section.title, firstSentence(section.content));

  if (material) {
    for (const keyword of material.keywords.slice(0, 8)) {
      const definition =
        material.summary.find((line) => line.toLowerCase().includes(keyword.toLowerCase())) ??
        material.cards.find((card) => card.answer.toLowerCase() === keyword.toLowerCase())?.question ??
        "";
      addTerm(keyword, definition);
    }
    if (material.summary.length > 0) {
      sections.push({ title: `From your material — ${material.title}`, points: material.summary.slice(0, 6).map((line) => clip(line, 200)) });
    }
  }

  const titles = course.sections.map((section) => section.title);
  return {
    title: course.title,
    overview: course.description,
    sections,
    keyTerms: keyTerms.slice(0, 10),
    examTips: [
      `Be ready to define ${titles.slice(0, 3).join(", ")} from memory, each in one sentence.`,
      ...course.objectives.slice(0, 4).map((objective) => `You should be able to: ${objective}`),
      "Answer every applied question in the same shape: state the method, name its limit, say what it supports.",
    ],
    source: material ? "mixed" : "course",
  };
}

/** A timed-test paper: course questions interleaved with material questions. */
export function buildPracticeTest(
  subject: Subject,
  courseId: number,
  material?: Material | null,
  count = 8,
): PracticeQuestion[] {
  const fromCourse = quizQuestions(subject, courseId, 20);
  const fromMaterial: PracticeQuestion[] = [
    ...(material?.questions ?? []).map<PracticeQuestion>((question) => ({
      id: `material-${question.id}`,
      kind: "blank",
      course: courseId,
      prompt: question.prompt,
      answer: question.answer,
      explanation: question.explanation,
      keywords: [question.answer],
      source: material?.title,
    })),
    ...(material?.cards ?? []).map<PracticeQuestion>((card) => ({
      id: `material-card-${card.id}`,
      kind: "blank",
      course: courseId,
      prompt: card.question,
      answer: card.answer,
      explanation: card.question.replace("_____", card.answer),
      keywords: [card.answer],
      source: material?.title,
    })),
  ];

  const interleaved: PracticeQuestion[] = [];
  const longest = Math.max(fromCourse.length, fromMaterial.length);
  for (let index = 0; index < longest; index += 1) {
    if (fromMaterial[index]) interleaved.push(fromMaterial[index]);
    if (fromCourse[index]) interleaved.push(fromCourse[index]);
  }

  const seen = new Set<string>();
  const output: PracticeQuestion[] = [];
  for (const question of interleaved) {
    const key = question.prompt.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(question);
    if (output.length >= count) break;
  }
  return output;
}

/** Terms and definitions for the matching game. */
export function buildMatchPairs(
  subject: Subject,
  courseId: number,
  material?: Material | null,
  count = 6,
): MatchPair[] {
  const course = courseOf(subject, courseId);
  const pairs: MatchPair[] = course.sections.map((section, index) => ({
    id: `section-${index}`,
    term: section.title,
    definition: clip(firstSentence(section.content), 150),
  }));

  for (const [index, card] of (material?.cards ?? []).entries()) {
    pairs.push({ id: `material-${index}`, term: clip(card.answer, 60), definition: clip(card.question, 150) });
  }

  const seen = new Set<string>();
  return pairs
    .filter((pair) => {
      const key = pair.term.trim().toLowerCase();
      if (!key || seen.has(key) || !pair.definition) return false;
      seen.add(key);
      return true;
    })
    .slice(0, count);
}

// ── Progress maths ─────────────────────────────────────────────────────────

export interface ActivityInput {
  lessonDone: boolean;
  labsDone: number;
  labsTotal: number;
  projectsDone: number;
  projectsTotal: number;
}

/** Work done, with absent components renormalised rather than counted as zero. */
export function activityPercent(input: ActivityInput): number {
  const parts: { weight: number; done: number }[] = [{ weight: 0.4, done: input.lessonDone ? 1 : 0 }];
  if (input.labsTotal > 0) parts.push({ weight: 0.3, done: Math.min(1, input.labsDone / input.labsTotal) });
  if (input.projectsTotal > 0) parts.push({ weight: 0.3, done: Math.min(1, input.projectsDone / input.projectsTotal) });

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round((parts.reduce((sum, part) => sum + part.weight * part.done, 0) / totalWeight) * 100);
}

export interface ReadinessInput {
  milestones: { weight: number; score?: number }[];
  conceptPercent?: number;
}

/** Weighted assessment average, falling back to concept accuracy, else null. */
export function readinessPercent(input: ReadinessInput): number | null {
  const sat = input.milestones.filter(
    (milestone): milestone is { weight: number; score: number } =>
      typeof milestone.score === "number" && Number.isFinite(milestone.score),
  );

  if (sat.length > 0) {
    const weight = sat.reduce((sum, milestone) => sum + Math.max(1, milestone.weight), 0);
    const earned = sat.reduce(
      (sum, milestone) => sum + Math.max(1, milestone.weight) * Math.min(100, Math.max(0, milestone.score)),
      0,
    );
    return Math.round(earned / weight);
  }

  if (typeof input.conceptPercent === "number" && Number.isFinite(input.conceptPercent)) {
    return Math.round(Math.min(100, Math.max(0, input.conceptPercent)));
  }
  return null;
}

export interface TermProjection {
  recordedWeight: number;
  totalWeight: number;
  score: number | null;
  passing: boolean;
  complete: boolean;
}

export function projectedTermScore(
  subject: Subject,
  scores: Record<string, number | undefined>,
  termId: number,
): TermProjection {
  const milestones = (subject.milestones ?? []).filter((milestone) => milestone.termId === termId);
  const totalWeight = milestones.reduce((sum, milestone) => sum + milestone.weightPercent, 0);
  const sat = milestones.filter((milestone) => {
    const score = scores[milestone.id];
    return typeof score === "number" && Number.isFinite(score);
  });
  const recordedWeight = sat.reduce((sum, milestone) => sum + milestone.weightPercent, 0);
  const score =
    recordedWeight > 0
      ? Math.round(sat.reduce((sum, milestone) => sum + milestone.weightPercent * (scores[milestone.id] as number), 0) / recordedWeight)
      : null;

  return {
    recordedWeight,
    totalWeight,
    score,
    passing: recordedWeight > 0 && (score ?? 0) >= 40,
    complete: milestones.length > 0 && sat.length === milestones.length,
  };
}

// ── Deadlines ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function milestoneDate(subject: Subject, milestone: MilestoneSpec): Date {
  const term = (subject.terms ?? []).find((entry) => entry.id === milestone.termId) ?? subject.terms?.[0];
  if (!term) return new Date(0);
  const [year, month, day] = term.startDate.split("-").map(Number);
  const offsetWeeks = Math.max(0, milestone.week - term.startWeek);
  return new Date(new Date(year, month - 1, day).getTime() + offsetWeeks * 7 * DAY_MS);
}

export function daysUntil(date: Date, now: Date = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / DAY_MS);
}

export interface UpcomingMilestone {
  milestone: MilestoneSpec;
  date: Date;
  days: number;
}

export function nextMilestone(
  subject: Subject,
  cleared: string[] = [],
  now: Date = new Date(),
): UpcomingMilestone | null {
  const pending = (subject.milestones ?? [])
    .filter((milestone) => !cleared.includes(milestone.id))
    .map((milestone) => {
      const date = milestoneDate(subject, milestone);
      return { milestone, date, days: daysUntil(date, now) };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.milestone.week - b.milestone.week);
  return pending.find((entry) => entry.days >= 0) ?? pending[0] ?? null;
}

const pad = (value: number) => String(value).padStart(2, "0");
const icsDate = (date: Date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
const icsEscape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** One all-day calendar event per milestone, in a single .ics string. */
export function milestonesToIcs(subject: Subject, now: Date = new Date()): string {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours(),
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${icsEscape(subject.name)}//Milestones//EN`, "CALSCALE:GREGORIAN"];

  for (const milestone of subject.milestones ?? []) {
    const date = milestoneDate(subject, milestone);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${milestone.id}@study-kit`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(date)}`,
      `DTEND;VALUE=DATE:${icsDate(new Date(date.getTime() + DAY_MS))}`,
      `SUMMARY:${icsEscape(`${milestone.code ?? milestone.id} — ${milestone.title}`)}`,
      `DESCRIPTION:${icsEscape(`${milestone.weightPercent}% of the term · pass ${milestone.qualifying ?? 40}%`)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

// ── One call to bind it all ────────────────────────────────────────────────

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
export function createSubjectKit(subject: Subject): SubjectKit {
  return {
    subject,
    answer: (courseId, question) => answerTutor(subject, courseId, question),
    detectIntent,
    search: (question, limit) => searchAllSections(subject, question, limit),
    quiz: (courseId, count) => quizQuestions(subject, courseId, count),
    written: (courseId, count) => writtenQuestions(subject, courseId, count),
    grade: gradeShortAnswer,
    mastery: masteryLevel,
    studyGuide: (courseId, material) => buildStudyGuide(subject, courseId, material),
    practiceTest: (courseId, material, count) => buildPracticeTest(subject, courseId, material, count),
    matchPairs: (courseId, material, count) => buildMatchPairs(subject, courseId, material, count),
    activityPercent,
    readinessPercent,
    projectedTermScore: (scores, termId) => projectedTermScore(subject, scores, termId),
    nextMilestone: (cleared, now) => nextMilestone(subject, cleared, now),
    milestoneDate: (milestone) => milestoneDate(subject, milestone),
    milestonesToIcs: (now) => milestonesToIcs(subject, now),
  };
}
