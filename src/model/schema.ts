import { z } from 'zod';

export const KINDS = ['session', 'job', 'goal', 'ask'] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_DIR: Record<Kind, string> = {
  session: 'sessions',
  job: 'jobs',
  goal: 'goals',
  ask: 'asks',
};

export const KIND_PREFIX: Record<Kind, string> = {
  session: 's',
  job: 'j',
  goal: 'g',
  ask: 'a',
};

export const AGENTS = ['codex', 'claude', 'cursor', 'other'] as const;
export const SESSION_STATUSES = ['working', 'waiting', 'idle', 'ended'] as const;
export const JOB_STATES = ['running', 'done', 'failed', 'cancelled'] as const;
export const GOAL_STATUSES = ['active', 'done', 'dropped'] as const;
export const STEP_STATUSES = ['todo', 'doing', 'done', 'blocked'] as const;
export const ASK_KINDS = ['question', 'blocked', 'approval', 'review'] as const;
export const ASK_STATES = ['open', 'resolved'] as const;

const timestamp = z.string();
const nullableString = z.string().nullable();
const nullableInt = z.number().int().nullable();

export const SessionSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  agent: z.enum(AGENTS),
  title: z.string(),
  project: z.string(),
  status: z.enum(SESSION_STATUSES),
  summary: nullableString,
  started_at: timestamp,
  updated_at: timestamp,
  ended_at: timestamp.nullable(),
});

export const JobSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  session: nullableString,
  title: z.string(),
  project: z.string(),
  command: nullableString,
  host: z.string(),
  pid: nullableInt,
  child_pid: nullableInt,
  state: z.enum(JOB_STATES),
  exit_code: nullableInt,
  message: nullableString,
  log: nullableString,
  started_at: timestamp,
  updated_at: timestamp,
  ended_at: timestamp.nullable(),
});

export const StepSchema = z.object({
  text: z.string(),
  status: z.enum(STEP_STATUSES),
});

export const GoalSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  session: nullableString,
  title: z.string(),
  project: z.string(),
  status: z.enum(GOAL_STATUSES),
  steps: z.array(StepSchema),
  created_at: timestamp,
  updated_at: timestamp,
});

export const AskSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  session: nullableString,
  project: z.string(),
  kind: z.enum(ASK_KINDS),
  text: z.string(),
  state: z.enum(ASK_STATES),
  created_at: timestamp,
  resolved_at: timestamp.nullable(),
});

export type Session = z.infer<typeof SessionSchema>;
export type Job = z.infer<typeof JobSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type Ask = z.infer<typeof AskSchema>;

export type EntityOf<K extends Kind> = K extends 'session'
  ? Session
  : K extends 'job'
    ? Job
    : K extends 'goal'
      ? Goal
      : Ask;

export type Entity = Session | Job | Goal | Ask;

export const SCHEMAS = {
  session: SessionSchema,
  job: JobSchema,
  goal: GoalSchema,
  ask: AskSchema,
} as const;
