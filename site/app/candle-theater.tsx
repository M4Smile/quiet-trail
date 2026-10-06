'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  ArrowLeft,
  Check,
  Eye,
  FlipHorizontal,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import './candle-theater.css';

type LibraryKind = 'entity' | 'decoration';
type TheaterMode = 'enter' | 'edit' | 'playback' | 'result';
type FrameIndex = 0 | 1 | 2;
type TransitionIndex = 0 | 1 | 2;
type FigureAnimationMode = 'static' | 'move' | 'action';
type MovementSpeed = 'slow' | 'normal' | 'fast';
type EntityAnimationFrames = readonly [string, string, string];

interface RoutePoint {
  x: number;
  y: number;
}

interface FigureTransition {
  mode: FigureAnimationMode;
  route: RoutePoint[];
  speed: MovementSpeed;
}

type FigureTransitions = [FigureTransition, FigureTransition, FigureTransition];

interface EntityAnimation {
  move: EntityAnimationFrames;
  gesture: EntityAnimationFrames;
}

interface LibraryItem {
  id: string;
  label: string;
  asset: string;
  kind: LibraryKind;
  baseSize: number;
  animation?: EntityAnimation;
}

interface FigureState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipped: boolean;
}

type FigureFrames = [FigureState | null, FigureState | null, FigureState | null];

interface TheaterFigure {
  instanceId: string;
  assetId: string;
  kind: LibraryKind;
  frames: FigureFrames;
  transitions?: FigureTransitions;
}

export interface CandleArtwork {
  prompt: string;
  figures: TheaterFigure[];
  createdAt: string;
}

interface CandleTheaterProps {
  prompt: string;
  onExit: () => void;
  onFinish: (artwork: CandleArtwork) => void;
}

interface LibraryDrag {
  item: LibraryItem;
  pointerId: number;
}

interface DragPreview {
  item: LibraryItem;
  x: number;
  y: number;
  inside: boolean;
}

interface PlacedGesture {
  instanceId: string;
  points: Map<number, { x: number; y: number }>;
  originClientX: number;
  originClientY: number;
  originX: number;
  originY: number;
  startDistance: number;
  startAngle: number;
  startScale: number;
  startRotation: number;
}

interface RouteGesture {
  instanceId: string;
  pointerId: number;
  transition: TransitionIndex;
  points: RoutePoint[];
}

type ShadowStyle = CSSProperties & {
  '--shadow-x': string;
  '--shadow-y': string;
  '--shadow-width': string;
  '--shadow-facing': string;
  '--shadow-rotation': string;
  '--shadow-opacity': string;
};

const animationFor = (id: string): EntityAnimation => ({
  move: [
    `/game/candle/entities/animations/${id}/move-1.png`,
    `/game/candle/entities/animations/${id}/move-2.png`,
    `/game/candle/entities/animations/${id}/move-3.png`,
  ],
  gesture: [
    `/game/candle/entities/animations/${id}/gesture-1.png`,
    `/game/candle/entities/animations/${id}/gesture-2.png`,
    `/game/candle/entities/animations/${id}/gesture-3.png`,
  ],
});

const animatedEntity = (
  id: string,
  label: string,
  baseSize: number,
): LibraryItem => {
  const animation = animationFor(id);

  return {
    id,
    label,
    asset: animation.gesture[0],
    kind: 'entity',
    baseSize,
    animation,
  };
};

const entityCatalog: LibraryItem[] = [
  animatedEntity('traveller', 'Путник', 24),
  animatedEntity('hare', 'Заяц', 24),
  animatedEntity('raven', 'Птица', 22),
  animatedEntity('fox', 'Лиса', 28),
  animatedEntity('deer', 'Олень', 31),
];

const decorationCatalog: LibraryItem[] = [
  { id: 'tree', label: 'Дерево', asset: '/game/candle/decorations/tree.png', kind: 'decoration', baseSize: 31 },
  { id: 'house', label: 'Дом', asset: '/game/candle/decorations/house.png', kind: 'decoration', baseSize: 35 },
  { id: 'bridge', label: 'Мост', asset: '/game/candle/decorations/bridge.png', kind: 'decoration', baseSize: 36 },
  { id: 'rock', label: 'Камень', asset: '/game/candle/decorations/rock.png', kind: 'decoration', baseSize: 25 },
  { id: 'boat', label: 'Лодка', asset: '/game/candle/decorations/boat.png', kind: 'decoration', baseSize: 34 },
  { id: 'pier', label: 'Причал', asset: '/game/candle/decorations/pier.png', kind: 'decoration', baseSize: 34 },
  { id: 'gate', label: 'Ворота', asset: '/game/candle/decorations/gate.png', kind: 'decoration', baseSize: 34 },
  { id: 'reeds', label: 'Камыш', asset: '/game/candle/decorations/reeds.png', kind: 'decoration', baseSize: 29 },
  { id: 'hill', label: 'Холм', asset: '/game/candle/decorations/hill.png', kind: 'decoration', baseSize: 39 },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

const cloneState = (state: FigureState | null): FigureState | null =>
  state ? { ...state } : null;

const createTransitions = (): FigureTransitions => [
  { mode: 'static', route: [], speed: 'normal' },
  { mode: 'static', route: [], speed: 'normal' },
  { mode: 'static', route: [], speed: 'normal' },
];

const transitionFor = (
  figure: TheaterFigure,
  transition: TransitionIndex,
): FigureTransition =>
  figure.transitions?.[transition] ?? {
    mode: 'static',
    route: [],
    speed: 'normal',
  };

const cloneTransitions = (figure: TheaterFigure): FigureTransitions =>
  ([0, 1, 2] as const).map((transitionIndex) => {
    const transition = transitionFor(figure, transitionIndex);
    return {
      ...transition,
      route: [...transition.route],
      speed: transition.speed ?? 'normal',
    };
  }) as FigureTransitions;

const statesMatch = (
  first: FigureState | null,
  second: FigureState | null,
) => {
  if (!first || !second) return first === second;
  return (
    Math.abs(first.x - second.x) < 0.0001 &&
    Math.abs(first.y - second.y) < 0.0001 &&
    Math.abs(first.scale - second.scale) < 0.0001 &&
    Math.abs(first.rotation - second.rotation) < 0.0001 &&
    Math.abs(first.opacity - second.opacity) < 0.0001 &&
    first.flipped === second.flipped
  );
};

const movementProgress = (progress: number, speed: MovementSpeed) => {
  const durationShare = speed === 'slow' ? 1 : speed === 'fast' ? 0.36 : 0.62;
  return clamp(progress / durationShare, 0, 1);
};

const sampleAlongRoute = (
  start: RoutePoint,
  end: RoutePoint,
  route: RoutePoint[],
  progress: number,
) => {
  const points = [start, ...route, end].filter(
    (point, index, list) =>
      index === 0 ||
      Math.hypot(point.x - list[index - 1].x, point.y - list[index - 1].y) > 0.002,
  );
  if (points.length === 1) {
    return { point: points[0], directionX: 0 };
  }

  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index].x, point.y - points[index].y),
  );
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) {
    return { point: start, directionX: 0 };
  }

  let distance = totalLength * progress;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (distance <= length || index === lengths.length - 1) {
      const segmentProgress = length === 0 ? 0 : clamp(distance / length, 0, 1);
      return {
        point: {
          x: lerp(points[index].x, points[index + 1].x, segmentProgress),
          y: lerp(points[index].y, points[index + 1].y, segmentProgress),
        },
        directionX: points[index + 1].x - points[index].x,
      };
    }
    distance -= length;
  }

  return { point: end, directionX: 0 };
};

const pointAlongRoute = (
  start: RoutePoint,
  end: RoutePoint,
  route: RoutePoint[],
  progress: number,
) => sampleAlongRoute(start, end, route, progress).point;

const flippedAlongRoute = (
  start: RoutePoint,
  end: RoutePoint,
  route: RoutePoint[],
  progress: number,
  fallback: boolean,
) => {
  const { directionX } = sampleAlongRoute(start, end, route, progress);
  return Math.abs(directionX) > 0.002 ? directionX < 0 : fallback;
};

const distanceBetween = (points: Array<{ x: number; y: number }>) =>
  points.length < 2
    ? 0
    : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

const angleBetween = (points: Array<{ x: number; y: number }>) =>
  points.length < 2
    ? 0
    : Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);

const midpointBetween = (points: Array<{ x: number; y: number }>) =>
  points.length < 2
    ? points[0] ?? { x: 0, y: 0 }
    : {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };

const findCatalogItem = (figure: Pick<TheaterFigure, 'assetId' | 'kind'>) =>
  (figure.kind === 'entity' ? entityCatalog : decorationCatalog).find(
    (item) => item.id === figure.assetId,
  );

const animationAsset = (
  item: LibraryItem,
  figure: TheaterFigure,
  playhead: number,
  playbackTime: number,
) => {
  if (!item.animation || playhead >= 3) return item.asset;

  const segment: TransitionIndex = playhead < 1 ? 0 : playhead < 2 ? 1 : 2;
  const animationMode = transitionFor(figure, segment).mode;
  if (animationMode === 'static') return item.asset;

  const movementSpeed = transitionFor(figure, segment).speed ?? 'normal';
  const frames = animationMode === 'move'
    ? item.animation.move
    : item.animation.gesture;
  const framesPerSecond = animationMode === 'move'
    ? movementSpeed === 'slow'
      ? 3.5
      : movementSpeed === 'fast'
        ? 9
        : 6
    : 4.5;
  const sequence = [0, 1, 2, 1] as const;
  // Use the real playback clock instead of the normalized playhead. The
  // playhead intentionally pauses between scenes, but character actions must
  // continue animating during those holds as well.
  const elapsedSeconds = playbackTime / 1000;
  const frame = sequence[Math.floor(elapsedSeconds * framesPerSecond) % sequence.length];

  return frames[frame];
};

const animatedState = (
  figure: TheaterFigure,
  playhead: number,
): FigureState | null => {
  if (playhead >= 2) {
    const state = figure.frames[2];
    if (!state) return null;
    const finalAnimation = transitionFor(figure, 2);
    if (finalAnimation.mode !== 'move' || finalAnimation.route.length === 0) {
      return cloneState(state);
    }

    const end = finalAnimation.route[finalAnimation.route.length - 1];
    const route = finalAnimation.route.slice(0, -1);
    const rawProgress = clamp(playhead - 2, 0, 1);
    const progress = movementProgress(rawProgress, finalAnimation.speed ?? 'normal');
    const eased = progress * progress * (3 - 2 * progress);
    return {
      ...state,
      ...pointAlongRoute(state, end, route, eased),
      flipped: flippedAlongRoute(state, end, route, eased, state.flipped),
    };
  }

  const fromFrame = Math.floor(playhead) as 0 | 1;
  const toFrame = (fromFrame + 1) as 1 | 2;
  const progress = playhead - fromFrame;
  const from = figure.frames[fromFrame];
  const to = figure.frames[toFrame];

  if (!from && !to) return null;

  const transition = transitionFor(figure, fromFrame);
  const transitionMode = figure.kind === 'decoration' ? 'move' : transition.mode;
  if (transitionMode !== 'move') return cloneState(from);

  const start = from ?? { ...to!, opacity: 0 };
  const end = to ?? { ...from!, opacity: 0 };
  const movement = figure.kind === 'decoration'
    ? progress
    : movementProgress(progress, transition.speed ?? 'normal');
  const eased = movement * movement * (3 - 2 * movement);
  const position = pointAlongRoute(start, end, transition.route, eased);

  return {
    ...position,
    scale: lerp(start.scale, end.scale, eased),
    rotation: lerp(start.rotation, end.rotation, eased),
    opacity: lerp(start.opacity, end.opacity, eased),
    flipped: figure.kind === 'entity'
      ? flippedAlongRoute(start, end, transition.route, eased, start.flipped)
      : progress < 0.5
        ? start.flipped
        : end.flipped,
  };
};

export function CandleTheater({ prompt, onExit, onFinish }: CandleTheaterProps) {
  const [mode, setMode] = useState<TheaterMode>('enter');
  const [activeTab, setActiveTab] = useState<LibraryKind>('entity');
  const [figures, setFigures] = useState<TheaterFigure[]>([]);
  const [currentFrame, setCurrentFrame] = useState<FrameIndex>(0);
  const [initializedFrames, setInitializedFrames] = useState<[boolean, boolean, boolean]>([
    true,
    false,
    false,
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [routeDrawingId, setRouteDrawingId] = useState<string | null>(null);
  const [routeDraft, setRouteDraft] = useState<RoutePoint[] | null>(null);

  const stageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const figuresRef = useRef(figures);
  const currentFrameRef = useRef<FrameIndex>(currentFrame);
  const initializedFramesRef = useRef(initializedFrames);
  const libraryDragRef = useRef<LibraryDrag | null>(null);
  const placedGestureRef = useRef<PlacedGesture | null>(null);
  const routeGestureRef = useRef<RouteGesture | null>(null);

  figuresRef.current = figures;
  currentFrameRef.current = currentFrame;
  initializedFramesRef.current = initializedFrames;

  useEffect(() => {
    const timer = window.setTimeout(() => setMode('edit'), 620);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    entityCatalog.forEach((item) => {
      if (!item.animation) return;
      [...item.animation.move, ...item.animation.gesture].forEach((asset) => {
        const image = new window.Image();
        image.src = asset;
      });
    });
  }, []);

  useEffect(() => {
    const onboardingKey = 'tropa-candle-onboarding-v2';
    if (window.localStorage.getItem(onboardingKey)) return;
    setShowOnboarding(true);
    const timer = window.setTimeout(() => {
      setShowOnboarding(false);
      window.localStorage.setItem(onboardingKey, 'seen');
    }, 3600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mode !== 'playback') return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const openingHold = reduceMotion ? 160 : 450;
    const transitionDuration = reduceMotion ? 650 : 3000;
    const middleHold = reduceMotion ? 180 : 520;
    const finalAnimationDuration = reduceMotion ? 650 : 3000;
    const finalHold = reduceMotion ? 350 : 900;
    const firstTransitionEnds = openingHold + transitionDuration;
    const secondTransitionStarts = firstTransitionEnds + middleHold;
    const secondTransitionEnds = secondTransitionStarts + transitionDuration;
    const finalAnimationEnds = secondTransitionEnds + finalAnimationDuration;
    const finishAt = finalAnimationEnds + finalHold;
    const startedAt = window.performance.now();
    let animationFrame = 0;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      let nextPlayhead = 0;

      if (elapsed > openingHold && elapsed <= firstTransitionEnds) {
        nextPlayhead = (elapsed - openingHold) / transitionDuration;
      } else if (elapsed > firstTransitionEnds && elapsed <= secondTransitionStarts) {
        nextPlayhead = 1;
      } else if (
        elapsed > secondTransitionStarts &&
        elapsed <= secondTransitionEnds
      ) {
        nextPlayhead = Math.min(
          2,
          1 + (elapsed - secondTransitionStarts) / transitionDuration,
        );
      } else if (elapsed > secondTransitionEnds) {
        nextPlayhead = Math.min(
          3,
          2 + (elapsed - secondTransitionEnds) / finalAnimationDuration,
        );
      }

      setPlayhead(nextPlayhead);
      setPlaybackTime(elapsed);

      if (elapsed >= finishAt) {
        setPlayhead(3);
        setPlaybackTime(finishAt);
        setCurrentFrame(2);
        setMode('result');
        return;
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [mode]);

  const normalizedPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const stageRect = stageRef.current?.getBoundingClientRect();
    return {
      inside:
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom,
      stageInside: stageRect
        ? clientX >= stageRect.left &&
          clientX <= stageRect.right &&
          clientY >= stageRect.top &&
          clientY <= stageRect.bottom
        : false,
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
      rect,
    };
  };

  const constrainPosition = (
    item: LibraryItem,
    scale: number,
    x: number,
    y: number,
  ) => {
    // Keep figures fully inside the fabric. Decorations use wider horizontal
    // bounds below so they can spill onto either side of the cloth.
    const horizontalPadding = clamp((item.baseSize / 100) * scale * 0.5, 0.04, 0.46);
    const verticalPadding = clamp((item.baseSize / 100) * scale * 0.46, 0.04, 0.46);
    let minX = horizontalPadding;
    let maxX = 1 - horizontalPadding;

    if (item.kind === 'decoration') {
      // Let a decoration cross the fabric edge. The canvas clips the part
      // that falls outside, leaving only the portion on the lit fabric visible.
      const sideSpill = horizontalPadding * 0.55;
      minX = -sideSpill;
      maxX = 1 + sideSpill;
    }

    return {
      x: clamp(x, minX, maxX),
      y: clamp(y, verticalPadding, 1 - verticalPadding),
    };
  };

  const initializeThrough = (targetFrame: FrameIndex) => {
    const framesToInitialize: [boolean, boolean, boolean] = [false, false, false];
    const nextInitialized: [boolean, boolean, boolean] = [
      ...initializedFramesRef.current,
    ];

    for (let frame = 1; frame <= targetFrame; frame += 1) {
      framesToInitialize[frame] = !nextInitialized[frame];
      nextInitialized[frame] = true;
    }

    setFigures((current) =>
      current.map((figure) => {
        const frames: FigureFrames = [
          cloneState(figure.frames[0]),
          cloneState(figure.frames[1]),
          cloneState(figure.frames[2]),
        ];

        for (let frame = 1; frame <= targetFrame; frame += 1) {
          if (framesToInitialize[frame]) frames[frame] = cloneState(frames[frame - 1]);
        }

        return { ...figure, frames };
      }),
    );

    initializedFramesRef.current = nextInitialized;
    setInitializedFrames(nextInitialized);
  };

  const switchFrame = (frame: FrameIndex) => {
    if (!initializedFramesRef.current[frame]) initializeThrough(frame);
    currentFrameRef.current = frame;
    setCurrentFrame(frame);
    setSelectedId(null);
    setOpacityOpen(false);
    setRouteDrawingId(null);
    setRouteDraft(null);
    routeGestureRef.current = null;
  };

  const updateFigureFrame = (
    instanceId: string,
    update: (state: FigureState) => FigureState,
  ) => {
    const frame = currentFrameRef.current;
    setFigures((current) =>
      current.map((figure) => {
        if (figure.instanceId !== instanceId || !figure.frames[frame]) return figure;
        const frames = [...figure.frames] as FigureFrames;
        let previousOriginal = figure.frames[frame]!;
        let previousUpdated = update(previousOriginal);
        frames[frame] = previousUpdated;

        for (let nextFrame = frame + 1; nextFrame <= 2; nextFrame += 1) {
          const downstreamOriginal = frames[nextFrame];
          if (!statesMatch(downstreamOriginal, previousOriginal)) break;
          frames[nextFrame] = cloneState(previousUpdated);
          previousOriginal = downstreamOriginal!;
          previousUpdated = frames[nextFrame]!;
        }
        return { ...figure, frames };
      }),
    );
  };

  const updateFigureOpacity = (instanceId: string, opacity: number) => {
    setFigures((current) =>
      current.map((figure) => {
        if (figure.instanceId !== instanceId) return figure;
        const frames = figure.frames.map((state) =>
          state ? { ...state, opacity } : null,
        ) as FigureFrames;
        return { ...figure, frames };
      }),
    );
  };

  const updateFigureTransition = (
    instanceId: string,
    transitionIndex: TransitionIndex,
    update: (transition: FigureTransition) => FigureTransition,
  ) => {
    setFigures((current) =>
      current.map((figure) => {
        if (figure.instanceId !== instanceId) return figure;
        const transitions = cloneTransitions(figure);
        transitions[transitionIndex] = update(transitions[transitionIndex]);
        return { ...figure, transitions };
      }),
    );
  };

  const setFigureAnimationMode = (
    instanceId: string,
    animationMode: FigureAnimationMode,
  ) => {
    const frame = currentFrameRef.current;
    updateFigureTransition(instanceId, frame, (transition) => ({
      ...transition,
      mode: animationMode,
    }));
    setRouteDraft(null);
    routeGestureRef.current = null;
    setRouteDrawingId(animationMode === 'move' ? instanceId : null);
  };

  const setMovementSpeed = (
    instanceId: string,
    speed: MovementSpeed,
  ) => {
    updateFigureTransition(instanceId, currentFrameRef.current, (transition) => ({
      ...transition,
      speed,
    }));
  };

  const beginRouteDrawing = (event: ReactPointerEvent<HTMLElement>) => {
    const instanceId = routeDrawingId;
    const transition = currentFrameRef.current;
    if (mode !== 'edit' || !instanceId) return false;

    const figure = figuresRef.current.find((item) => item.instanceId === instanceId);
    const state = figure?.frames[transition];
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!figure || !state || !point?.inside) return false;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const firstPoint = { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
    const routeStart = { x: state.x, y: state.y };
    routeGestureRef.current = {
      instanceId,
      pointerId: event.pointerId,
      transition,
      points: [routeStart, firstPoint],
    };
    setRouteDraft([routeStart, firstPoint]);
    return true;
  };

  const moveRouteDrawing = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = routeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point) return false;

    event.preventDefault();
    event.stopPropagation();
    const nextPoint = { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
    const lastPoint = gesture.points[gesture.points.length - 1];
    if (
      gesture.points.length < 160 &&
      Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y) > 0.008
    ) {
      gesture.points.push(nextPoint);
      setRouteDraft([...gesture.points]);
    }
    return true;
  };

  const endRouteDrawing = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = routeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    moveRouteDrawing(event);

    const route = [...gesture.points];
    const destination = route[route.length - 1];
    const targetFrame = gesture.transition < 2
      ? ((gesture.transition + 1) as 1 | 2)
      : null;
    if (targetFrame !== null && !initializedFramesRef.current[targetFrame]) {
      initializeThrough(targetFrame);
    }

    setFigures((current) =>
      current.map((figure) => {
        if (figure.instanceId !== gesture.instanceId) return figure;
        const transitions = cloneTransitions(figure);
        const frames = [...figure.frames] as FigureFrames;
        const item = findCatalogItem(figure);
        let savedRoute = route;

        if (targetFrame !== null) {
          const source = frames[gesture.transition];
          const originalTarget = frames[targetFrame] ?? cloneState(source);
          if (originalTarget && item) {
            const position = constrainPosition(
              item,
              originalTarget.scale,
              destination.x,
              destination.y,
            );
            const routePoints = route.slice(1, -1);
            const updatedTarget = {
              ...originalTarget,
              ...position,
              flipped: source
                ? flippedAlongRoute(source, position, routePoints, 1, source.flipped)
                : originalTarget.flipped,
            };
            frames[targetFrame] = updatedTarget;
            savedRoute = routePoints;

            if (
              targetFrame === 1 &&
              statesMatch(frames[2], originalTarget)
            ) {
              frames[2] = cloneState(updatedTarget);
            }
          }
        } else if (frames[2] && item) {
          const position = constrainPosition(
            item,
            frames[2].scale,
            destination.x,
            destination.y,
          );
          savedRoute = [...route.slice(1, -1), position];
        }

        transitions[gesture.transition] = {
          ...transitions[gesture.transition],
          mode: 'move',
          route: savedRoute,
        };
        return { ...figure, frames, transitions };
      }),
    );

    routeGestureRef.current = null;
    setRouteDraft(null);
    setRouteDrawingId(null);
    return true;
  };

  const cancelRouteDrawing = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = routeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    routeGestureRef.current = null;
    setRouteDraft(null);
    return true;
  };

  const addFigure = (item: LibraryItem, x: number, y: number) => {
    const position = constrainPosition(item, 1, x, y);
    const state: FigureState = {
      ...position,
      scale: 1,
      rotation: 0,
      opacity: 1,
      flipped: false,
    };
    const frames: FigureFrames = [null, null, null];
    for (let frame = currentFrameRef.current; frame <= 2; frame += 1) {
      frames[frame] = cloneState(state);
    }

    const next: TheaterFigure = {
      instanceId: `${item.kind}-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      assetId: item.id,
      kind: item.kind,
      frames,
      transitions: createTransitions(),
    };

    setFigures((current) => [...current, next]);
    setSelectedId(next.instanceId);
    setOpacityOpen(false);
    setRouteDrawingId(null);
    setRouteDraft(null);
    setShowOnboarding(false);
  };

  const beginLibraryDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: LibraryItem,
  ) => {
    if (mode !== 'edit') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    libraryDragRef.current = { item, pointerId: event.pointerId };
    setDragPreview({ item, x: event.clientX, y: event.clientY, inside: false });
  };

  const moveLibraryDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = libraryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    const canPlace = Boolean(
      point?.inside || (drag.item.kind === 'decoration' && point?.stageInside),
    );
    setDragPreview({ item: drag.item, x: event.clientX, y: event.clientY, inside: canPlace });
  };

  const endLibraryDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = libraryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    const canPlace = point?.inside || (drag.item.kind === 'decoration' && point?.stageInside);
    if (point && canPlace) addFigure(drag.item, point.x, point.y);
    libraryDragRef.current = null;
    setDragPreview(null);
  };

  const cancelLibraryDrag = () => {
    libraryDragRef.current = null;
    setDragPreview(null);
  };

  const addFromKeyboard = (item: LibraryItem) => {
    const count = figuresRef.current.filter(
      (figure) => figure.frames[currentFrameRef.current],
    ).length;
    addFigure(item, 0.28 + (count % 4) * 0.15, 0.45 + (Math.floor(count / 4) % 2) * 0.23);
  };

  const beginPlacedGesture = (
    event: ReactPointerEvent<HTMLButtonElement>,
    figure: TheaterFigure,
    visibleState: FigureState,
  ) => {
    if (mode !== 'edit') return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(figure.instanceId);
    setOpacityOpen(false);
    setRouteDrawingId(null);
    setRouteDraft(null);

    const liveState =
      figuresRef.current.find((item) => item.instanceId === figure.instanceId)?.frames[
        currentFrameRef.current
      ] ?? visibleState;

    let gesture = placedGestureRef.current;
    if (!gesture || gesture.instanceId !== figure.instanceId) {
      gesture = {
        instanceId: figure.instanceId,
        points: new Map(),
        originClientX: event.clientX,
        originClientY: event.clientY,
        originX: liveState.x,
        originY: liveState.y,
        startDistance: 0,
        startAngle: 0,
        startScale: liveState.scale,
        startRotation: liveState.rotation,
      };
      placedGestureRef.current = gesture;
    }

    gesture.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.points.size === 2) {
      const points = [...gesture.points.values()];
      const middle = midpointBetween(points);
      gesture.originClientX = middle.x;
      gesture.originClientY = middle.y;
      gesture.originX = liveState.x;
      gesture.originY = liveState.y;
      gesture.startDistance = distanceBetween(points);
      gesture.startAngle = angleBetween(points);
      gesture.startScale = liveState.scale;
      gesture.startRotation = liveState.rotation;
    }
  };

  const movePlacedGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = placedGestureRef.current;
    if (!gesture || !gesture.points.has(event.pointerId)) return;
    event.preventDefault();
    gesture.points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const figure = figuresRef.current.find((item) => item.instanceId === gesture.instanceId);
    const state = figure?.frames[currentFrameRef.current];
    const item = figure ? findCatalogItem(figure) : undefined;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!figure || !state || !item || !rect) return;

    const points = [...gesture.points.values()];
    if (points.length >= 2) {
      const distance = distanceBetween(points);
      const angle = angleBetween(points);
      const middle = midpointBetween(points);
      const scale = clamp(
        gesture.startScale * (distance / Math.max(gesture.startDistance, 1)),
        0.6,
        1.8,
      );
      const position = constrainPosition(
        item,
        scale,
        gesture.originX + (middle.x - gesture.originClientX) / rect.width,
        gesture.originY + (middle.y - gesture.originClientY) / rect.height,
      );
      const rotation = gesture.startRotation + ((angle - gesture.startAngle) * 180) / Math.PI;

      updateFigureFrame(figure.instanceId, (current) => ({
        ...current,
        ...position,
        scale,
        rotation,
      }));
      return;
    }

    const point = points[0];
    const position = constrainPosition(
      item,
      state.scale,
      gesture.originX + (point.x - gesture.originClientX) / rect.width,
      gesture.originY + (point.y - gesture.originClientY) / rect.height,
    );
    updateFigureFrame(figure.instanceId, (current) => ({ ...current, ...position }));
  };

  const endPlacedGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = placedGestureRef.current;
    if (!gesture || !gesture.points.has(event.pointerId)) return;
    gesture.points.delete(event.pointerId);

    if (gesture.points.size === 0) {
      placedGestureRef.current = null;
      return;
    }

    const remaining = [...gesture.points.values()][0];
    const state = figuresRef.current.find(
      (figure) => figure.instanceId === gesture.instanceId,
    )?.frames[currentFrameRef.current];

    if (state) {
      gesture.originClientX = remaining.x;
      gesture.originClientY = remaining.y;
      gesture.originX = state.x;
      gesture.originY = state.y;
      gesture.startScale = state.scale;
      gesture.startRotation = state.rotation;
      gesture.startDistance = 0;
      gesture.startAngle = 0;
    }
  };

  const scaleOrRotateWithWheel = (
    event: ReactWheelEvent<HTMLButtonElement>,
    figure: TheaterFigure,
    state: FigureState,
  ) => {
    if (mode !== 'edit') return;
    event.preventDefault();
    event.stopPropagation();
    const item = findCatalogItem(figure);
    if (!item) return;

    if (event.shiftKey) {
      updateFigureFrame(figure.instanceId, (current) => ({
        ...current,
        rotation: current.rotation + (event.deltaY < 0 ? -4 : 4),
      }));
      return;
    }

    const scale = clamp(state.scale + (event.deltaY < 0 ? 0.08 : -0.08), 0.6, 1.8);
    const position = constrainPosition(item, scale, state.x, state.y);
    updateFigureFrame(figure.instanceId, (current) => ({ ...current, ...position, scale }));
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const frame = currentFrameRef.current;
    setFigures((current) =>
      current
        .map((figure) => {
          if (figure.instanceId !== selectedId) return figure;
          const frames = [...figure.frames] as FigureFrames;
          frames[frame] = null;
          return { ...figure, frames };
        })
        .filter((figure) => figure.frames.some(Boolean)),
    );
    setSelectedId(null);
    setOpacityOpen(false);
    setRouteDrawingId(null);
    setRouteDraft(null);
    routeGestureRef.current = null;
  };

  const flipSelected = () => {
    if (!selectedId) return;
    updateFigureFrame(selectedId, (state) => ({ ...state, flipped: !state.flipped }));
  };

  const startPlayback = () => {
    initializeThrough(2);
    setSelectedId(null);
    setOpacityOpen(false);
    setRouteDrawingId(null);
    setRouteDraft(null);
    routeGestureRef.current = null;
    setShowOnboarding(false);
    setPlayhead(0);
    setPlaybackTime(0);
    setMode('playback');
  };

  const finish = () => {
    const artwork: CandleArtwork = {
      prompt,
      figures: figuresRef.current,
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem('tropa-candle-artwork-latest', JSON.stringify(artwork));
    onFinish(artwork);
  };

  const selectedFigure = figures.find((figure) => figure.instanceId === selectedId);
  const selectedState = selectedFigure?.frames[currentFrame] ?? null;
  const selectedTransitionIndex: TransitionIndex = currentFrame;
  const selectedTransition = selectedFigure
    ? transitionFor(selectedFigure, selectedTransitionIndex)
    : null;
  const selectedRoutePoints = (() => {
    if (
      !selectedFigure ||
      !selectedState ||
      selectedFigure.kind !== 'entity'
    ) return [];

    const start = { x: selectedState.x, y: selectedState.y };
    if (routeDrawingId === selectedFigure.instanceId && routeDraft) {
      return routeDraft;
    }
    if (selectedTransition?.mode !== 'move') return [];

    if (selectedTransitionIndex === 2) {
      return [start, ...selectedTransition.route];
    }

    const target = selectedFigure.frames[(selectedTransitionIndex + 1) as 1 | 2];
    return target
      ? [start, ...selectedTransition.route, { x: target.x, y: target.y }]
      : [start, ...selectedTransition.route];
  })();
  const hasFigures = figures.some((figure) => figure.frames.some(Boolean));
  const visibleFigures = figures
    .map((figure) => ({
      figure,
      state:
        mode === 'playback'
          ? animatedState(figure, playhead)
          : mode === 'result'
            ? animatedState(figure, 3)
            : cloneState(figure.frames[currentFrame]),
    }))
    .filter((entry): entry is { figure: TheaterFigure; state: FigureState } => Boolean(entry.state))
    .sort((first, second) =>
      first.figure.kind === second.figure.kind
        ? 0
        : first.figure.kind === 'decoration'
          ? -1
          : 1,
    );

  return (
    <main
      className={[
        'game-page',
        'candle-page',
        `is-${mode}`,
        dragPreview?.inside ? 'has-stage-drag' : '',
      ].join(' ')}
    >
      <section ref={stageRef} className="game-scene candle-stage" aria-label="Театр теней">
        <img
          className="candle-stage-background"
          src="/game/candle/theater-interior.png"
          alt="Тёмный вагончик с освещённой тканевой ширмой"
          draggable={false}
        />

        {mode === 'edit' || mode === 'enter' ? (
          <header className="candle-topbar">
            <button
              type="button"
              className="candle-round-button"
              aria-label="Вернуться к путешествию"
              onClick={onExit}
            >
              <X aria-hidden="true" />
            </button>
            <button
              type="button"
              className="candle-round-button candle-watch-button"
              aria-label="Смотреть спектакль"
              disabled={!hasFigures}
              onClick={startPlayback}
            >
              <Play aria-hidden="true" />
            </button>
          </header>
        ) : null}

        <div
          ref={canvasRef}
          className={[
            'shadow-canvas',
            routeDrawingId ? 'is-drawing-route' : '',
          ].filter(Boolean).join(' ')}
          onPointerDown={(event) => {
            if (beginRouteDrawing(event)) return;
            setSelectedId(null);
            setOpacityOpen(false);
          }}
          onPointerMove={moveRouteDrawing}
          onPointerUp={endRouteDrawing}
          onPointerCancel={cancelRouteDrawing}
          aria-label="Освещённая ткань для постановки теней"
        >
          <div className="candle-light" aria-hidden="true" />

          {selectedRoutePoints.length > 1 ? (
            <svg
              className="candle-route-layer"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                points={selectedRoutePoints
                  .map((point) => `${point.x * 100},${point.y * 100}`)
                  .join(' ')}
              />
              <circle
                className="is-start"
                cx={selectedRoutePoints[0].x * 100}
                cy={selectedRoutePoints[0].y * 100}
                r="1.25"
              />
              <circle
                className="is-finish"
                cx={selectedRoutePoints[selectedRoutePoints.length - 1].x * 100}
                cy={selectedRoutePoints[selectedRoutePoints.length - 1].y * 100}
                r="1.45"
              />
            </svg>
          ) : null}

          {mode === 'edit' && routeDrawingId ? (
            <div className="candle-route-hint" role="status">
              {currentFrame === 2
                ? 'Нарисуй движение финального кадра'
                : `Проведи путь к кадру ${currentFrame + 2}`}
            </div>
          ) : null}

          {visibleFigures.map(({ figure, state }) => {
            const item = findCatalogItem(figure);
            if (!item) return null;
            const selected = selectedId === figure.instanceId && mode === 'edit';
            const asset = mode === 'playback'
              ? animationAsset(item, figure, playhead, playbackTime)
              : item.asset;
            const style: ShadowStyle = {
              '--shadow-x': `${state.x * 100}%`,
              '--shadow-y': `${state.y * 100}%`,
              '--shadow-width': `${item.baseSize * state.scale}%`,
              '--shadow-facing': state.flipped ? '-1' : '1',
              '--shadow-rotation': `${state.rotation}deg`,
              '--shadow-opacity': String(mode === 'edit' ? Math.max(0.08, state.opacity) : state.opacity),
            };

            return (
              <button
                key={figure.instanceId}
                type="button"
                className={[
                  'shadow-instance',
                  `is-${figure.kind}`,
                  selected ? 'is-selected' : '',
                ].filter(Boolean).join(' ')}
                style={style}
                aria-label={`${item.label}. Перемещение одним пальцем, масштаб и поворот двумя.`}
                disabled={mode !== 'edit'}
                onPointerDown={(event) => {
                  if (
                    routeDrawingId === figure.instanceId &&
                    beginRouteDrawing(event)
                  ) return;
                  beginPlacedGesture(event, figure, state);
                }}
                onPointerMove={(event) => {
                  if (!moveRouteDrawing(event)) movePlacedGesture(event);
                }}
                onPointerUp={(event) => {
                  if (!endRouteDrawing(event)) endPlacedGesture(event);
                }}
                onPointerCancel={(event) => {
                  if (!cancelRouteDrawing(event)) endPlacedGesture(event);
                }}
                onWheel={(event) => scaleOrRotateWithWheel(event, figure, state)}
                onDoubleClick={() =>
                  updateFigureFrame(figure.instanceId, (current) => ({ ...current, flipped: !current.flipped }))
                }
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 0.04 : 0.015;
                  if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault();
                    const frames = [...figure.frames] as FigureFrames;
                    frames[currentFrame] = null;
                    setFigures((current) =>
                      current
                        .map((entry) => entry.instanceId === figure.instanceId ? { ...entry, frames } : entry)
                        .filter((entry) => entry.frames.some(Boolean)),
                    );
                    setSelectedId(null);
                  } else if (event.key === '[' || event.key === ']') {
                    event.preventDefault();
                    updateFigureFrame(figure.instanceId, (current) => ({
                      ...current,
                      rotation: current.rotation + (event.key === '[' ? -5 : 5),
                    }));
                  } else if (event.key.startsWith('Arrow')) {
                    event.preventDefault();
                    updateFigureFrame(figure.instanceId, (current) => {
                      const position = constrainPosition(
                        item,
                        current.scale,
                        current.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                        current.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
                      );
                      return { ...current, ...position };
                    });
                  }
                }}
              >
                <img key={asset} src={asset} alt="" draggable={false} />
              </button>
            );
          })}

          <div className="fabric-overlay" aria-hidden="true" />
        </div>

        {mode === 'edit' && showOnboarding ? (
          <div className="candle-onboarding" role="status">
            Собери маленькую историю из теней
          </div>
        ) : null}

        {mode === 'edit' ? (
          <nav className="candle-frame-switcher" aria-label="Кадры спектакля">
            {([0, 1, 2] as const).map((frame) => (
              <button
                key={frame}
                type="button"
                className={frame === currentFrame ? 'is-active' : ''}
                aria-label={`Кадр ${frame + 1}`}
                aria-current={frame === currentFrame ? 'step' : undefined}
                onClick={() => switchFrame(frame)}
              >
                <span aria-hidden="true" />
                {frame + 1}
              </button>
            ))}
          </nav>
        ) : null}

        {mode === 'result' ? (
          <div className="candle-result" role="status">
            <button
              type="button"
              onClick={() => {
                setCurrentFrame(2);
                setMode('edit');
              }}
            >
              <ArrowLeft aria-hidden="true" />
              Изменить
            </button>
            <button type="button" className="is-finish" onClick={finish}>
              <Check aria-hidden="true" />
              Готово
            </button>
          </div>
        ) : null}
      </section>

      {mode === 'edit' && selectedFigure && selectedState ? (
        <aside className="candle-bottom-sheet candle-object-panel" aria-label="Настройки фигуры">
          <div className="candle-sheet-handle" aria-hidden="true" />
          <div className="candle-object-actions">
            <button
              type="button"
              aria-label="Вернуться к фигуркам"
              onClick={() => {
                setSelectedId(null);
                setOpacityOpen(false);
                setRouteDrawingId(null);
                setRouteDraft(null);
              }}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <button type="button" aria-label="Отразить фигуру" onClick={flipSelected}>
              <FlipHorizontal aria-hidden="true" />
              <span>Отразить</span>
            </button>
            <button
              type="button"
              className={opacityOpen ? 'is-active' : ''}
              aria-label="Изменить прозрачность"
              aria-expanded={opacityOpen}
              onClick={() => setOpacityOpen((open) => !open)}
            >
              <Eye aria-hidden="true" />
              <span>Тень</span>
            </button>
            <button type="button" className="is-delete" aria-label="Удалить из этого кадра" onClick={removeSelected}>
              <Trash2 aria-hidden="true" />
            </button>
          </div>

          {selectedFigure.kind === 'entity' ? (
            <div className="candle-animation-panel">
              <div className="candle-animation-modes" role="group" aria-label="Тип анимации">
                <button
                  type="button"
                  className={selectedTransition?.mode === 'move' ? 'is-active' : ''}
                  aria-pressed={selectedTransition?.mode === 'move'}
                  onClick={() =>
                    setFigureAnimationMode(
                      selectedFigure.instanceId,
                      selectedTransition?.mode === 'move' ? 'static' : 'move',
                    )
                  }
                >
                  Движение
                </button>
                <button
                  type="button"
                  className={selectedTransition?.mode === 'action' ? 'is-active' : ''}
                  aria-pressed={selectedTransition?.mode === 'action'}
                  onClick={() =>
                    setFigureAnimationMode(
                      selectedFigure.instanceId,
                      selectedTransition?.mode === 'action' ? 'static' : 'action',
                    )
                  }
                >
                  Действие
                </button>
              </div>
              {selectedTransition?.mode === 'move' ? (
                <>
                  <div className="candle-speed-options" role="group" aria-label="Скорость движения">
                    {([
                      ['slow', 'Медленно'],
                      ['normal', 'Обычно'],
                      ['fast', 'Быстро'],
                    ] as const).map(([speed, label]) => (
                      <button
                        key={speed}
                        type="button"
                        className={selectedTransition.speed === speed ? 'is-active' : ''}
                        aria-pressed={selectedTransition.speed === speed}
                        onClick={() => setMovementSpeed(selectedFigure.instanceId, speed)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={[
                      'candle-route-button',
                      routeDrawingId === selectedFigure.instanceId ? 'is-drawing' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      setRouteDraft(null);
                      routeGestureRef.current = null;
                      setRouteDrawingId((current) =>
                        current === selectedFigure.instanceId
                          ? null
                          : selectedFigure.instanceId,
                      );
                    }}
                  >
                    {routeDrawingId === selectedFigure.instanceId
                      ? 'Отменить рисование'
                      : selectedTransition.route.length > 0
                        ? 'Перерисовать маршрут'
                        : 'Нарисовать маршрут'}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {opacityOpen ? (
            <label className="candle-opacity-control">
              <span>Прозрачность</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(selectedState.opacity * 100)}
                onChange={(event) =>
                  updateFigureOpacity(
                    selectedFigure.instanceId,
                    Number(event.target.value) / 100,
                  )
                }
              />
              <output>{Math.round(selectedState.opacity * 100)}%</output>
            </label>
          ) : null}
        </aside>
      ) : mode === 'edit' ? (
        <Tabs
          className="candle-bottom-sheet candle-library"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as LibraryKind)}
        >
          <div className="candle-sheet-handle" aria-hidden="true" />
          <TabsList className="candle-tabs-list">
            <TabsTrigger value="entity">Сущности</TabsTrigger>
            <TabsTrigger value="decoration">Декорации</TabsTrigger>
          </TabsList>

          {(['entity', 'decoration'] as const).map((kind) => (
            <TabsContent key={kind} value={kind} className="candle-library-content">
              <div className="candle-library-row">
                {(kind === 'entity' ? entityCatalog : decorationCatalog).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="candle-prop"
                    aria-label={`${item.label}: перетащить на ткань${kind === 'decoration' ? ' или к её краю' : ''}`}
                    onPointerDown={(event) => beginLibraryDrag(event, item)}
                    onPointerMove={moveLibraryDrag}
                    onPointerUp={endLibraryDrag}
                    onPointerCancel={cancelLibraryDrag}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        addFromKeyboard(item);
                      }
                    }}
                  >
                    <img src={item.asset} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : null}

      {dragPreview ? (
        <div
          className={`candle-drag-preview${dragPreview.inside ? ' is-over-stage' : ''}`}
          style={{ left: dragPreview.x, top: dragPreview.y }}
          aria-hidden="true"
        >
          <img src={dragPreview.item.asset} alt="" />
        </div>
      ) : null}

      {mode === 'enter' ? <div className="candle-entry-flash" aria-hidden="true" /> : null}
    </main>
  );
}
