'use client';

import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type {
  AnalysisStatus,
  JourneyActivity,
  PsychologyAnalysis,
} from '@/lib/psychology';
import './psychology-journal.css';

interface PsychologyJournalProps {
  open: boolean;
  activities: JourneyActivity[];
  analysis: PsychologyAnalysis | null;
  status: AnalysisStatus;
  error: string;
  onOpen: () => void;
  onClose: () => void;
  onRetry: () => void;
  onClear: () => void;
}

const confidenceLabel = {
  low: 'возможно',
  medium: 'похоже на тебя',
  high: 'ярко проявляется',
} as const;

const taskLabel = {
  'color-scene': 'раскраска',
  weather: 'погода',
  sculpt: 'лепка',
  music: 'музыка',
  candle: 'театр теней',
} as const;

export function PsychologyJournal({
  open,
  activities,
  analysis,
  status,
  error,
  onOpen,
  onClose,
  onRetry,
  onClear,
}: PsychologyJournalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  const trailMarks = useMemo(() => {
    const modes = new Map<string, number>();
    const colors = new Map<string, number>();
    let sculptureParts = 0;
    let musicNotes = 0;

    activities.forEach((activity) => {
      const label = taskLabel[activity.taskMode];
      modes.set(label, (modes.get(label) ?? 0) + 1);
      if (activity.signals.kind === 'painting') {
        activity.signals.colors.forEach((item) => {
          colors.set(item.color, (colors.get(item.color) ?? 0) + item.uses);
        });
      }
      if (activity.signals.kind === 'sculpture') {
        sculptureParts += activity.signals.parts.length;
      }
      if (activity.signals.kind === 'music') {
        musicNotes += activity.signals.layers.reduce(
          (total, layer) => total + layer.notes.length,
          0,
        );
      }
    });

    return {
      modes: [...modes.entries()],
      colors: [...colors.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8),
      sculptureParts,
      musicNotes,
    };
  }, [activities]);

  const clearWithConfirmation = () => {
    if (
      window.confirm('Стереть игровые наблюдения и последнюю запись дневника?')
    ) {
      onClear();
      onClose();
    }
  };

  const dialog = open ? (
    <div
      className="journal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <dialog
        open
        className="journal-book"
        aria-modal="true"
        aria-labelledby="journal-title"
      >
        <button
          type="button"
          className="journal-close"
          aria-label="Закрыть дневник"
          onClick={onClose}
        >
          ×
        </button>

        <header className="journal-heading">
          <p>Наблюдения тропы</p>
          <h2 id="journal-title">Дневник пути</h2>
          <span>
            {activities.length
              ? 'Завершённых историй: ' + activities.length
              : 'Первая запись ещё впереди'}
          </span>
        </header>

        {status === 'loading' && !analysis && (
          <div className="journal-writing" aria-live="polite">
            <span className="journal-quill" aria-hidden="true">
              ❧
            </span>
            <strong>Тропа собирает наблюдения…</strong>
            <p>Это может занять несколько мгновений.</p>
          </div>
        )}

        {status === 'idle' && !analysis && (
          <div className="journal-empty">
            <span aria-hidden="true">◇</span>
            <strong>Страницы пока чисты</strong>
            <p>
              Закончи творческое задание, и здесь появится первая бережная
              заметка.
            </p>
          </div>
        )}

        {status === 'error' && !analysis && (
          <div className="journal-empty is-error" aria-live="polite">
            <span aria-hidden="true">≈</span>
            <strong>Чернила не легли на бумагу</strong>
            <p>{error}</p>
            <button type="button" onClick={onRetry}>
              Попробовать снова
            </button>
          </div>
        )}

        {analysis && (
          <div className="journal-pages">
            <div className="journal-page journal-page-left">
              {status === 'loading' && (
                <div className="journal-update" aria-live="polite">
                  <span aria-hidden="true">✦</span> Появилась новая история —
                  запись обновляется…
                </div>
              )}
              {status === 'error' && (
                <div className="journal-update is-error" aria-live="polite">
                  {error}{' '}
                  <button type="button" onClick={onRetry}>
                    Повторить
                  </button>
                </div>
              )}

              <article className="journal-summary">
                <h3>Что заметила тропа</h3>
                <p>{analysis.summary}</p>
              </article>

              <section className="journal-color-mood">
                <h3>Настроение</h3>
                <strong>{analysis.colorMood.title}</strong>
                <p>{analysis.colorMood.description}</p>
                <div>
                  {analysis.colorMood.evidence.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </section>

              <section className="journal-strengths">
                <h3>Черты характера</h3>
                <ul>
                  {analysis.strengths.map((strength) => (
                    <li key={strength}>{strength}</li>
                  ))}
                </ul>
              </section>

              <div className="journal-guidance">
                <section className="journal-reflection">
                  <span aria-hidden="true">❦</span>
                  <h3>Вопрос у костра</h3>
                  <p>{analysis.reflectionPrompt}</p>
                </section>
                <section className="journal-advice">
                  <span aria-hidden="true">✦</span>
                  <h3>Что попробовать</h3>
                  <ul>
                    {analysis.advice.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>

            <div className="journal-page journal-page-right">
              <section className="journal-concerns">
                <h3>Что может быть непросто</h3>
                {analysis.concerns.length ? (
                  <div className="journal-concern-list">
                    {analysis.concerns.map((concern) => (
                      <article
                        className={
                          'journal-concern confidence-' + concern.confidence
                        }
                        key={concern.title}
                      >
                        <div>
                          <h4>{concern.title}</h4>
                          <span>{confidenceLabel[concern.confidence]}</span>
                        </div>
                        <p>{concern.description}</p>
                        {concern.evidence.length > 0 && (
                          <ul aria-label="Игровые наблюдения">
                            {concern.evidence.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="journal-no-concerns">
                    Пока не видно устойчивых мотивов, которые стоило бы назвать
                    точками напряжения.
                  </p>
                )}
              </section>

              <section className="journal-evidence">
                <h3>Следы в пути</h3>
                <div className="journal-mode-list">
                  {trailMarks.modes.map(([mode, count]) => (
                    <span key={mode}>
                      {mode} · {count}
                    </span>
                  ))}
                </div>
                {trailMarks.colors.length > 0 && (
                  <div
                    className="journal-swatches"
                    aria-label="Использованные цвета"
                  >
                    {trailMarks.colors.map(([color, uses]) => (
                      <i
                        key={color}
                        style={{ backgroundColor: color }}
                        title={color + ', действий: ' + uses}
                      />
                    ))}
                  </div>
                )}
                {(trailMarks.sculptureParts > 0 ||
                  trailMarks.musicNotes > 0) && (
                  <p>
                    {trailMarks.sculptureParts > 0
                      ? 'Деталей в фигурах: ' + trailMarks.sculptureParts + '. '
                      : ''}
                    {trailMarks.musicNotes > 0
                      ? 'Нот в мелодиях: ' + trailMarks.musicNotes + '.'
                      : ''}
                  </p>
                )}
              </section>
            </div>
          </div>
        )}

        <footer className="journal-footer">
          <p>
            {analysis?.limitations ||
              'Дневник замечает только игровые действия и не ставит диагнозов.'}
          </p>
          {activities.length > 0 && (
            <div className="journal-footer-actions">
              <button
                type="button"
                disabled={status === 'loading'}
                onClick={onRetry}
              >
                {status === 'loading' ? 'Обновляется…' : 'Переосмыслить'}
              </button>
              <button type="button" onClick={clearWithConfirmation}>
                Стереть записи
              </button>
            </div>
          )}
        </footer>
      </dialog>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className={
          status === 'loading' ? 'journal-tab is-writing' : 'journal-tab'
        }
        aria-label="Открыть дневник пути"
        onClick={onOpen}
      >
        <span className="journal-tab-flourish">
          <span className="journal-tab-copy">
            <b>Дневник</b>
            {activities.length > 0 && (
              <strong aria-label={'Записей: ' + activities.length}>
                {activities.length}
              </strong>
            )}
          </span>
        </span>
      </button>

      {typeof document !== 'undefined' && dialog
        ? createPortal(dialog, document.body)
        : null}
    </>
  );
}
