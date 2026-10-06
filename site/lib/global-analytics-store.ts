import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  isPsychologyAnalysis,
  type PsychologyAnalysis,
} from '@/lib/psychology';

export interface StoredAnalyticsSession {
  sessionId: string;
  updatedAt: string;
  activitiesCount: number;
  analysis: PsychologyAnalysis;
}

const MAX_STORED_SESSIONS = 5_000;
let writeQueue: Promise<void> = Promise.resolve();

const analyticsPath = () =>
  process.env.ANALYTICS_DATA_PATH || '/tmp/trail-game-analytics.json';

const isStoredSession = (value: unknown): value is StoredAnalyticsSession => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<StoredAnalyticsSession>;
  return (
    typeof record.sessionId === 'string' &&
    typeof record.updatedAt === 'string' &&
    typeof record.activitiesCount === 'number' &&
    Number.isFinite(record.activitiesCount) &&
    isPsychologyAnalysis(record.analysis)
  );
};

export const readGlobalSessions = async (): Promise<
  StoredAnalyticsSession[]
> => {
  try {
    const raw = await readFile(analyticsPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isStoredSession).slice(-MAX_STORED_SESSIONS)
      : [];
  } catch (reason) {
    if (
      reason &&
      typeof reason === 'object' &&
      'code' in reason &&
      reason.code === 'ENOENT'
    ) {
      return [];
    }
    throw reason;
  }
};

export const saveGlobalSession = async (session: StoredAnalyticsSession) => {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const sessions = await readGlobalSessions();
      const next = [
        ...sessions.filter((item) => item.sessionId !== session.sessionId),
        session,
      ].slice(-MAX_STORED_SESSIONS);
      const target = analyticsPath();
      const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(temporary, JSON.stringify(next), 'utf8');
      await rename(temporary, target);
    });
  return writeQueue;
};
