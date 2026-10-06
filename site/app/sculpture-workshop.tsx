'use client';

import './sculpture-workshop.css';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

type PartCategory = 'body' | 'eyes' | 'detail';
type TransformMode = 'move' | 'resize' | 'rotate';

interface SculptureOption {
  id: string;
  label: string;
  asset: string;
  category: PartCategory;
  bounds: readonly [number, number, number, number];
}

export interface SculpturePart extends SculptureOption {
  instanceId: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  flipped: boolean;
}

interface PartTransform {
  instanceId: string;
  pointerId: number;
  mode: TransformMode;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originSize: number;
  originRotation: number;
  centerX: number;
  centerY: number;
  startDistance: number;
  startAngle: number;
  workspaceWidth: number;
  workspaceHeight: number;
}

interface OptionDrag {
  option: SculptureOption;
  pointerId: number;
  pointerType: string;
  startedAt: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  x: number;
  y: number;
  moved: boolean;
  scrolling: boolean;
}

interface DropPosition {
  x: number;
  y: number;
}

const asset = (name: string) => '/game/sculpt/' + name + '.png';

const SCULPTURE_SOURCE_SIZE = 256;
const TOUCH_DRAG_HOLD_MS = 280;
const partBounds: Record<string, readonly [number, number, number, number]> = {
  antennae: [78, 78, 100, 99],
  'arm-curved': [41, 61, 173, 133],
  'arm-long': [73, 56, 109, 143],
  'arm-short': [92, 74, 71, 107],
  beard: [65, 62, 125, 132],
  'body-bent': [67, 39, 122, 178],
  'body-cone': [55, 56, 145, 144],
  'body-drop': [72, 47, 112, 161],
  'body-oval': [36, 76, 183, 103],
  'body-peanut': [55, 43, 145, 170],
  'body-ring': [55, 53, 146, 150],
  'body-round': [64, 62, 128, 131],
  'body-tall': [87, 40, 81, 175],
  'boot-small': [91, 77, 73, 102],
  'boot-tall': [84, 60, 87, 136],
  eyebrows: [55, 103, 146, 49],
  'eyes-one': [88, 85, 80, 86],
  'eyes-two': [74, 101, 107, 53],
  horns: [72, 86, 111, 83],
  moustache: [39, 98, 178, 60],
  'mouth-smile': [72, 97, 111, 61],
  'mouth-soft': [75, 114, 105, 27],
  'nose-long': [101, 71, 53, 114],
  'nose-round': [90, 92, 75, 71],
  'wing-feather': [74, 70, 107, 115],
  'wing-leaf': [72, 74, 111, 107],
};

const bodyOptions: SculptureOption[] = [
  ['body-round', 'Круглая форма'],
  ['body-tall', 'Высокая форма'],
  ['body-drop', 'Форма капли'],
  ['body-oval', 'Овальная форма'],
  ['body-bent', 'Изогнутая форма'],
  ['body-cone', 'Конусная форма'],
  ['body-peanut', 'Двойная форма'],
  ['body-ring', 'Кольцевая форма'],
].map(([id, label]) => ({
  id,
  label,
  asset: asset(id),
  category: 'body',
  bounds: partBounds[id],
}));

const eyeOptions: SculptureOption[] = [
  {
    id: 'eyes-one',
    label: 'Один глаз',
    asset: asset('eyes-one'),
    category: 'eyes',
    bounds: partBounds['eyes-one'],
  },
  {
    id: 'eyes-two',
    label: 'Два глаза',
    asset: asset('eyes-two'),
    category: 'eyes',
    bounds: partBounds['eyes-two'],
  },
];

const detailOptions: SculptureOption[] = [
  ['nose-long', 'Длинный нос'],
  ['nose-round', 'Круглый нос'],
  ['mouth-soft', 'Тихая улыбка'],
  ['mouth-smile', 'Широкая улыбка'],
  ['moustache', 'Усы'],
  ['beard', 'Борода'],
  ['eyebrows', 'Брови'],
  ['arm-short', 'Короткая рука'],
  ['arm-long', 'Длинная рука'],
  ['boot-small', 'Небольшой сапог'],
  ['boot-tall', 'Высокий сапог'],
  ['arm-curved', 'Изогнутая рука'],
  ['horns', 'Рожки'],
  ['wing-feather', 'Перьевое крыло'],
  ['wing-leaf', 'Листовое крыло'],
  ['antennae', 'Усики'],
].map(([id, label]) => ({
  id,
  label,
  asset: asset(id),
  category: 'detail',
  bounds: partBounds[id],
}));

const allOptions = [...bodyOptions, ...eyeOptions, ...detailOptions];

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const initialParts = (sceneId: string): SculpturePart[] => {
  const seed = hashString(sceneId);
  const body = bodyOptions[seed % bodyOptions.length];
  const eyes = eyeOptions[(seed >>> 4) % eyeOptions.length];
  return [
    {
      ...body,
      instanceId: 'body-start',
      x: 50,
      y: 55,
      size: 78,
      rotation: 0,
      flipped: false,
    },
    {
      ...eyes,
      instanceId: 'eyes-start',
      x: 50,
      y: 43,
      size: eyes.id === 'eyes-one' ? 28 : 38,
      rotation: 0,
      flipped: false,
    },
  ];
};

const defaultPlacement = (option: SculptureOption, index: number) => {
  if (option.category === 'body') {
    return {
      x: index % 2 === 0 ? 43 : 57,
      y: 56,
      size: 56,
      rotation: index % 2 === 0 ? -7 : 7,
    };
  }
  if (option.category === 'eyes') {
    return {
      x: 50,
      y: 40,
      size: option.id === 'eyes-one' ? 25 : 34,
      rotation: 0,
    };
  }
  if (option.id.startsWith('nose'))
    return { x: 50, y: 55, size: 24, rotation: 0 };
  if (option.id.startsWith('mouth'))
    return { x: 50, y: 67, size: 38, rotation: 0 };
  if (option.id === 'moustache') return { x: 50, y: 64, size: 43, rotation: 0 };
  if (option.id === 'beard') return { x: 50, y: 72, size: 43, rotation: 0 };
  if (option.id === 'eyebrows') return { x: 50, y: 34, size: 39, rotation: 0 };
  if (option.id === 'horns') return { x: 50, y: 23, size: 42, rotation: 0 };
  if (option.id === 'antennae') return { x: 50, y: 18, size: 35, rotation: 0 };
  if (option.id.startsWith('wing')) {
    const left = index % 2 === 0;
    return { x: left ? 22 : 78, y: 56, size: 39, rotation: left ? -16 : 16 };
  }
  if (option.id.startsWith('boot')) {
    const left = index % 2 === 0;
    return { x: left ? 38 : 62, y: 87, size: 29, rotation: left ? -4 : 4 };
  }
  const left = index % 2 === 0;
  return { x: left ? 23 : 77, y: 65, size: 36, rotation: left ? -12 : 12 };
};

export interface SculptureController {
  parts: SculpturePart[];
  selectedPartId: string | null;
  changed: boolean;
  metrics: SculptureMetrics;
  addOption: (option: SculptureOption, position?: DropPosition) => void;
  beginTransform: (
    event: ReactPointerEvent<HTMLElement>,
    instanceId: string,
    mode: TransformMode,
  ) => void;
  moveTransform: (event: ReactPointerEvent<HTMLElement>) => void;
  endTransform: (event: ReactPointerEvent<HTMLElement>) => void;
  cancelTransform: () => void;
  moveSelectedBackward: () => void;
  moveSelectedForward: () => void;
  mirrorSelected: () => void;
  deleteSelected: () => void;
}

export interface SculptureMetrics {
  additions: number;
  deletions: number;
  transforms: number;
  mirrors: number;
  layerMoves: number;
}

const emptyMetrics = (): SculptureMetrics => ({
  additions: 0,
  deletions: 0,
  transforms: 0,
  mirrors: 0,
  layerMoves: 0,
});

export function useSculpture(
  sceneId: string,
  active: boolean,
): SculptureController {
  const [parts, setParts] = useState<SculpturePart[]>(() =>
    initialParts(sceneId),
  );
  const [selectedPartId, setSelectedPartId] = useState<string | null>(
    'body-start',
  );
  const [changed, setChanged] = useState(false);
  const [metrics, setMetrics] = useState<SculptureMetrics>(emptyMetrics);
  const transformRef = useRef<PartTransform | null>(null);
  const nextPartId = useRef(0);

  useEffect(() => {
    if (!active) return;
    setParts(initialParts(sceneId));
    setSelectedPartId('body-start');
    setChanged(false);
    setMetrics(emptyMetrics());
    transformRef.current = null;
    nextPartId.current = 0;
  }, [active, sceneId]);

  const beginTransform = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      instanceId: string,
      mode: TransformMode,
    ) => {
      event.preventDefault();
      const part = parts.find((item) => item.instanceId === instanceId);
      const workspace = event.currentTarget.closest(
        '.sculpture-canvas',
      ) as HTMLElement | null;
      if (!part || !workspace) return;
      const rect = workspace.getBoundingClientRect();
      const centerX = rect.left + (part.x / 100) * rect.width;
      const centerY = rect.top + (part.y / 100) * rect.height;
      const startDistance = Math.max(
        1,
        Math.hypot(event.clientX - centerX, event.clientY - centerY),
      );
      const startAngle = Math.atan2(
        event.clientY - centerY,
        event.clientX - centerX,
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      transformRef.current = {
        instanceId,
        pointerId: event.pointerId,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        originX: part.x,
        originY: part.y,
        originSize: part.size,
        originRotation: part.rotation,
        centerX,
        centerY,
        startDistance,
        startAngle,
        workspaceWidth: rect.width,
        workspaceHeight: rect.height,
      };
      setSelectedPartId(instanceId);
    },
    [parts],
  );

  const moveTransform = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const transform = transformRef.current;
    if (!transform || transform.pointerId !== event.pointerId) return;
    event.preventDefault();

    setParts((current) =>
      current.map((part) => {
        if (part.instanceId !== transform.instanceId) return part;
        if (transform.mode === 'move') {
          return {
            ...part,
            x: Math.max(
              -8,
              Math.min(
                108,
                transform.originX +
                  ((event.clientX - transform.startX) /
                    transform.workspaceWidth) *
                    100,
              ),
            ),
            y: Math.max(
              -8,
              Math.min(
                108,
                transform.originY +
                  ((event.clientY - transform.startY) /
                    transform.workspaceHeight) *
                    100,
              ),
            ),
          };
        }
        if (transform.mode === 'resize') {
          const distance = Math.hypot(
            event.clientX - transform.centerX,
            event.clientY - transform.centerY,
          );
          return {
            ...part,
            size: Math.max(
              8,
              Math.min(
                110,
                transform.originSize * (distance / transform.startDistance),
              ),
            ),
          };
        }
        const angle = Math.atan2(
          event.clientY - transform.centerY,
          event.clientX - transform.centerX,
        );
        return {
          ...part,
          rotation:
            transform.originRotation +
            ((angle - transform.startAngle) * 180) / Math.PI,
        };
      }),
    );
    setChanged(true);
  }, []);

  const endTransform = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const transform = transformRef.current;
    if (!transform || transform.pointerId !== event.pointerId) return;
    transformRef.current = null;
    setMetrics((current) => ({
      ...current,
      transforms: current.transforms + 1,
    }));
  }, []);

  const cancelTransform = useCallback(() => {
    transformRef.current = null;
  }, []);

  const addOption = useCallback(
    (option: SculptureOption, position?: DropPosition) => {
      const instanceId = option.id + '-' + nextPartId.current++;
      setParts((current) => {
        const placement = defaultPlacement(option, current.length);
        return [
          ...current,
          {
            ...option,
            ...placement,
            ...position,
            instanceId,
            flipped: false,
          },
        ];
      });
      setSelectedPartId(instanceId);
      setChanged(true);
      setMetrics((current) => ({
        ...current,
        additions: current.additions + 1,
      }));
    },
    [],
  );

  const moveSelectedBy = useCallback(
    (direction: -1 | 1) => {
      if (!selectedPartId) return;
      setParts((current) => {
        const index = current.findIndex(
          (part) => part.instanceId === selectedPartId,
        );
        if (index < 0) return current;
        const target = Math.max(
          0,
          Math.min(current.length - 1, index + direction),
        );
        if (target === index) return current;
        const next = [...current];
        const [selected] = next.splice(index, 1);
        next.splice(target, 0, selected);
        return next;
      });
      setChanged(true);
      setMetrics((current) => ({
        ...current,
        layerMoves: current.layerMoves + 1,
      }));
    },
    [selectedPartId],
  );

  const mirrorSelected = useCallback(() => {
    if (!selectedPartId) return;
    setParts((current) =>
      current.map((part) =>
        part.instanceId === selectedPartId
          ? { ...part, flipped: !part.flipped }
          : part,
      ),
    );
    setChanged(true);
    setMetrics((current) => ({
      ...current,
      mirrors: current.mirrors + 1,
    }));
  }, [selectedPartId]);

  const deleteSelected = useCallback(() => {
    if (!selectedPartId) return;
    const selectedIndex = parts.findIndex(
      (part) => part.instanceId === selectedPartId,
    );
    if (selectedIndex < 0) return;
    const next = parts.filter((part) => part.instanceId !== selectedPartId);
    setParts(next);
    setSelectedPartId(
      next[Math.min(selectedIndex, next.length - 1)]?.instanceId ?? null,
    );
    setChanged(true);
    setMetrics((current) => ({
      ...current,
      deletions: current.deletions + 1,
    }));
  }, [parts, selectedPartId]);

  return {
    parts,
    selectedPartId,
    changed,
    metrics,
    addOption,
    beginTransform,
    moveTransform,
    endTransform,
    cancelTransform,
    moveSelectedBackward: () => moveSelectedBy(-1),
    moveSelectedForward: () => moveSelectedBy(1),
    mirrorSelected,
    deleteSelected,
  };
}

interface SculptureFigureProps {
  controller: SculptureController;
  phase: 'choose' | 'sculpt' | 'complete';
}

export function SculptureFigure({ controller, phase }: SculptureFigureProps) {
  return (
    <div
      className={[
        'sculpture-figure',
        phase === 'sculpt' ? 'is-editing' : '',
        phase === 'complete' ? 'is-finished' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Существо из мягких деталей"
    >
      <div className="sculpture-canvas">
        {controller.parts.map((part, index) => {
          const selected = controller.selectedPartId === part.instanceId;
          const [rawLeft, rawTop, rawWidth, rawHeight] = part.bounds ??
            partBounds[part.id] ?? [0, 0, 256, 256];
          const padding = 4;
          const zoneLeft = Math.max(0, rawLeft - padding);
          const zoneTop = Math.max(0, rawTop - padding);
          const zoneRight = Math.min(
            SCULPTURE_SOURCE_SIZE,
            rawLeft + rawWidth + padding,
          );
          const zoneBottom = Math.min(
            SCULPTURE_SOURCE_SIZE,
            rawTop + rawHeight + padding,
          );
          const style = {
            '--part-x': part.x + '%',
            '--part-y': part.y + '%',
            '--part-size': part.size + '%',
            '--part-rotate': part.rotation + 'deg',
            '--part-z': String(index + 1),
            '--part-flip': part.flipped ? '-1' : '1',
            '--zone-left': (zoneLeft / SCULPTURE_SOURCE_SIZE) * 100 + '%',
            '--zone-top': (zoneTop / SCULPTURE_SOURCE_SIZE) * 100 + '%',
            '--zone-width':
              ((zoneRight - zoneLeft) / SCULPTURE_SOURCE_SIZE) * 100 + '%',
            '--zone-height':
              ((zoneBottom - zoneTop) / SCULPTURE_SOURCE_SIZE) * 100 + '%',
          } as CSSProperties;

          return (
            <div
              key={part.instanceId}
              className={[
                'sculpture-part',
                'is-' + part.category,
                selected ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={style}
            >
              <span className="sculpture-part-art">
                <img src={part.asset} alt="" draggable={false} />
              </span>

              {phase === 'sculpt' && (
                <div
                  className="sculpture-part-hitbox"
                  aria-label={part.label}
                  onPointerDown={(event) =>
                    controller.beginTransform(event, part.instanceId, 'move')
                  }
                  onPointerMove={controller.moveTransform}
                  onPointerUp={controller.endTransform}
                  onPointerCancel={controller.cancelTransform}
                >
                  {selected && (
                    <>
                      <button
                        type="button"
                        className="sculpt-transform-handle is-rotate"
                        aria-label="Повернуть деталь"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          controller.beginTransform(
                            event,
                            part.instanceId,
                            'rotate',
                          );
                        }}
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        className="sculpt-transform-handle is-resize"
                        aria-label="Изменить размер детали"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          controller.beginTransform(
                            event,
                            part.instanceId,
                            'resize',
                          );
                        }}
                      >
                        ↘
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SculptureDeckProps {
  controller: SculptureController;
  onFinish: () => void;
}

export function SculptureDeck({ controller, onFinish }: SculptureDeckProps) {
  const [open, setOpen] = useState(true);
  const [optionDrag, setOptionDrag] = useState<OptionDrag | null>(null);
  const optionDragRef = useRef<OptionDrag | null>(null);
  const selectedIndex = controller.parts.findIndex(
    (part) => part.instanceId === controller.selectedPartId,
  );

  const beginOptionDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    option: SculptureOption,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const tray = event.currentTarget.closest(
      '.sculpt-parts-tray',
    ) as HTMLElement | null;
    const next: OptionDrag = {
      option,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startedAt: performance.now(),
      startX: event.clientX,
      startY: event.clientY,
      startScrollTop: tray?.scrollTop ?? 0,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      scrolling: false,
    };
    optionDragRef.current = next;
    setOptionDrag(next);
  };

  const moveOptionDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = optionDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    const distance = Math.hypot(deltaX, deltaY);
    const elapsed = performance.now() - current.startedAt;
    const shouldScroll =
      current.pointerType === 'touch' &&
      (current.scrolling ||
        (!current.moved && distance > 7 && elapsed < TOUCH_DRAG_HOLD_MS));

    if (shouldScroll) {
      event.preventDefault();
      const tray = event.currentTarget.closest(
        '.sculpt-parts-tray',
      ) as HTMLElement | null;
      if (tray) tray.scrollTop = current.startScrollTop - deltaY;
      const next = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        scrolling: true,
      };
      optionDragRef.current = next;
      setOptionDrag(next);
      return;
    }

    const moved = current.moved || distance > 5;
    const next = {
      ...current,
      x: event.clientX,
      y: event.clientY,
      moved,
    };
    optionDragRef.current = next;
    setOptionDrag(next);
  };

  const finishOptionDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = optionDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    if (current.scrolling) {
      optionDragRef.current = null;
      setOptionDrag(null);
      return;
    }

    if (!current.moved) {
      controller.addOption(current.option);
    } else {
      const workspace = document.querySelector<HTMLElement>(
        '.sculpture-figure.is-editing .sculpture-canvas',
      );
      const rect = workspace?.getBoundingClientRect();
      if (
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        controller.addOption(current.option, {
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100,
        });
      }
    }
    optionDragRef.current = null;
    setOptionDrag(null);
  };

  const cancelOptionDrag = () => {
    optionDragRef.current = null;
    setOptionDrag(null);
  };

  return (
    <section
      className={open ? 'sculpt-deck is-open' : 'sculpt-deck'}
      aria-label="Детали для лепки"
    >
      <div className="sculpt-drawer-bar">
        <button
          type="button"
          className="sculpt-drawer-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="sculpt-drawer-grip" aria-hidden="true" />
          <span>Детали</span>
          <span className="sculpt-drawer-chevron" aria-hidden="true">
            {open ? '⌄' : '⌃'}
          </span>
        </button>

        <div
          className="sculpt-layer-actions"
          aria-label="Положение выбранной детали"
        >
          <button
            type="button"
            disabled={selectedIndex <= 0}
            aria-label="Переместить на слой назад"
            title="На слой назад"
            onClick={controller.moveSelectedBackward}
          >
            ↓
          </button>
          <button
            type="button"
            disabled={
              selectedIndex < 0 || selectedIndex >= controller.parts.length - 1
            }
            aria-label="Переместить на слой вперёд"
            title="На слой вперёд"
            onClick={controller.moveSelectedForward}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={selectedIndex < 0}
            aria-label="Отразить деталь по горизонтали"
            title="Отразить"
            onClick={controller.mirrorSelected}
          >
            ⇋
          </button>
          <button
            type="button"
            className="is-delete"
            disabled={selectedIndex < 0}
            aria-label="Удалить выбранную деталь"
            title="Удалить"
            onClick={controller.deleteSelected}
          >
            ×
          </button>
        </div>

        <button
          type="button"
          className="sculpt-finish-button"
          disabled={!controller.changed}
          onClick={onFinish}
        >
          Готово
        </button>
      </div>

      {open && (
        <div
          className="sculpt-parts-tray"
          aria-label="Перетащи деталь на существо"
        >
          {allOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={'sculpt-option is-' + option.category}
              aria-label={option.label + ': нажать или перетащить на существо'}
              onPointerDown={(event) => beginOptionDrag(event, option)}
              onPointerMove={moveOptionDrag}
              onPointerUp={finishOptionDrag}
              onPointerCancel={cancelOptionDrag}
            >
              <img src={option.asset} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}

      {optionDrag?.moved && !optionDrag.scrolling && (
        <div
          className="sculpt-drag-preview"
          aria-hidden="true"
          style={{ left: optionDrag.x, top: optionDrag.y }}
        >
          <img src={optionDrag.option.asset} alt="" />
        </div>
      )}
    </section>
  );
}
