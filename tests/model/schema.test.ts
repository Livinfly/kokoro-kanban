import { describe, expect, it } from 'vitest';
import { AskSchema, GoalSchema, JobSchema, SessionSchema } from '../../src/model/schema.js';
import { makeAsk, makeGoal, makeJob, makeSession } from '../fixtures.js';

describe('schemas', () => {
  it('accept valid entities', () => {
    expect(SessionSchema.safeParse(makeSession()).success).toBe(true);
    expect(JobSchema.safeParse(makeJob({ pid: null })).success).toBe(true);
    expect(GoalSchema.safeParse(makeGoal({ steps: [{ text: 'a', status: 'doing' }] })).success).toBe(true);
    expect(AskSchema.safeParse(makeAsk()).success).toBe(true);
  });

  it('reject unknown enum values', () => {
    expect(SessionSchema.safeParse({ ...makeSession(), status: 'bogus' }).success).toBe(false);
    expect(JobSchema.safeParse({ ...makeJob(), state: 'paused' }).success).toBe(false);
    expect(AskSchema.safeParse({ ...makeAsk(), kind: 'whatever' }).success).toBe(false);
  });

  it('reject a wrong version', () => {
    expect(SessionSchema.safeParse({ ...makeSession(), v: 2 }).success).toBe(false);
  });
});
