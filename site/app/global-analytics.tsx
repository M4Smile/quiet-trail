'use client';

import { useCallback, useEffect, useState } from 'react';
import './global-analytics.css';

interface GroupInsight {
  headline: string;
  summary: string;
  mood: { title: string; description: string };
  traits: Array<{ title: string; description: string }>;
  tensions: Array<{ title: string; description: string }>;
  recommendations: string[];
  limitations: string;
}

interface GlobalAnalyticsData {
  sessionCount: number;
  activityCount: number;
  updatedAt?: string;
  averages?: Record<string, number>;
  traits?: Array<{
    tag: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  insight: GroupInsight | null;
  error?: string;
}

const scoreLabels: Record<string, string> = {
  calmness: 'Спокойствие',
  energy: 'Энергия',
  stability: 'Устойчивость',
  openness: 'Открытость новому',
  orderliness: 'Любовь к порядку',
  persistence: 'Настойчивость',
};

export function GlobalAnalytics() {
  const [data, setData] = useState<GlobalAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/global-analytics', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as GlobalAnalyticsData;
      if (!response.ok) throw new Error(payload.error || 'Панель не отвечает.');
      setData(payload);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Панель пока не отвечает.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updatedAt = data?.updatedAt
    ? new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(data.updatedAt))
    : null;

  return (
    <main className="group-page">
      <div className="group-dashboard">
        <header className="group-header">
          <div>
            <p>Общая карта состояния</p>
            <h1>Аналитика группы</h1>
          </div>
          <button type="button" disabled={loading} onClick={() => void load()}>
            {loading ? 'Собираю…' : 'Обновить сводку'}
          </button>
        </header>

        {error && <div className="group-notice is-error">{error}</div>}

        {!error && loading && !data && (
          <div className="group-empty">
            <span aria-hidden="true">❦</span>
            <strong>Собираю наблюдения со всех троп…</strong>
          </div>
        )}

        {!loading && data?.sessionCount === 0 && (
          <div className="group-empty">
            <span aria-hidden="true">◇</span>
            <strong>Завершённых сессий пока нет</strong>
            <p>
              Сводка появится, когда хотя бы один игрок закончит рисование,
              лепку и создание музыки.
            </p>
          </div>
        )}

        {data && data.sessionCount > 0 && (
          <>
            <section className="group-stats" aria-label="Объём данных">
              <article>
                <strong>{data.sessionCount}</strong>
                <span>сессий</span>
              </article>
              <article>
                <strong>{data.activityCount}</strong>
                <span>заданий</span>
              </article>
              <article>
                <strong>{data.traits?.length ?? 0}</strong>
                <span>повторяющихся черт</span>
              </article>
              <p>{updatedAt ? `Обновлено ${updatedAt}` : 'Данные обновлены'}</p>
            </section>

            {data.insight && (
              <section className="group-overview">
                <p>Вывод LLM по всей группе</p>
                <h2>{data.insight.headline}</h2>
                <div>{data.insight.summary}</div>
              </section>
            )}

            <div className="group-grid">
              <section className="group-sheet group-state">
                <header>
                  <p>Среднее по участникам</p>
                  <h2>Психологическое состояние</h2>
                </header>
                <div className="group-score-list">
                  {Object.entries(data.averages ?? {}).map(([key, value]) => (
                    <div className="group-score" key={key}>
                      <div>
                        <span>{scoreLabels[key] ?? key}</span>
                        <strong>{value}%</strong>
                      </div>
                      <i>
                        <b style={{ width: `${value}%` }} />
                      </i>
                    </div>
                  ))}
                </div>
                {data.insight && (
                  <article className="group-mood">
                    <span>Общее настроение</span>
                    <h3>{data.insight.mood.title}</h3>
                    <p>{data.insight.mood.description}</p>
                  </article>
                )}
              </section>

              <section className="group-sheet group-traits">
                <header>
                  <p>Чаще всего встречается</p>
                  <h2>Основные черты</h2>
                </header>
                <div className="group-trait-list">
                  {(data.traits ?? []).slice(0, 6).map((trait) => (
                    <article key={trait.tag}>
                      <strong>{trait.label}</strong>
                      <span>{trait.percentage}% участников</span>
                      <small>{trait.count} сесс.</small>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            {data.insight && (
              <div className="group-grid group-details">
                <section className="group-sheet">
                  <header>
                    <p>Общий портрет</p>
                    <h2>Что заметно в группе</h2>
                  </header>
                  <div className="group-insight-list">
                    {data.insight.traits.map((trait) => (
                      <article key={trait.title}>
                        <h3>{trait.title}</h3>
                        <p>{trait.description}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="group-sheet group-tensions">
                  <header>
                    <p>На что обратить внимание</p>
                    <h2>Возможные точки напряжения</h2>
                  </header>
                  <div className="group-insight-list">
                    {data.insight.tensions.map((tension) => (
                      <article key={tension.title}>
                        <h3>{tension.title}</h3>
                        <p>{tension.description}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {data.insight && (
              <section className="group-recommendations">
                <div>
                  <p>Для учителя или руководителя</p>
                  <h2>Что можно сделать</h2>
                </div>
                <ol>
                  {data.insight.recommendations.map((recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ))}
                </ol>
              </section>
            )}

            <footer className="group-footer">
              {data.insight?.limitations ||
                'Это ориентировочная не-клиническая оценка по игровым действиям.'}
              {' Решения об отдельных людях по этой панели принимать нельзя.'}
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
