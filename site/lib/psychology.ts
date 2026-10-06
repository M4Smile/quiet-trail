import type { TaskMode } from '@/lib/story-generator';

export type AnalysisConfidence = 'low' | 'medium' | 'high';

export type PersonalityTraitTag =
  | 'organized'
  | 'persistent'
  | 'cautious'
  | 'adaptable'
  | 'independent'
  | 'expressive'
  | 'curious'
  | 'sensitive'
  | 'decisive'
  | 'reflective';

export interface ColorSignal {
  color: string;
  uses: number;
}

export interface PaintingActivitySignals {
  kind: 'painting';
  mode: 'color-scene' | 'weather';
  colors: ColorSignal[];
  actions: number;
  filledRegions?: number;
  recoloredRegions?: number;
  strokes?: number;
  averageStrokeSpeed?: number;
}

export interface SculptureActivitySignals {
  kind: 'sculpture';
  parts: Array<{
    id: string;
    label: string;
    category: 'body' | 'eyes' | 'detail';
    x: number;
    y: number;
    size: number;
    rotation: number;
    flipped: boolean;
    source?: 'starter' | 'player-added';
  }>;
  additions: number;
  deletions: number;
  transforms: number;
  mirrors: number;
  layerMoves: number;
}

export interface MusicActivitySignals {
  kind: 'music';
  tempo: number;
  weight: number;
  layers: Array<{
    layer: number;
    notes: Array<{ step: number; pitch: number }>;
  }>;
  clearCount: number;
}

export type ActivitySignals =
  | PaintingActivitySignals
  | SculptureActivitySignals
  | MusicActivitySignals;

export interface JourneyActivity {
  id: string;
  completedAt: string;
  taskMode: TaskMode;
  taskTitle: string;
  location: string;
  character: string;
  durationSeconds: number;
  signals: ActivitySignals;
}

export interface AnalysisConcern {
  title: string;
  description: string;
  evidence: string[];
  confidence: AnalysisConfidence;
}

export interface ColorMoodAnalysis {
  title: string;
  description: string;
  evidence: string[];
}

export interface PsychologyAnalysis {
  summary: string;
  colorMood: ColorMoodAnalysis;
  concerns: AnalysisConcern[];
  strengths: string[];
  reflectionPrompt: string;
  advice: string[];
  profile: {
    scores: {
      calmness: number;
      energy: number;
      stability: number;
      openness: number;
      orderliness: number;
      persistence: number;
    };
    traitTags: PersonalityTraitTag[];
  };
  limitations: string;
  generatedAt: string;
  sampleSize: number;
}

export type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'error';

export const JOURNEY_STORAGE_KEY = 'trail-game:journey:v1';
export const ANALYSIS_STORAGE_KEY = 'trail-game:psychology-analysis:v6';
export const SESSION_STORAGE_KEY = 'trail-game:anonymous-session:v1';
export const MAX_JOURNEY_ACTIVITIES = 12;

export const hasAllCreativeModes = (activities: JourneyActivity[]) => {
  const kinds = new Set(activities.map((activity) => activity.signals.kind));
  return kinds.has('painting') && kinds.has('sculpture') && kinds.has('music');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isTaskMode = (value: unknown): value is TaskMode =>
  value === 'color-scene' ||
  value === 'weather' ||
  value === 'sculpt' ||
  value === 'music' ||
  value === 'candle';

const isActivitySignals = (value: unknown): value is ActivitySignals => {
  if (!isRecord(value)) return false;
  if (value.kind === 'painting') {
    return (
      (value.mode === 'color-scene' || value.mode === 'weather') &&
      isNumber(value.actions) &&
      Array.isArray(value.colors) &&
      value.colors.every(
        (item) =>
          isRecord(item) &&
          typeof item.color === 'string' &&
          isNumber(item.uses),
      )
    );
  }
  if (value.kind === 'sculpture') {
    return (
      Array.isArray(value.parts) &&
      value.parts.every(
        (part) =>
          isRecord(part) &&
          typeof part.id === 'string' &&
          typeof part.label === 'string' &&
          (part.category === 'body' ||
            part.category === 'eyes' ||
            part.category === 'detail') &&
          isNumber(part.x) &&
          isNumber(part.y) &&
          isNumber(part.size) &&
          isNumber(part.rotation) &&
          typeof part.flipped === 'boolean' &&
          (part.source === undefined ||
            part.source === 'starter' ||
            part.source === 'player-added'),
      ) &&
      isNumber(value.additions) &&
      isNumber(value.deletions) &&
      isNumber(value.transforms) &&
      isNumber(value.mirrors) &&
      isNumber(value.layerMoves)
    );
  }
  if (value.kind === 'music') {
    return (
      isNumber(value.tempo) &&
      isNumber(value.weight) &&
      isNumber(value.clearCount) &&
      Array.isArray(value.layers) &&
      value.layers.every(
        (layer) =>
          isRecord(layer) &&
          isNumber(layer.layer) &&
          Array.isArray(layer.notes) &&
          layer.notes.every(
            (note) =>
              isRecord(note) && isNumber(note.step) && isNumber(note.pitch),
          ),
      )
    );
  }
  return false;
};

export const isJourneyActivity = (value: unknown): value is JourneyActivity => {
  if (!isRecord(value)) return false;
  const activity = value as Partial<JourneyActivity>;
  return (
    typeof activity.id === 'string' &&
    typeof activity.completedAt === 'string' &&
    isTaskMode(activity.taskMode) &&
    typeof activity.taskTitle === 'string' &&
    typeof activity.location === 'string' &&
    typeof activity.character === 'string' &&
    isNumber(activity.durationSeconds) &&
    isActivitySignals(activity.signals)
  );
};

export const isPsychologyAnalysis = (
  value: unknown,
): value is PsychologyAnalysis => {
  if (!isRecord(value)) return false;
  const analysis = value as Partial<PsychologyAnalysis>;
  return (
    typeof analysis.summary === 'string' &&
    isRecord(analysis.colorMood) &&
    typeof analysis.colorMood.title === 'string' &&
    typeof analysis.colorMood.description === 'string' &&
    Array.isArray(analysis.colorMood.evidence) &&
    analysis.colorMood.evidence.every((entry) => typeof entry === 'string') &&
    Array.isArray(analysis.concerns) &&
    analysis.concerns.every(
      (concern) =>
        isRecord(concern) &&
        typeof concern.title === 'string' &&
        typeof concern.description === 'string' &&
        (concern.confidence === 'low' ||
          concern.confidence === 'medium' ||
          concern.confidence === 'high') &&
        Array.isArray(concern.evidence) &&
        concern.evidence.every((entry) => typeof entry === 'string'),
    ) &&
    Array.isArray(analysis.strengths) &&
    analysis.strengths.every((strength) => typeof strength === 'string') &&
    typeof analysis.reflectionPrompt === 'string' &&
    Array.isArray(analysis.advice) &&
    analysis.advice.every((entry) => typeof entry === 'string') &&
    isRecord(analysis.profile) &&
    isRecord(analysis.profile.scores) &&
    isNumber(analysis.profile.scores.calmness) &&
    isNumber(analysis.profile.scores.energy) &&
    isNumber(analysis.profile.scores.stability) &&
    isNumber(analysis.profile.scores.openness) &&
    isNumber(analysis.profile.scores.orderliness) &&
    isNumber(analysis.profile.scores.persistence) &&
    Array.isArray(analysis.profile.traitTags) &&
    analysis.profile.traitTags.every(isPersonalityTraitTag) &&
    typeof analysis.limitations === 'string' &&
    typeof analysis.generatedAt === 'string' &&
    isNumber(analysis.sampleSize)
  );
};

export const isPersonalityTraitTag = (
  value: unknown,
): value is PersonalityTraitTag =>
  value === 'organized' ||
  value === 'persistent' ||
  value === 'cautious' ||
  value === 'adaptable' ||
  value === 'independent' ||
  value === 'expressive' ||
  value === 'curious' ||
  value === 'sensitive' ||
  value === 'decisive' ||
  value === 'reflective';
