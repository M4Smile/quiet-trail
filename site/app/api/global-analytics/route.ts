import { readGlobalSessions } from '@/lib/global-analytics-store';
import type { PersonalityTraitTag } from '@/lib/psychology';

export const runtime = 'nodejs';

const REQUEST_TIMEOUT_MS = 40_000;

interface GroupInsight {
  headline: string;
  summary: string;
  mood: { title: string; description: string };
  traits: Array<{ title: string; description: string }>;
  tensions: Array<{ title: string; description: string }>;
  recommendations: string[];
  limitations: string;
}

let cachedInsight: { signature: string; value: GroupInsight } | null = null;

const traitLabels: Record<PersonalityTraitTag, string> = {
  organized: 'Организованность',
  persistent: 'Настойчивость',
  cautious: 'Осторожность',
  adaptable: 'Гибкость',
  independent: 'Самостоятельность',
  expressive: 'Выразительность',
  curious: 'Любознательность',
  sensitive: 'Чуткость',
  decisive: 'Решительность',
  reflective: 'Вдумчивость',
};

const groupSchema = {
  name: 'group_psychology_overview',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      mood: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'description'],
      },
      traits: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['title', 'description'],
        },
      },
      tensions: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['title', 'description'],
        },
      },
      recommendations: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { type: 'string' },
      },
      limitations: { type: 'string' },
    },
    required: [
      'headline',
      'summary',
      'mood',
      'traits',
      'tensions',
      'recommendations',
      'limitations',
    ],
  },
} as const;

const scoreKeys = [
  'calmness',
  'energy',
  'stability',
  'openness',
  'orderliness',
  'persistence',
] as const;

const average = (values: number[]) =>
  values.length
    ? Math.round(
        values.reduce((total, value) => total + value, 0) / values.length,
      )
    : 0;

const frequencies = (values: string[], limit: number) => {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
};

const clampText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const parseJsonContent = (content: string): unknown =>
  JSON.parse(
    content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  ) as unknown;

const extractContent = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  const choices = (value as Record<string, unknown>).choices;
  if (
    !Array.isArray(choices) ||
    !choices[0] ||
    typeof choices[0] !== 'object'
  ) {
    return null;
  }
  const message = (choices[0] as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') return null;
  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const partText = (part as Record<string, unknown>).text;
      return typeof partText === 'string' ? [partText] : [];
    })
    .join('');
  return text || null;
};

const parseGroupInsight = (value: unknown): GroupInsight | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const mood = record.mood as Record<string, unknown> | undefined;
  const items = (candidate: unknown, maximum: number) =>
    Array.isArray(candidate)
      ? candidate.slice(0, maximum).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const entry = item as Record<string, unknown>;
          const title = clampText(entry.title, 90);
          const description = clampText(entry.description, 220);
          return title && description ? [{ title, description }] : [];
        })
      : [];
  const insight = {
    headline: clampText(record.headline, 100),
    summary: clampText(record.summary, 320),
    mood: {
      title: clampText(mood?.title, 90),
      description: clampText(mood?.description, 220),
    },
    traits: items(record.traits, 4),
    tensions: items(record.tensions, 3),
    recommendations: Array.isArray(record.recommendations)
      ? record.recommendations
          .slice(0, 4)
          .map((item) => clampText(item, 180))
          .filter(Boolean)
      : [],
    limitations: clampText(record.limitations, 220),
  };
  return insight.headline &&
    insight.summary &&
    insight.mood.title &&
    insight.mood.description &&
    insight.traits.length >= 2 &&
    insight.tensions.length >= 1 &&
    insight.recommendations.length >= 2 &&
    insight.limitations
    ? insight
    : null;
};

const providerEndpoint = (baseUrl: string) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions')
    ? trimmed
    : `${trimmed}/chat/completions`;
};

const createGroupInsight = async (input: unknown) => {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) return null;

  const formats: Array<Record<string, unknown> | null> = [
    { type: 'json_schema', json_schema: groupSchema },
    { type: 'json_object' },
    null,
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const responseFormat of formats) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const body: Record<string, unknown> = {
          model,
          messages: [
            {
              role: 'system',
              content: `Ты анализируешь обезличенную психологическую обстановку в группе по результатам творческой игры. Пиши по-русски, просто, уверенно и конкретно. Опирайся на средние оценки и частоты по всем сессиям. Сформулируй общий портрет группы, основные черты, настроение, возможные точки напряжения и практические рекомендации для учителя или руководителя. Не ставь диагнозов, не утверждай скрытые события и не оценивай отдельных людей. Не преувеличивай вывод при маленькой выборке. Не пересказывай технические поля. Заполни каждый обязательный раздел. Верни только JSON заданной структуры.`,
            },
            {
              role: 'user',
              content: `Сводные данные всех завершённых сессий:\n${JSON.stringify(input)}`,
            },
          ],
        };
        if (responseFormat) body.response_format = responseFormat;
        const response = await fetch(providerEndpoint(baseUrl), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (
            (response.status === 400 || response.status === 422) &&
            responseFormat
          ) {
            continue;
          }
          break;
        }
        const content = extractContent(await response.json());
        if (!content) continue;
        const parsed = parseGroupInsight(parseJsonContent(content));
        if (parsed) return parsed;
      } catch {
        // Try a less strict format and repeat the complete request once.
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  return null;
};

export async function GET() {
  try {
    const sessions = await readGlobalSessions();
    if (!sessions.length) {
      return Response.json(
        { sessionCount: 0, activityCount: 0, insight: null },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const averages = Object.fromEntries(
      scoreKeys.map((key) => [
        key,
        average(
          sessions.map((session) => session.analysis.profile.scores[key]),
        ),
      ]),
    );
    const tagCounts = new Map<PersonalityTraitTag, number>();
    sessions.forEach((session) =>
      session.analysis.profile.traitTags.forEach((tag) =>
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1),
      ),
    );
    const traits = [...tagCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([tag, count]) => ({
        tag,
        label: traitLabels[tag],
        count,
        percentage: Math.round((count / sessions.length) * 100),
      }));
    const activityCount = sessions.reduce(
      (total, session) => total + session.activitiesCount,
      0,
    );
    const llmInput = {
      sessionCount: sessions.length,
      activityCount,
      averages,
      traitDistribution: traits,
      commonMoodLabels: frequencies(
        sessions.map((session) => session.analysis.colorMood.title),
        16,
      ),
      commonStrengths: frequencies(
        sessions.flatMap((session) => session.analysis.strengths),
        24,
      ),
      commonTensions: frequencies(
        sessions.flatMap((session) =>
          session.analysis.concerns.map((concern) => concern.title),
        ),
        24,
      ),
    };
    const signature = `${sessions.length}:${activityCount}:${sessions.at(-1)?.updatedAt ?? ''}`;
    const insight =
      cachedInsight?.signature === signature
        ? cachedInsight.value
        : await createGroupInsight(llmInput);
    if (!insight) {
      return Response.json(
        {
          error:
            'Не удалось получить общий вывод. Попробуйте обновить ещё раз.',
        },
        { status: 503 },
      );
    }
    cachedInsight = { signature, value: insight };

    return Response.json(
      {
        sessionCount: sessions.length,
        activityCount,
        updatedAt: sessions.at(-1)?.updatedAt,
        averages,
        traits,
        insight,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Не удалось собрать общую аналитику.' },
      { status: 503 },
    );
  }
}
