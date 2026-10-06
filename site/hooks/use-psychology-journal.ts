'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANALYSIS_STORAGE_KEY,
  JOURNEY_STORAGE_KEY,
  MAX_JOURNEY_ACTIVITIES,
  SESSION_STORAGE_KEY,
  hasAllCreativeModes,
  isJourneyActivity,
  isPsychologyAnalysis,
  type AnalysisStatus,
  type JourneyActivity,
  type PsychologyAnalysis,
} from '@/lib/psychology';

interface AnalysisResponse {
  analysis?: unknown;
  error?: string;
}

const readStoredActivities = (): JourneyActivity[] => {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(JOURNEY_STORAGE_KEY) ?? '[]',
    );
    return Array.isArray(value)
      ? value.filter(isJourneyActivity).slice(-MAX_JOURNEY_ACTIVITIES)
      : [];
  } catch {
    return [];
  }
};

const readStoredAnalysis = (): PsychologyAnalysis | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(ANALYSIS_STORAGE_KEY) ?? 'null',
    );
    return isPsychologyAnalysis(value) ? value : null;
  } catch {
    return null;
  }
};

const persist = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The game remains usable when storage is unavailable.
  }
};

const getOrCreateSessionId = () => {
  const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (stored) return stored;
  const sessionId =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  persist(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
};

export function usePsychologyJournal() {
  const requestSequence = useRef(0);
  const [activities, setActivities] = useState<JourneyActivity[]>([]);
  const [analysis, setAnalysis] = useState<PsychologyAnalysis | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [error, setError] = useState('');

  const requestAnalysis = useCallback(async (next: JourneyActivity[]) => {
    if (!hasAllCreativeModes(next)) {
      setStatus('idle');
      return;
    }
    requestSequence.current += 1;
    const requestId = requestSequence.current;
    setStatus('loading');
    setError('');

    try {
      const response = await fetch('/api/psychology-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activities: next,
          sessionId: getOrCreateSessionId(),
        }),
      });
      const payload = (await response.json()) as AnalysisResponse;
      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : 'Дневник пока не может сделать запись.',
        );
      }
      if (!isPsychologyAnalysis(payload.analysis)) {
        throw new Error(
          'Дневник получил незавершённую запись. Попробуй ещё раз.',
        );
      }

      if (requestId !== requestSequence.current) return;

      setAnalysis(payload.analysis);
      setStatus('ready');
      persist(ANALYSIS_STORAGE_KEY, payload.analysis);
    } catch (reason) {
      if (requestId !== requestSequence.current) return;
      setStatus('error');
      setError(
        reason instanceof Error
          ? reason.message
          : 'Дневник пока не может сделать запись.',
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedActivities = readStoredActivities();
      const storedAnalysis = readStoredAnalysis();
      setActivities(storedActivities);
      setAnalysis(storedAnalysis);
      if (storedAnalysis && hasAllCreativeModes(storedActivities)) {
        setStatus('ready');
      } else if (hasAllCreativeModes(storedActivities)) {
        void requestAnalysis(storedActivities);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestAnalysis]);

  const recordActivity = useCallback(
    (activity: JourneyActivity) => {
      const current = activities.filter((item) => item.id !== activity.id);
      const next = [...current, activity].slice(-MAX_JOURNEY_ACTIVITIES);
      setActivities(next);
      persist(JOURNEY_STORAGE_KEY, next);
      if (hasAllCreativeModes(next)) void requestAnalysis(next);
    },
    [activities, requestAnalysis],
  );

  const retryAnalysis = useCallback(() => {
    if (hasAllCreativeModes(activities)) void requestAnalysis(activities);
  }, [activities, requestAnalysis]);

  const clearJournal = useCallback(() => {
    requestSequence.current += 1;
    setActivities([]);
    setAnalysis(null);
    setStatus('idle');
    setError('');
    try {
      window.localStorage.removeItem(JOURNEY_STORAGE_KEY);
      window.localStorage.removeItem(ANALYSIS_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Nothing else is required when storage is unavailable.
    }
  }, []);

  return {
    activities,
    analysis,
    status,
    error,
    isUnlocked: hasAllCreativeModes(activities),
    recordActivity,
    retryAnalysis,
    clearJournal,
  };
}
