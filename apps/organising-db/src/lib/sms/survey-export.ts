/**
 * Shaping for the survey answer export.
 *
 * The original export was long: one row per (session, answered
 * question). That is the right shape for a database and the wrong one
 * for the person who asked for it — reading how one member answered
 * meant scanning nine rows, and comparing members meant a pivot table
 * before any analysis could start.
 *
 * Wide is the default now: one row per respondent, one column per
 * question. Long is still available, because a row-per-answer file is
 * genuinely easier to load into a stats tool.
 *
 * Both a parsed and a verbatim column are emitted per question. The
 * parsed value is what the survey engine understood ("yes"); the raw
 * body is what the member actually wrote ("Yes we need a minimum
 * increase of around 20%"). On this data those differ for most
 * non-scale answers, and the difference is often the most useful thing
 * in the file — dropping it by default would quietly discard the
 * substance of the survey.
 *
 * Open text is the sharper case: `parsed_value` is capped at 50
 * characters by the runtime, so for a free-text question it holds a
 * fragment that LOOKS like a complete answer. The full reply lives only
 * in `raw_body`, so open text leads with the raw body and the parsed
 * fragment is not repeated.
 *
 * Pure module — unit tested in __tests__/survey-export.ts.
 */

export interface ExportQuestion {
  question_id: number;
  /** 1-based position among live questions, in sort order. */
  number: number;
  prompt: string;
  qtype: string;
  retired_at?: string | null;
}

export interface ExportAnswer {
  question_id: number;
  parsed_value: string | null;
  raw_body: string | null;
  invalid_attempts: number;
  received_at: string;
}

export interface ExportSession {
  session_id: number;
  worker_id: number;
  worker_name: string;
  employer_name: string | null;
  phone_e164: string;
  state: string;
  invited_at: string | null;
  first_answer_at: string | null;
  completed_at: string | null;
}

/** Long prompts make a header unusable in a spreadsheet's column view. */
const MAX_HEADER_PROMPT = 60;

/**
 * Column name for a question.
 *
 * The number leads so columns sort and read in survey order, and so two
 * questions sharing wording still get distinct headers — a duplicate
 * header would silently collapse into one column when the CSV is
 * parsed.
 */
export function questionColumn(question: ExportQuestion): string {
  const prompt = (question.prompt ?? "").replace(/\s+/g, " ").trim();
  const short =
    prompt.length > MAX_HEADER_PROMPT
      ? `${prompt.slice(0, MAX_HEADER_PROMPT - 1).trimEnd()}…`
      : prompt;
  const retired = question.retired_at ? " [retired]" : "";
  return short ? `Q${question.number}. ${short}${retired}` : `Q${question.number}${retired}`;
}

export function verbatimColumn(question: ExportQuestion): string {
  return `${questionColumn(question)} — verbatim`;
}

/** Respondent columns, in the order they should appear. */
export const RESPONDENT_COLUMNS = [
  "worker_name",
  "employer",
  "phone_e164",
  "worker_id",
  "session_id",
  "status",
  "answered",
  "questions",
  "invalid_replies",
  "invited_at",
  "first_answer_at",
  "completed_at",
] as const;

export interface WideExportResult {
  headers: string[];
  rows: Record<string, unknown>[];
}

/**
 * One row per respondent.
 *
 * Every row carries every column, including empty ones: the CSV writer
 * takes its headers from the first row, so a row that omitted an
 * unanswered question would shift every later column on that line.
 */
export function buildWideSurveyExport(args: {
  sessions: ExportSession[];
  questions: ExportQuestion[];
  answersBySession: Map<number, ExportAnswer[]>;
  includeVerbatim?: boolean;
}): WideExportResult {
  const { sessions, questions, answersBySession } = args;
  const includeVerbatim = args.includeVerbatim !== false;

  const headers: string[] = [...RESPONDENT_COLUMNS];
  for (const q of questions) {
    headers.push(questionColumn(q));
    if (includeVerbatim) headers.push(verbatimColumn(q));
  }

  const rows = sessions.map((s) => {
    const answers = answersBySession.get(s.session_id) ?? [];
    const byQuestion = new Map(answers.map((a) => [a.question_id, a]));
    const answered = answers.filter((a) => a.parsed_value != null).length;
    const invalid = answers.reduce(
      (sum, a) => sum + (a.invalid_attempts ?? 0),
      0,
    );

    const row: Record<string, unknown> = {
      worker_name: s.worker_name,
      employer: s.employer_name ?? "",
      phone_e164: s.phone_e164,
      worker_id: s.worker_id,
      session_id: s.session_id,
      status: s.state,
      answered,
      questions: questions.length,
      invalid_replies: invalid,
      invited_at: s.invited_at ?? "",
      first_answer_at: s.first_answer_at ?? "",
      completed_at: s.completed_at ?? "",
    };

    for (const q of questions) {
      const a = byQuestion.get(q.question_id);
      const parsed = a?.parsed_value ?? "";
      const raw = a?.raw_body ?? "";
      // Free text has no code to analyse and a parsed value truncated
      // at 50 characters, so the raw reply IS the answer. Coded types
      // lead with the code and keep the raw reply beside it.
      const primary = q.qtype === "open_text" ? raw || parsed : parsed;
      row[questionColumn(q)] = primary;
      if (includeVerbatim) {
        // Only worth a cell when it adds something the primary column
        // does not — otherwise it duplicates its neighbour on every
        // scale answer.
        row[verbatimColumn(q)] = raw && raw !== primary ? raw : "";
      }
    }
    return row;
  });

  return { headers, rows };
}

/**
 * One row per answered question, plus a single answerless row per
 * session so funnel states stay visible in the same file. This is the
 * pre-existing shape, kept for anyone loading the file into a tool that
 * prefers it.
 */
export function buildLongSurveyExport(args: {
  sessions: ExportSession[];
  questions: ExportQuestion[];
  answersBySession: Map<number, ExportAnswer[]>;
}): WideExportResult {
  const { sessions, questions, answersBySession } = args;
  const byId = new Map(questions.map((q) => [q.question_id, q]));
  const headers = [
    "session_id",
    "worker_id",
    "worker_name",
    "employer",
    "phone_e164",
    "session_state",
    "invited_at",
    "first_answer_at",
    "completed_at",
    "question_no",
    "question",
    "qtype",
    "parsed_value",
    "raw_body",
    "invalid_attempts",
    "received_at",
  ];

  const rows: Record<string, unknown>[] = [];
  for (const s of sessions) {
    const base = {
      session_id: s.session_id,
      worker_id: s.worker_id,
      worker_name: s.worker_name,
      employer: s.employer_name ?? "",
      phone_e164: s.phone_e164,
      session_state: s.state,
      invited_at: s.invited_at ?? "",
      first_answer_at: s.first_answer_at ?? "",
      completed_at: s.completed_at ?? "",
    };
    const answers = [...(answersBySession.get(s.session_id) ?? [])].sort(
      (a, b) =>
        (byId.get(a.question_id)?.number ?? 0) -
        (byId.get(b.question_id)?.number ?? 0),
    );
    if (answers.length === 0) {
      rows.push({
        ...base,
        question_no: "",
        question: "",
        qtype: "",
        parsed_value: "",
        raw_body: "",
        invalid_attempts: "",
        received_at: "",
      });
      continue;
    }
    for (const a of answers) {
      const q = byId.get(a.question_id);
      rows.push({
        ...base,
        question_no: q?.number ?? "",
        question: q?.prompt ?? `#${a.question_id}`,
        qtype: q?.qtype ?? "",
        parsed_value: a.parsed_value ?? "",
        raw_body: a.raw_body ?? "",
        invalid_attempts: a.invalid_attempts,
        received_at: a.received_at,
      });
    }
  }

  return { headers, rows };
}
