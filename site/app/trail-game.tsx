'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  createRandomScene,
  initialScene,
  type GameScene,
} from '@/lib/story-generator';
import { CandleTheater } from '@/app/candle-theater';
import {
  addWatercolorPuddle,
  createWatercolorSimulation,
  paintWatercolorStroke,
  renderWatercolorLayer,
  stepWatercolorSimulation,
  type PigmentProfile,
  type WatercolorSimulation,
} from '@/lib/watercolor';
import {
  SculptureDeck,
  SculptureFigure,
  useSculpture,
} from '@/app/sculpture-workshop';
import { MusicDeck, MusicStage, useMusicWorkshop } from '@/app/music-workshop';
import { PsychologyJournal } from '@/app/psychology-journal';
import { usePsychologyJournal } from '@/hooks/use-psychology-journal';
import type {
  JourneyActivity,
  PaintingActivitySignals,
} from '@/lib/psychology';

type ToolId = 'brush' | 'music' | 'modeling' | 'hand';
type Phase =
  | 'choose'
  | 'paint'
  | 'sculpt'
  | 'music'
  | 'candle'
  | 'complete';

interface DragState {
  id: ToolId;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
}

interface SceneColor {
  red: number;
  green: number;
  blue: number;
}

interface ColoringBuffers {
  width: number;
  height: number;
  base: Uint8ClampedArray;
  labels: Uint32Array;
  colors: Map<number, SceneColor>;
}

interface ColoringFillAnimation {
  label: number;
  originX: number;
  originY: number;
  radius: number;
  feather: number;
  previous?: SceneColor;
  next: SceneColor;
}

interface PendingColoringFill {
  buffers: ColoringBuffers;
  label: number;
  color: SceneColor;
}

interface HeldWeatherStroke {
  x: number;
  y: number;
  displayX: number;
  displayY: number;
  lastMoveAt: number;
  lastStampAt: number;
  pigment: PigmentProfile;
}

interface PaintingStats {
  colorUses: Map<string, number>;
  actions: number;
  filledRegions: number;
  recoloredRegions: number;
  strokes: number;
  speedTotal: number;
  speedSamples: number;
}

const emptyPaintingStats = (): PaintingStats => ({
  colorUses: new Map(),
  actions: 0,
  filledRegions: 0,
  recoloredRegions: 0,
  strokes: 0,
  speedTotal: 0,
  speedSamples: 0,
});

const tools: Array<{ id: ToolId; label: string; asset: string }> = [
  { id: 'brush', label: 'Кисть', asset: '/game/cards/brush.webp' },
  { id: 'music', label: 'Нота', asset: '/game/cards/music.webp' },
  { id: 'modeling', label: 'Клякса', asset: '/game/cards/modeling.webp' },
  { id: 'hand', label: 'Свеча', asset: '/game/cards/candle.png' },
];

const scenePalette = [
  '#c84f42',
  '#df7651',
  '#e39b3b',
  '#e7c24c',
  '#a9bd5a',
  '#668a59',
  '#3d8c83',
  '#5aa6b5',
  '#4c7fa5',
  '#5e6798',
  '#80649a',
  '#c4778e',
  '#7b5138',
  '#3e3734',
];
const weatherPigments: PigmentProfile[] = [
  {
    color: '#496c9b',
    name: 'Ультрамарин',
    spread: 0.62,
    granulation: 0.92,
    opacity: 0.66,
    staining: 0.52,
  },
  {
    color: '#6d9fc2',
    name: 'Кобальт',
    spread: 0.68,
    granulation: 0.54,
    opacity: 0.58,
    staining: 0.42,
  },
  {
    color: '#4f9d9a',
    name: 'Бирюза',
    spread: 0.82,
    granulation: 0.34,
    opacity: 0.56,
    staining: 0.48,
  },
  {
    color: '#75658f',
    name: 'Фиолетовый',
    spread: 0.57,
    granulation: 0.7,
    opacity: 0.64,
    staining: 0.58,
  },
  {
    color: '#c96f7d',
    name: 'Розовый',
    spread: 0.61,
    granulation: 0.24,
    opacity: 0.68,
    staining: 0.76,
  },
  {
    color: '#cc7455',
    name: 'Киноварь',
    spread: 0.55,
    granulation: 0.32,
    opacity: 0.72,
    staining: 0.7,
  },
  {
    color: '#d5a64f',
    name: 'Охра',
    spread: 0.66,
    granulation: 0.76,
    opacity: 0.62,
    staining: 0.64,
  },
  {
    color: '#e7ca62',
    name: 'Солнечный жёлтый',
    spread: 0.88,
    granulation: 0.16,
    opacity: 0.48,
    staining: 0.36,
  },
];
const weatherPalette = weatherPigments.map((pigment) => pigment.color);

const skyMaskAssets: Record<string, string> = {
  'lake-bridge': '/game/masks/lake-bridge.jpg',
  'quiet-bay': '/game/masks/quiet-bay.jpg',
  crossroads: '/game/masks/crossroads.png',
  'swamp-pier': '/game/masks/swamp-pier.jpg',
};

type SceneCharacterStyle = CSSProperties & {
  '--start-x': string;
  '--start-y': string;
  '--end-x': string;
  '--end-y': string;
  '--encounter-x': string;
  '--encounter-y': string;
  '--traveler-size': string;
  '--encounter-size': string;
  '--bubble-x': string;
  '--bubble-y': string;
  '--travel-duration': string;
};

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('Не удалось загрузить изображение сцены'));
    image.src = source;
  });

const drawImageCover = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) => {
  const scale = Math.max(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
};

const buildContourLabels = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) => {
  const pixelCount = width * height;
  const ink = new Uint8Array(pixelCount);
  const barrier = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const luminance =
      pixels[offset] * 0.2126 +
      pixels[offset + 1] * 0.7152 +
      pixels[offset + 2] * 0.0722;
    ink[index] = luminance < 210 ? 1 : 0;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!ink[index]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx;
          if (nextX >= 0 && nextX < width) {
            barrier[nextY * width + nextX] = 1;
          }
        }
      }
    }
  }

  const labels = new Uint32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let nextLabel = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (barrier[start] || labels[start]) continue;
    nextLabel += 1;
    let read = 0;
    let write = 0;
    queue[write++] = start;
    labels[start] = nextLabel;

    while (read < write) {
      const index = queue[read++];
      const x = index % width;
      const top = index - width;
      const bottom = index + width;
      const left = index - 1;
      const right = index + 1;

      if (top >= 0 && !barrier[top] && !labels[top]) {
        labels[top] = nextLabel;
        queue[write++] = top;
      }
      if (bottom < pixelCount && !barrier[bottom] && !labels[bottom]) {
        labels[bottom] = nextLabel;
        queue[write++] = bottom;
      }
      if (x > 0 && !barrier[left] && !labels[left]) {
        labels[left] = nextLabel;
        queue[write++] = left;
      }
      if (x < width - 1 && !barrier[right] && !labels[right]) {
        labels[right] = nextLabel;
        queue[write++] = right;
      }
    }
  }

  return labels;
};

const hexToRgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
};

const renderColoringScene = (
  canvas: HTMLCanvasElement,
  buffers: ColoringBuffers,
  animation?: ColoringFillAnimation,
) => {
  const context = canvas.getContext('2d');
  if (!context) return;

  const output = context.createImageData(buffers.width, buffers.height);
  output.data.set(buffers.base);
  const pixelCount = buffers.width * buffers.height;

  for (let index = 0; index < pixelCount; index += 1) {
    const label = buffers.labels[index];
    const offset = index * 4;
    const baseRed = buffers.base[offset];
    const baseGreen = buffers.base[offset + 1];
    const baseBlue = buffers.base[offset + 2];
    const light = (baseRed + baseGreen + baseBlue) / (255 * 3);
    const alpha = 0.72 * Math.pow(light, 0.72);
    const stored = buffers.colors.get(label);

    if (animation && label === animation.label) {
      const x = index % buffers.width;
      const y = Math.floor(index / buffers.width);
      const distance = Math.hypot(x - animation.originX, y - animation.originY);
      const reveal = Math.max(
        0,
        Math.min(1, (animation.radius - distance) / animation.feather),
      );
      const oldRed = animation.previous
        ? baseRed * (1 - alpha) + animation.previous.red * alpha
        : baseRed;
      const oldGreen = animation.previous
        ? baseGreen * (1 - alpha) + animation.previous.green * alpha
        : baseGreen;
      const oldBlue = animation.previous
        ? baseBlue * (1 - alpha) + animation.previous.blue * alpha
        : baseBlue;
      const newRed = baseRed * (1 - alpha) + animation.next.red * alpha;
      const newGreen = baseGreen * (1 - alpha) + animation.next.green * alpha;
      const newBlue = baseBlue * (1 - alpha) + animation.next.blue * alpha;
      output.data[offset] = oldRed * (1 - reveal) + newRed * reveal;
      output.data[offset + 1] = oldGreen * (1 - reveal) + newGreen * reveal;
      output.data[offset + 2] = oldBlue * (1 - reveal) + newBlue * reveal;
      continue;
    }

    if (!stored) continue;
    output.data[offset] = baseRed * (1 - alpha) + stored.red * alpha;
    output.data[offset + 1] = baseGreen * (1 - alpha) + stored.green * alpha;
    output.data[offset + 2] = baseBlue * (1 - alpha) + stored.blue * alpha;
  }

  context.putImageData(output, 0, 0);
};

const resolveColoringLabel = (
  buffers: ColoringBuffers,
  x: number,
  y: number,
) => {
  const pointX = Math.max(0, Math.min(buffers.width - 1, Math.round(x)));
  const pointY = Math.max(0, Math.min(buffers.height - 1, Math.round(y)));
  const direct = buffers.labels[pointY * buffers.width + pointX];
  if (direct) return direct;

  for (let radius = 1; radius <= 8; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) continue;
        const nextX = pointX + offsetX;
        const nextY = pointY + offsetY;
        if (
          nextX < 0 ||
          nextX >= buffers.width ||
          nextY < 0 ||
          nextY >= buffers.height
        ) {
          continue;
        }
        const label = buffers.labels[nextY * buffers.width + nextX];
        if (label) return label;
      }
    }
  }
  return 0;
};

const measureColoringRadius = (
  buffers: ColoringBuffers,
  label: number,
  originX: number,
  originY: number,
) => {
  let radius = 1;
  for (let index = 0; index < buffers.labels.length; index += 1) {
    if (buffers.labels[index] !== label) continue;
    const x = index % buffers.width;
    const y = Math.floor(index / buffers.width);
    radius = Math.max(radius, Math.hypot(x - originX, y - originY));
  }
  return radius;
};

export function TrailGame() {
  const [scene, setScene] = useState<GameScene>(initialScene);
  const [phase, setPhase] = useState<Phase>('choose');
  const [arrived, setArrived] = useState(false);
  const [selectedColor, setSelectedColor] = useState(scenePalette[0]);
  const [feedback, setFeedback] = useState('');
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [hasPainted, setHasPainted] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  const sceneRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const finishTimer = useRef<number | null>(null);
  const coloringRef = useRef<ColoringBuffers | null>(null);
  const weatherLayerRef = useRef<HTMLCanvasElement | null>(null);
  const skyMaskRef = useRef<HTMLCanvasElement | null>(null);
  const weatherSimulationRef = useRef<WatercolorSimulation | null>(null);
  const heldWeatherStrokeRef = useRef<HeldWeatherStroke | null>(null);
  const weatherAnimationFrameRef = useRef<number | null>(null);
  const weatherAnimationRef = useRef<(timestamp: number) => void>(
    () => undefined,
  );
  const setupToken = useRef(0);
  const paintingStatsRef = useRef<PaintingStats>(emptyPaintingStats());
  const activityStartedAtRef = useRef(0);
  const completedSceneIdsRef = useRef(new Set<string>());
  const coloringAnimationFrameRef = useRef<number | null>(null);
  const pendingColoringFillRef = useRef<PendingColoringFill | null>(null);

  const activePalette =
    scene.task.mode === 'weather' ? weatherPalette : scenePalette;
  const travelerSize = scene.location.path.size * 0.82;
  const isSculptureTask = scene.task.mode === 'sculpt';
  const isMusicTask = scene.task.mode === 'music';
  const isCandleTask = scene.task.mode === 'candle';
  const isPaintingTask =
    scene.task.mode === 'color-scene' || scene.task.mode === 'weather';
  const sculpture = useSculpture(scene.id, isSculptureTask);
  const music = useMusicWorkshop(
    scene.id,
    isMusicTask,
    scene.character.id === 'violinist' ? 'violin' : 'saxophone',
  );
  const journal = usePsychologyJournal();
  const completeActivity = useCallback(() => {
    setPhase('complete');
  }, []);

  const clearCanvas = useCallback(() => {
    if (coloringAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(coloringAnimationFrameRef.current);
      coloringAnimationFrameRef.current = null;
    }
    pendingColoringFillRef.current = null;
    if (weatherAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(weatherAnimationFrameRef.current);
      weatherAnimationFrameRef.current = null;
    }
    heldWeatherStrokeRef.current = null;
    weatherSimulationRef.current = null;
    coloringRef.current = null;
    weatherLayerRef.current = null;
    skyMaskRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startNewStory = useCallback(() => {
    setScene((current) => createRandomScene(current.location.id));
    setPhase('choose');
    setArrived(false);
    setFeedback('');
    setHasPainted(false);
    setIsFinishing(false);
    activityStartedAtRef.current = Date.now();
    paintingStatsRef.current = emptyPaintingStats();
    if (finishTimer.current) window.clearTimeout(finishTimer.current);
    dragRef.current = null;
    setDragging(null);
    setupToken.current += 1;
    clearCanvas();
  }, [clearCanvas, music.stop]);

  useEffect(() => {
    setScene(createRandomScene());
  }, []);

  useEffect(() => {
    setSelectedColor(
      scene.task.mode === 'weather' ? weatherPalette[0] : scenePalette[0],
    );
    setHasPainted(false);
    setIsFinishing(false);
    activityStartedAtRef.current = Date.now();
    paintingStatsRef.current = emptyPaintingStats();
  }, [scene.id, scene.task.mode]);

  useEffect(() => {
    setArrived(false);
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reduceMotion) {
      setArrived(true);
      return;
    }
    const arrivalTimer = window.setTimeout(
      () => setArrived(true),
      scene.location.path.duration * 1000,
    );
    return () => window.clearTimeout(arrivalTimer);
  }, [scene.id, scene.location.path.duration]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
      if (coloringAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(coloringAnimationFrameRef.current);
      }
      if (weatherAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(weatherAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    clearCanvas();
  }, [clearCanvas, scene.id]);

  const prepareColoringScene = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = setupToken.current + 1;
    setupToken.current = token;

    try {
      const lineArt = await loadImage(
        '/game/black-white/' + scene.location.id + '.png',
      );
      if (setupToken.current !== token) return;

      const width = canvas.width;
      const height = canvas.height;
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = width;
      baseCanvas.height = height;
      const baseContext = baseCanvas.getContext('2d', {
        willReadFrequently: true,
      });
      if (!baseContext) return;
      drawImageCover(baseContext, lineArt, width, height);

      const baseImage = baseContext.getImageData(0, 0, width, height);
      const buffers: ColoringBuffers = {
        width,
        height,
        base: new Uint8ClampedArray(baseImage.data),
        labels: buildContourLabels(baseImage.data, width, height),
        colors: new Map(),
      };
      coloringRef.current = buffers;
      weatherLayerRef.current = null;
      skyMaskRef.current = null;
      renderColoringScene(canvas, buffers);
    } catch {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      coloringRef.current = null;
    }
  }, [scene.location.id]);

  const finishColoringFill = useCallback(() => {
    if (coloringAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(coloringAnimationFrameRef.current);
      coloringAnimationFrameRef.current = null;
    }
    const pending = pendingColoringFillRef.current;
    pendingColoringFillRef.current = null;
    if (!pending) return;
    pending.buffers.colors.set(pending.label, pending.color);
    const canvas = canvasRef.current;
    if (canvas && coloringRef.current === pending.buffers) {
      renderColoringScene(canvas, pending.buffers);
    }
  }, []);

  const animateColoringFill = useCallback(
    (
      canvas: HTMLCanvasElement,
      buffers: ColoringBuffers,
      x: number,
      y: number,
      color: string,
    ) => {
      finishColoringFill();
      const label = resolveColoringLabel(buffers, x, y);
      if (!label) return null;

      const originX = Math.max(0, Math.min(buffers.width - 1, Math.round(x)));
      const originY = Math.max(0, Math.min(buffers.height - 1, Math.round(y)));
      const previous = buffers.colors.get(label);
      const result = previous ? 'recolor' : 'fill';
      const next = hexToRgb(color);
      const maxRadius = measureColoringRadius(
        buffers,
        label,
        originX,
        originY,
      );
      const feather = Math.max(14, Math.min(30, buffers.width * 0.032));
      const duration = Math.max(420, Math.min(760, maxRadius * 1.35));
      const startedAt = performance.now();
      pendingColoringFillRef.current = { buffers, label, color: next };

      const drawFrame = (timestamp: number) => {
        if (coloringRef.current !== buffers) return;
        const progress = Math.max(
          0,
          Math.min(1, (timestamp - startedAt) / duration),
        );
        const eased = 1 - Math.pow(1 - progress, 3);
        renderColoringScene(canvas, buffers, {
          label,
          originX,
          originY,
          radius: eased * (maxRadius + feather),
          feather,
          previous,
          next,
        });

        if (progress < 1) {
          coloringAnimationFrameRef.current = window.requestAnimationFrame(drawFrame);
          return;
        }
        buffers.colors.set(label, next);
        pendingColoringFillRef.current = null;
        coloringAnimationFrameRef.current = null;
        renderColoringScene(canvas, buffers);
      };

      coloringAnimationFrameRef.current = window.requestAnimationFrame(drawFrame);
      return result;
    },
    [finishColoringFill],
  );
  const renderWeatherScene = useCallback(() => {
    const canvas = canvasRef.current;
    const weatherLayer = weatherLayerRef.current;
    const skyMask = skyMaskRef.current;
    if (!canvas || !weatherLayer || !skyMask) return;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(weatherLayer, 0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(skyMask, 0, 0);
    context.globalCompositeOperation = 'source-over';
  }, []);

  const ensureWeatherAnimation = useCallback(() => {
    if (weatherAnimationFrameRef.current !== null) return;
    weatherAnimationFrameRef.current = window.requestAnimationFrame(
      (timestamp) => weatherAnimationRef.current(timestamp),
    );
  }, []);

  weatherAnimationRef.current = (timestamp: number) => {
    const simulation = weatherSimulationRef.current;
    const layer = weatherLayerRef.current;
    if (!simulation || !layer) {
      weatherAnimationFrameRef.current = null;
      return;
    }

    const heldStroke = heldWeatherStrokeRef.current;
    if (heldStroke && timestamp - heldStroke.lastStampAt >= 85) {
      addWatercolorPuddle(
        simulation,
        { x: heldStroke.x, y: heldStroke.y },
        heldStroke.pigment,
        timestamp,
      );
      heldStroke.lastStampAt = timestamp;
    }

    if (simulation.lastTimestamp && timestamp - simulation.lastTimestamp < 28) {
      weatherAnimationFrameRef.current = window.requestAnimationFrame(
        weatherAnimationRef.current,
      );
      return;
    }

    const active = stepWatercolorSimulation(simulation, timestamp);
    const layerContext = layer.getContext('2d');
    if (layerContext) renderWatercolorLayer(simulation, layerContext);
    renderWeatherScene();

    if (active || heldWeatherStrokeRef.current) {
      weatherAnimationFrameRef.current = window.requestAnimationFrame(
        weatherAnimationRef.current,
      );
    } else {
      weatherAnimationFrameRef.current = null;
    }
  };

  const prepareWeatherMask = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = setupToken.current + 1;
    setupToken.current = token;

    try {
      const maskAsset = skyMaskAssets[scene.location.id];
      if (!maskAsset) throw new Error('Для этой локации нет маски неба');
      const mask = await loadImage(maskAsset);
      if (setupToken.current !== token) return;

      const width = canvas.width;
      const height = canvas.height;
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskContext = maskCanvas.getContext('2d', {
        willReadFrequently: true,
      });
      if (!maskContext) return;
      maskContext.imageSmoothingEnabled = false;
      maskContext.drawImage(mask, 0, 0, width, height);
      const pixels = maskContext.getImageData(0, 0, width, height);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const luminance =
          pixels.data[offset] * 0.2126 +
          pixels.data[offset + 1] * 0.7152 +
          pixels.data[offset + 2] * 0.0722;
        pixels.data[offset] = 255;
        pixels.data[offset + 1] = 255;
        pixels.data[offset + 2] = 255;
        pixels.data[offset + 3] = luminance >= 160 ? 255 : 0;
      }
      maskContext.clearRect(0, 0, width, height);
      maskContext.putImageData(pixels, 0, 0);

      const simulationWidth = Math.min(240, width);
      const simulationHeight = Math.max(
        1,
        Math.round((height / width) * simulationWidth),
      );
      const weatherLayer = document.createElement('canvas');
      weatherLayer.width = simulationWidth;
      weatherLayer.height = simulationHeight;
      const layerContext = weatherLayer.getContext('2d');
      if (!layerContext) return;
      const simulation = createWatercolorSimulation(
        simulationWidth,
        simulationHeight,
        layerContext,
      );
      renderWatercolorLayer(simulation, layerContext);

      coloringRef.current = null;
      heldWeatherStrokeRef.current = null;
      weatherSimulationRef.current = simulation;
      skyMaskRef.current = maskCanvas;
      weatherLayerRef.current = weatherLayer;
      renderWeatherScene();
    } catch {
      heldWeatherStrokeRef.current = null;
      weatherSimulationRef.current = null;
      weatherLayerRef.current = null;
      skyMaskRef.current = null;
    }
  }, [renderWeatherScene, scene.id, scene.location.id]);

  useEffect(() => {
    if (phase !== 'paint') return;

    if (scene.task.mode === 'color-scene') {
      void prepareColoringScene();
    } else {
      void prepareWeatherMask();
    }

    return () => {
      setupToken.current += 1;
    };
  }, [phase, prepareColoringScene, prepareWeatherMask, scene.task.mode]);
  const showFeedback = useCallback((message: string) => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = window.setTimeout(() => setFeedback(''), 2300);
  }, []);

  const chooseTool = useCallback(
    (tool: ToolId, droppedOnScene: boolean) => {
      if (!arrived || !droppedOnScene || phase !== 'choose') return;
      const requiredTool: ToolId = isSculptureTask
        ? 'modeling'
        : isMusicTask
          ? 'music'
          : isCandleTask
            ? 'hand'
            : 'brush';
      if (tool === requiredTool) {
        setFeedback('');
        activityStartedAtRef.current = Date.now();
        paintingStatsRef.current = emptyPaintingStats();
        setPhase(
          isSculptureTask
            ? 'sculpt'
            : isMusicTask
              ? 'music'
              : isCandleTask
                ? 'candle'
                : 'paint',
        );
        return;
      }
      showFeedback(
        isSculptureTask
          ? 'Мне поможет клякса. В ней прячется новая форма.'
          : isMusicTask
            ? 'Здесь нужна нота — инструмент ждёт новую мелодию.'
            : isCandleTask
              ? 'Здесь нужна свеча — она откроет театр теней.'
              : 'Для этой просьбы нужна именно кисть. Попробуй другую карту.',
      );
    },
    [
      arrived,
      isCandleTask,
      isMusicTask,
      isSculptureTask,
      phase,
      showFeedback,
    ],
  );

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: ToolId,
  ) => {
    if (!arrived || phase !== 'choose') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next: DragState = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
    };
    dragRef.current = next;
    setDragging(next);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = {
      ...current,
      dx: event.clientX - current.startX,
      dy: event.clientY - current.startY,
    };
    dragRef.current = next;
    setDragging(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const rect = sceneRef.current?.getBoundingClientRect();
    const droppedOnScene = Boolean(
      rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom,
    );

    chooseTool(current.id, droppedOnScene);
    dragRef.current = null;
    setDragging(null);
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDragging(null);
  };

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * event.currentTarget.width) / rect.width,
      y:
        ((event.clientY - rect.top) * event.currentTarget.height) / rect.height,
    };
  };

  const beginPaint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'paint' || isFinishing) return;
    event.preventDefault();
    const point = pointFromEvent(event);

    if (scene.task.mode === 'color-scene') {
      const buffers = coloringRef.current;
      if (!buffers) return;
      const fillResult = animateColoringFill(
        event.currentTarget,
        buffers,
        point.x,
        point.y,
        selectedColor,
      );
      if (!fillResult) return;
      const stats = paintingStatsRef.current;
      stats.actions += 1;
      stats.colorUses.set(
        selectedColor,
        (stats.colorUses.get(selectedColor) ?? 0) + 1,
      );
      if (fillResult === 'fill') stats.filledRegions += 1;
      else stats.recoloredRegions += 1;
      setHasPainted(true);
      return;
    }

    const simulation = weatherSimulationRef.current;
    const layer = weatherLayerRef.current;
    if (!simulation || !layer) return;
    const pigment =
      weatherPigments.find((item) => item.color === selectedColor) ??
      weatherPigments[0];
    const timestamp = performance.now();
    const simulationPoint = {
      x: (point.x / event.currentTarget.width) * simulation.width,
      y: (point.y / event.currentTarget.height) * simulation.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    paintWatercolorStroke(
      simulation,
      simulationPoint,
      simulationPoint,
      pigment,
      0,
      timestamp,
    );
    heldWeatherStrokeRef.current = {
      ...simulationPoint,
      displayX: point.x,
      displayY: point.y,
      lastMoveAt: timestamp,
      lastStampAt: timestamp,
      pigment,
    };
    const stats = paintingStatsRef.current;
    stats.actions += 1;
    stats.strokes += 1;
    stats.colorUses.set(
      selectedColor,
      (stats.colorUses.get(selectedColor) ?? 0) + 1,
    );
    const layerContext = layer.getContext('2d');
    if (layerContext) renderWatercolorLayer(simulation, layerContext);
    renderWeatherScene();
    ensureWeatherAnimation();
    setHasPainted(true);
  };

  const movePaint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const heldStroke = heldWeatherStrokeRef.current;
    const simulation = weatherSimulationRef.current;
    const layer = weatherLayerRef.current;
    if (
      phase !== 'paint' ||
      isFinishing ||
      scene.task.mode !== 'weather' ||
      !heldStroke ||
      !simulation ||
      !layer
    ) {
      return;
    }

    event.preventDefault();
    const point = pointFromEvent(event);
    const timestamp = performance.now();
    const elapsed = Math.max(8, timestamp - heldStroke.lastMoveAt);
    const speed =
      Math.hypot(point.x - heldStroke.displayX, point.y - heldStroke.displayY) /
      elapsed;
    paintingStatsRef.current.speedTotal += speed;
    paintingStatsRef.current.speedSamples += 1;
    const simulationPoint = {
      x: (point.x / event.currentTarget.width) * simulation.width,
      y: (point.y / event.currentTarget.height) * simulation.height,
    };
    paintWatercolorStroke(
      simulation,
      { x: heldStroke.x, y: heldStroke.y },
      simulationPoint,
      heldStroke.pigment,
      speed,
      timestamp,
    );
    heldWeatherStrokeRef.current = {
      ...heldStroke,
      ...simulationPoint,
      displayX: point.x,
      displayY: point.y,
      lastMoveAt: timestamp,
      lastStampAt: timestamp,
    };
    const layerContext = layer.getContext('2d');
    if (layerContext) renderWatercolorLayer(simulation, layerContext);
    renderWeatherScene();
    ensureWeatherAnimation();
  };

  const endPaint = () => {
    heldWeatherStrokeRef.current = null;
    if (scene.task.mode === 'weather') ensureWeatherAnimation();
  };

  const finishPainting = () => {
    if (!hasPainted || isFinishing) return;
    heldWeatherStrokeRef.current = null;
    if (scene.task.mode === 'color-scene') {
      finishColoringFill();
      completeActivity();
      return;
    }

    setIsFinishing(true);
    ensureWeatherAnimation();
    if (finishTimer.current) window.clearTimeout(finishTimer.current);
    finishTimer.current = window.setTimeout(() => {
      setIsFinishing(false);
      completeActivity();
    }, 1600);
  };

  useEffect(() => {
    if (
      phase !== 'complete' ||
      isCandleTask ||
      completedSceneIdsRef.current.has(scene.id)
    ) {
      return;
    }
    completedSceneIdsRef.current.add(scene.id);

    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - activityStartedAtRef.current) / 1000),
    );
    let signals: JourneyActivity['signals'];

    if (isSculptureTask) {
      signals = {
        kind: 'sculpture',
        parts: sculpture.parts.map((part) => ({
          id: part.id,
          label: part.label,
          category: part.category,
          x: Math.round(part.x),
          y: Math.round(part.y),
          size: Math.round(part.size),
          rotation: Math.round(part.rotation),
          flipped: part.flipped,
          source: part.instanceId.endsWith('-start')
            ? 'starter'
            : 'player-added',
        })),
        ...sculpture.metrics,
      };
    } else if (isMusicTask) {
      signals = {
        kind: 'music',
        tempo: music.tempo,
        weight: music.weight,
        layers: music.layers.map((layer, layerIndex) => ({
          layer: layerIndex + 1,
          notes: layer.map((eventCode) => ({
            step: Math.floor(eventCode / 5),
            pitch: eventCode % 5,
          })),
        })),
        clearCount: music.clearCount,
      };
    } else {
      const stats = paintingStatsRef.current;
      const paintingSignals: PaintingActivitySignals = {
        kind: 'painting',
        mode: scene.task.mode === 'weather' ? 'weather' : 'color-scene',
        colors: [...stats.colorUses.entries()].map(([color, uses]) => ({
          color,
          uses,
        })),
        actions: stats.actions,
      };
      if (scene.task.mode === 'weather') {
        paintingSignals.strokes = stats.strokes;
        paintingSignals.averageStrokeSpeed = stats.speedSamples
          ? Number((stats.speedTotal / stats.speedSamples).toFixed(3))
          : 0;
      } else {
        paintingSignals.filledRegions = stats.filledRegions;
        paintingSignals.recoloredRegions = stats.recoloredRegions;
      }
      signals = paintingSignals;
    }

    const activity: JourneyActivity = {
      id: scene.id,
      completedAt: new Date().toISOString(),
      taskMode: scene.task.mode,
      taskTitle: scene.task.title,
      location: scene.location.name,
      character: scene.character.name,
      durationSeconds,
      signals,
    };
    journal.recordActivity(activity);
  }, [
    isCandleTask,
    isMusicTask,
    isSculptureTask,
    journal,
    music.clearCount,
    music.layers,
    music.tempo,
    music.weight,
    phase,
    scene,
    sculpture.metrics,
    sculpture.parts,
  ]);
  const bubbleX = Math.max(
    18,
    Math.min(
      82,
      scene.location.path.encounterX - scene.location.path.size * 0.18,
    ),
  );
  const bubbleY = Math.max(
    28,
    Math.min(
      82,
      scene.location.path.encounterY - scene.location.path.size * 0.68,
    ),
  );

  const characterStyle: SceneCharacterStyle = {
    '--start-x': String(scene.location.path.startX) + '%',
    '--start-y': String(scene.location.path.startY) + '%',
    '--end-x': String(Math.max(18, scene.location.path.endX - 7)) + '%',
    '--end-y': String(scene.location.path.endY) + '%',
    '--encounter-x': String(scene.location.path.encounterX) + '%',
    '--encounter-y': String(scene.location.path.encounterY) + '%',
    '--traveler-size': String(travelerSize) + '%',
    '--encounter-size': String(scene.location.path.size) + '%',
    '--bubble-x': String(bubbleX) + '%',
    '--bubble-y': String(bubbleY) + '%',
    '--travel-duration': String(scene.location.path.duration) + 's',
  };

  if (phase === 'candle') {
    return (
      <CandleTheater
        prompt={
          scene.candle?.prompt ?? 'Покажи, что произошло после их встречи.'
        }

        onExit={() => setPhase('choose')}
        onFinish={() => setPhase('complete')}
      />
    );
  }

  return (
    <main className="game-page">
      <div className="game-shell">
        {journal.isUnlocked && (
          <div className="journal-perch">
            <PsychologyJournal
              open={journalOpen}
              activities={journal.activities}
              analysis={journal.analysis}
              status={journal.status}
              error={journal.error}
              onOpen={() => setJournalOpen(true)}
              onClose={() => setJournalOpen(false)}
              onRetry={journal.retryAnalysis}
              onClear={journal.clearJournal}
            />
          </div>
        )}
        <section
          ref={sceneRef}
          className={[
            'game-scene',
            scene.task.mode === 'color-scene' ? 'is-color-task' : '',
            dragging ? 'is-awaiting-card' : '',
            phase === 'paint' ? 'is-painting' : '',
            phase === 'sculpt' ? 'is-sculpting' : '',
            phase === 'music' ? 'is-music-making' : '',
            music.isPlaying ? 'is-music-playing' : '',
            phase === 'paint' && scene.task.mode === 'color-scene'
              ? 'is-coloring'
              : '',
            phase === 'paint' && scene.task.mode === 'weather'
              ? 'is-weather-painting'
              : '',
            arrived ? 'has-arrived' : 'is-travelling',
          ]
            .filter(Boolean)
            .join(' ')}
          style={characterStyle}
          aria-label={scene.location.alt}
        >
          <img
            className="location-background"
            src={
              scene.task.mode === 'color-scene'
                ? '/game/black-white/' + scene.location.id + '.png'
                : scene.location.asset
            }
            alt={scene.location.alt}
            draggable={false}
          />

          {arrived && isCandleTask && (
            <img
              key={scene.id + '-candle-wagon'}
              className="candle-wagon"
              src="/game/candle/wagon.png"
              alt="Вагончик театра теней"
              draggable={false}
            />
          )}

          <div
            key={scene.id + '-traveler'}
            className={[
              'traveler',
              arrived ? 'has-arrived' : 'is-walking',
            ].join(' ')}
          >
            <img
              src={
                arrived
                  ? '/game/characters/standing/traveler.png'
                  : '/game/characters/traveler-walk-fixed.gif'
              }
              alt="Путешественник"
              draggable={false}
            />
          </div>

          {arrived && isSculptureTask ? (
            <SculptureFigure
              controller={sculpture}
              phase={
                phase === 'sculpt' || phase === 'complete' ? phase : 'choose'
              }
            />
          ) : arrived && isMusicTask && music.isPlaying ? (
            <MusicStage controller={music} />
          ) : arrived ? (
            <div key={scene.id + '-encounter'} className="encounter-character">
              <img
                src={scene.character.asset}
                alt={scene.character.name}
                draggable={false}
              />
            </div>
          ) : null}

          {arrived && (phase === 'choose' || phase === 'complete') && (
            <output className="dialogue-bubble" aria-live="polite">
              <img
                className="dialogue-bubble-art"
                src="/game/dialogue-bubble.png"
                alt=""
                aria-hidden="true"
                draggable={false}
              />
              <span className="dialogue-bubble-copy">
                <strong>{scene.character.name}</strong>
                <span>
                  {phase === 'complete'
                    ? scene.task.completion
                    : feedback || scene.dialogue}
                </span>
              </span>
            </output>
          )}

          <canvas
            ref={canvasRef}
            className={[
              'drawing-layer',
              phase === 'paint' || (phase === 'complete' && isPaintingTask)
                ? 'is-visible'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={
              scene.task.mode === 'color-scene'
                ? 'Контурная сцена: выбери краску и коснись области, чтобы залить её цветом'
                : scene.task.mode === 'weather'
                  ? 'Небо сцены: проведи широкой мягкой кистью, чтобы изменить погоду'
                  : 'Поле сцены'
            }
            onPointerDown={beginPaint}
            onPointerMove={movePaint}
            onPointerUp={endPaint}
            onPointerCancel={endPaint}
            onPointerLeave={endPaint}
          >
            Интерактивное поле для рисования
          </canvas>

          {phase === 'complete' && (
            <button
              type="button"
              className="next-level-arrow"
              aria-label="Перейти в следующую зону"
              onClick={startNewStory}
            >
              <span aria-hidden="true">→</span>
            </button>
          )}
        </section>

        {phase === 'paint' ? (
          <section className="paint-deck" aria-label="Инструменты рисования">
            <div
              className={[
                'paint-toolbar',
                scene.task.mode === 'weather' ? 'is-weather-palette' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={
                scene.task.mode === 'weather'
                  ? 'Палитра погоды'
                  : 'Палитра для сцены'
              }
            >
              <div className="palette">
                {activePalette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={selectedColor === color ? 'is-selected' : ''}
                    style={{ backgroundColor: color }}
                    aria-label={'Выбрать цвет ' + color}
                    onClick={() => setSelectedColor(color)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="finish-button"
                disabled={!hasPainted || isFinishing}
                onClick={finishPainting}
              >
                {isFinishing ? 'Небо сохнет…' : 'Готово'}
              </button>
            </div>
          </section>
        ) : phase === 'sculpt' ? (
          <SculptureDeck controller={sculpture} onFinish={completeActivity} />
        ) : phase === 'music' ? (
          <MusicDeck
            controller={music}
            onFinish={() => {
              music.stop();
              completeActivity();
            }}
          />
        ) : (
          <section className="tool-deck" aria-label="Карты действий">
            {tools.map((tool) => {
              const activeDrag = dragging?.id === tool.id;
              const style = activeDrag
                ? ({
                    '--drag-x': String(dragging.dx) + 'px',
                    '--drag-y': String(dragging.dy) + 'px',
                  } as CSSProperties)
                : undefined;

              return (
                <button
                  key={tool.id}
                  type="button"
                  className={[
                    'tool-card',
                    'tool-' + tool.id,
                    activeDrag ? 'is-dragging' : '',
                    phase !== 'choose' || !arrived ? 'is-resting' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={style}
                  disabled={!arrived || phase !== 'choose'}
                  aria-label={tool.label + ': перетащить на сцену'}
                  onPointerDown={(event) => beginDrag(event, tool.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      chooseTool(tool.id, true);
                    }
                  }}
                >
                  <span className="tool-image-wrap">
                    <img src={tool.asset} alt="" draggable={false} />
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}




