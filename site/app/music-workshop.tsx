'use client';

import './music-workshop.css';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const STEP_COUNT = 16;
const LAYER_COUNT = 4;
const LAYER_TIMBRES: OscillatorType[] = [
  'sine',
  'triangle',
  'square',
  'sawtooth',
];
const LAYER_PITCH = [1, 1.5, 0.5, 2];

export type MusicInstrument = 'saxophone' | 'violin';

interface MusicNote {
  name: string;
  frequency: number;
  color: string;
}

interface GlideVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  vibrato: OscillatorNode;
}

const MUSIC_SCALES: Record<MusicInstrument, readonly MusicNote[]> = {
  saxophone: [
    { name: 'До', frequency: 261.63, color: '#b85b48' },
    { name: 'Ре', frequency: 293.66, color: '#d38b43' },
    { name: 'Ми', frequency: 329.63, color: '#c4aa48' },
    { name: 'Соль', frequency: 392, color: '#5f8d78' },
    { name: 'Ля', frequency: 440, color: '#657da0' },
  ],
  violin: [
    { name: 'Ре', frequency: 293.66, color: '#9f554e' },
    { name: 'Фа', frequency: 349.23, color: '#c57a4a' },
    { name: 'Соль', frequency: 392, color: '#c5a848' },
    { name: 'Ля', frequency: 440, color: '#698267' },
    { name: 'До', frequency: 523.25, color: '#667c9e' },
  ],
};

const emptyLayers = () =>
  Array.from({ length: LAYER_COUNT }, () => [] as number[]);

export interface MusicController {
  instrument: MusicInstrument;
  notes: readonly MusicNote[];
  liveNote: number | null;
  layers: number[][];
  activeLayer: number;
  currentStep: number;
  tempo: number;
  weight: number;
  isPlaying: boolean;
  isRecording: boolean;
  hasNotes: boolean;
  clearCount: number;
  selectLayer: (index: number) => void;
  pressNote: (noteIndex: number) => void;
  beginGlide: (noteIndex: number) => void;
  moveGlide: (noteIndex: number) => void;
  endGlide: () => void;
  toggleRecording: () => void;
  togglePlayback: () => void;
  clearActiveLayer: () => void;
  setTempo: (value: number) => void;
  setWeight: (value: number) => void;
  stop: () => void;
}

export function useMusicWorkshop(
  sceneId: string,
  active: boolean,
  instrument: MusicInstrument,
): MusicController {
  const notes = MUSIC_SCALES[instrument];
  const isViolin = instrument === 'violin';
  const [layers, setLayers] = useState<number[][]>(emptyLayers);
  const [activeLayer, setActiveLayerState] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const [tempo, setTempoState] = useState(104);
  const [weight, setWeightState] = useState(38);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [clearCount, setClearCount] = useState(0);
  const [liveNote, setLiveNote] = useState<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const stepRef = useRef(-1);
  const layersRef = useRef(layers);
  const activeLayerRef = useRef(activeLayer);
  const weightRef = useRef(weight);
  const recordingRef = useRef(false);
  const recordStepsLeftRef = useRef(0);
  const glideVoiceRef = useRef<GlideVoice | null>(null);
  const lastGlideNoteRef = useRef<number | null>(null);

  layersRef.current = layers;
  activeLayerRef.current = activeLayer;
  weightRef.current = weight;

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const context = audioContextRef.current;
    if (context.state === 'suspended') void context.resume();
    return context;
  }, []);

  const synthNote = useCallback(
    (noteIndex: number, layerIndex: number, startAt?: number) => {
      const context = ensureAudioContext();
      const heaviness = weightRef.current / 100;
      const start = startAt ?? context.currentTime;
      const duration = isViolin
        ? 0.82 + heaviness * 0.72
        : 0.18 + heaviness * 0.28;
      const attack = isViolin ? 0.06 : 0.012;
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const frequency =
        notes[noteIndex].frequency *
        LAYER_PITCH[layerIndex] *
        Math.pow(2, -heaviness * (isViolin ? 0.18 : 0.82));

      oscillator.type = isViolin ? 'triangle' : LAYER_TIMBRES[layerIndex];
      oscillator.frequency.setValueAtTime(frequency, start);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        isViolin ? 2850 - heaviness * 1550 : 3300 - heaviness * 2650,
        start,
      );
      filter.Q.setValueAtTime(0.7 + heaviness * 2.2, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(isViolin ? 0.06 : 0.075, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.04);
    },
    [ensureAudioContext, isViolin, notes],
  );

  const recordNote = useCallback(
    (noteIndex: number) => {
      if (!recordingRef.current) return;
      const layerIndex = activeLayerRef.current;
      const quantizedStep = (Math.max(-1, stepRef.current) + 1) % STEP_COUNT;
      const eventCode = quantizedStep * notes.length + noteIndex;
      setLayers((current) => {
        const next = current.map((layer) => [...layer]);
        if (!next[layerIndex].includes(eventCode)) {
          next[layerIndex].push(eventCode);
          next[layerIndex].sort((left, right) => left - right);
        }
        return next;
      });
    },
    [notes.length],
  );

  const endGlide = useCallback(() => {
    const voice = glideVoiceRef.current;
    glideVoiceRef.current = null;
    lastGlideNoteRef.current = null;
    setLiveNote(null);
    if (!voice) return;
    const context = audioContextRef.current;
    const now = context?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.055);
    voice.oscillator.stop(now + 0.24);
    voice.vibrato.stop(now + 0.24);
  }, []);

  const beginGlide = useCallback(
    (noteIndex: number) => {
      endGlide();
      const context = ensureAudioContext();
      const heaviness = weightRef.current / 100;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const vibrato = context.createOscillator();
      const vibratoDepth = context.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(
        notes[noteIndex].frequency * Math.pow(2, -heaviness * 0.18),
        now,
      );
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800 - heaviness * 1450, now);
      filter.Q.setValueAtTime(1.2, now);
      vibrato.type = 'sine';
      vibrato.frequency.setValueAtTime(5.2, now);
      vibratoDepth.gain.setValueAtTime(3.2 + heaviness * 1.8, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.062, now + 0.075);

      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(oscillator.frequency);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      vibrato.start(now);
      glideVoiceRef.current = { oscillator, gain, vibrato };
      lastGlideNoteRef.current = noteIndex;
      setLiveNote(noteIndex);
      recordNote(noteIndex);
    },
    [endGlide, ensureAudioContext, notes, recordNote],
  );

  const moveGlide = useCallback(
    (noteIndex: number) => {
      if (lastGlideNoteRef.current === noteIndex) return;
      const voice = glideVoiceRef.current;
      const context = audioContextRef.current;
      if (!voice || !context) {
        beginGlide(noteIndex);
        return;
      }
      const heaviness = weightRef.current / 100;
      voice.oscillator.frequency.setTargetAtTime(
        notes[noteIndex].frequency * Math.pow(2, -heaviness * 0.18),
        context.currentTime,
        0.055,
      );
      lastGlideNoteRef.current = noteIndex;
      setLiveNote(noteIndex);
      recordNote(noteIndex);
    },
    [beginGlide, notes, recordNote],
  );

  const playStep = useCallback(
    (step: number) => {
      layersRef.current.forEach((layer, layerIndex) => {
        layer.forEach((eventCode) => {
          if (Math.floor(eventCode / notes.length) !== step) return;
          synthNote(eventCode % notes.length, layerIndex);
        });
      });
    },
    [notes.length, synthNote],
  );

  const stop = useCallback(() => {
    endGlide();
    recordingRef.current = false;
    recordStepsLeftRef.current = 0;
    setIsRecording(false);
    setIsPlaying(false);
    setCurrentStep(-1);
    stepRef.current = -1;
  }, [endGlide]);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    setLayers(emptyLayers());
    setActiveLayerState(0);
    activeLayerRef.current = 0;
    setClearCount(0);
    setTempoState(instrument === 'violin' ? 84 : 104);
    setWeightState(instrument === 'violin' ? 28 : 38);
    weightRef.current = instrument === 'violin' ? 28 : 38;
    stop();
  }, [active, instrument, sceneId, stop]);

  useEffect(() => {
    if (!isPlaying) return;
    const stepDuration = 60_000 / tempo / 2;

    const tick = () => {
      const nextStep = (stepRef.current + 1) % STEP_COUNT;
      stepRef.current = nextStep;
      setCurrentStep(nextStep);
      playStep(nextStep);

      if (!recordingRef.current) return;
      recordStepsLeftRef.current -= 1;
      if (recordStepsLeftRef.current > 0) return;

      recordingRef.current = false;
      setIsRecording(false);
      setActiveLayerState((current) => {
        const nextLayer = Math.min(LAYER_COUNT - 1, current + 1);
        activeLayerRef.current = nextLayer;
        return nextLayer;
      });
    };

    tick();
    const interval = window.setInterval(tick, stepDuration);
    return () => window.clearInterval(interval);
  }, [isPlaying, playStep, tempo]);

  useEffect(() => {
    return () => {
      endGlide();
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== 'closed') {
        void context.close();
      }
    };
  }, [endGlide]);

  const selectLayer = useCallback((index: number) => {
    if (recordingRef.current) return;
    activeLayerRef.current = index;
    setActiveLayerState(index);
  }, []);

  const pressNote = useCallback(
    (noteIndex: number) => {
      synthNote(noteIndex, activeLayerRef.current);
      recordNote(noteIndex);
    },
    [recordNote, synthNote],
  );

  const toggleRecording = useCallback(() => {
    ensureAudioContext();
    if (recordingRef.current) {
      recordingRef.current = false;
      recordStepsLeftRef.current = 0;
      setIsRecording(false);
      return;
    }

    recordingRef.current = true;
    recordStepsLeftRef.current = STEP_COUNT;
    setIsRecording(true);
    if (!isPlaying) {
      stepRef.current = -1;
      setCurrentStep(-1);
      setIsPlaying(true);
    }
  }, [ensureAudioContext, isPlaying]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stop();
      return;
    }
    ensureAudioContext();
    stepRef.current = -1;
    setCurrentStep(-1);
    setIsPlaying(true);
  }, [ensureAudioContext, isPlaying, stop]);

  const clearActiveLayer = useCallback(() => {
    const layerIndex = activeLayerRef.current;
    setLayers((current) =>
      current.map((layer, index) => (index === layerIndex ? [] : layer)),
    );
    setClearCount((current) => current + 1);
  }, []);

  const setTempo = useCallback((value: number) => {
    setTempoState(value);
  }, []);

  const setWeight = useCallback((value: number) => {
    weightRef.current = value;
    setWeightState(value);
  }, []);

  return {
    instrument,
    notes,
    liveNote,
    layers,
    activeLayer,
    currentStep,
    tempo,
    weight,
    isPlaying,
    isRecording,
    hasNotes: layers.some((layer) => layer.length > 0),
    clearCount,
    selectLayer,
    pressNote,
    beginGlide,
    moveGlide,
    endGlide,
    toggleRecording,
    togglePlayback,
    clearActiveLayer,
    setTempo,
    setWeight,
    stop,
  };
}

export function MusicStage({ controller }: { controller: MusicController }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const flightIdRef = useRef(0);
  const [flyingNotes, setFlyingNotes] = useState<
    Array<{ id: number; noteIndex: number; layerIndex: number }>
  >([]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (controller.isPlaying) {
      video.currentTime = 0;
      void video.play();
    } else {
      video.pause();
      video.currentTime = 0;
      setFlyingNotes([]);
    }
  }, [controller.isPlaying, controller.instrument]);

  useEffect(() => {
    if (!controller.isPlaying || controller.currentStep < 0) return;
    const nextFlights: Array<{
      id: number;
      noteIndex: number;
      layerIndex: number;
    }> = [];

    controller.layers.forEach((layer, layerIndex) => {
      layer.forEach((eventCode) => {
        if (
          Math.floor(eventCode / controller.notes.length) !==
          controller.currentStep
        ) {
          return;
        }
        flightIdRef.current += 1;
        nextFlights.push({
          id: flightIdRef.current,
          noteIndex: eventCode % controller.notes.length,
          layerIndex,
        });
      });
    });

    if (nextFlights.length) {
      setFlyingNotes((current) => [...current.slice(-18), ...nextFlights]);
    }
  }, [
    controller.currentStep,
    controller.isPlaying,
    controller.layers,
    controller.notes.length,
  ]);

  return (
    <div
      className={[
        'music-performance',
        'is-' + controller.instrument,
        controller.isPlaying ? 'is-playing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden={!controller.isPlaying}
    >
      <video
        // Remount on instrument change so the browser re-picks the matching source.
        key={controller.instrument}
        ref={videoRef}
        muted
        loop
        playsInline
        preload="auto"
      >
        {/*
          Safari/iOS only decode transparent video via HEVC-with-alpha (hvc1);
          they cannot play the VP9-alpha WebM and render its transparency as a
          black box. List the HEVC .mov first for them, WebM for everyone else.
        */}
        <source
          src={
            controller.instrument === 'violin'
              ? '/game/music/violin-performance.mov'
              : '/game/music/performance.mov'
          }
          type='video/quicktime; codecs="hvc1"'
        />
        <source
          src={
            controller.instrument === 'violin'
              ? '/game/music/violin-performance.webm'
              : '/game/music/performance.webm'
          }
          type="video/webm"
        />
      </video>
      <span className="music-note-stream" aria-hidden="true">
        {flyingNotes.map((flight) => {
          const lane = flight.id % 5;
          const symbols = ['♩', '♪', '♫', '♬', '♪'];
          return (
            <i
              key={flight.id}
              className="music-flight-note"
              style={
                {
                  color: controller.notes[flight.noteIndex].color,
                  '--flight-x': String(-38 - lane * 12) + 'px',
                  '--flight-y':
                    String(
                      -112 - flight.noteIndex * 9 - flight.layerIndex * 5,
                    ) + 'px',
                  '--flight-spin': String(-18 + lane * 11) + 'deg',
                } as CSSProperties
              }
              onAnimationEnd={() =>
                setFlyingNotes((current) =>
                  current.filter((item) => item.id !== flight.id),
                )
              }
            >
              {symbols[flight.noteIndex]}
            </i>
          );
        })}
      </span>
    </div>
  );
}

interface MusicDeckProps {
  controller: MusicController;
  onFinish: () => void;
}

export function MusicDeck({ controller, onFinish }: MusicDeckProps) {
  const glidePointerRef = useRef<number | null>(null);
  const notes = controller.notes;
  const soundingNotes = new Set<number>();
  if (controller.liveNote !== null) soundingNotes.add(controller.liveNote);
  if (controller.currentStep >= 0) {
    controller.layers.forEach((layer) => {
      layer.forEach((eventCode) => {
        if (
          Math.floor(eventCode / notes.length) === controller.currentStep
        ) {
          soundingNotes.add(eventCode % notes.length);
        }
      });
    });
  }

  const noteIndexFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = Math.max(
      0,
      Math.min(0.9999, (event.clientX - rect.left) / rect.width),
    );
    return Math.floor(progress * notes.length);
  };

  const beginViolinGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (controller.instrument !== 'violin') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    glidePointerRef.current = event.pointerId;
    controller.beginGlide(noteIndexFromPointer(event));
  };

  const moveViolinGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      controller.instrument !== 'violin' ||
      glidePointerRef.current !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    controller.moveGlide(noteIndexFromPointer(event));
  };

  const endViolinGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (glidePointerRef.current !== event.pointerId) return;
    glidePointerRef.current = null;
    controller.endGlide();
  };

  return (
    <section className="music-deck" aria-label="Починка музыкального инструмента">
      <div
        className={[
          'music-console',
          controller.instrument === 'violin' ? 'is-violin' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="music-layers" aria-label="Четыре слоя мелодии">
          {controller.layers.map((layer, layerIndex) => (
            <button
              key={layerIndex}
              type="button"
              className={[
                'music-layer',
                controller.activeLayer === layerIndex ? 'is-active' : '',
                layer.length ? 'has-notes' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={'Выбрать музыкальный слой ' + (layerIndex + 1)}
              aria-pressed={controller.activeLayer === layerIndex}
              disabled={controller.isRecording}
              onClick={() => controller.selectLayer(layerIndex)}
            >
              <span className="music-layer-number">{layerIndex + 1}</span>
              <span className="music-step-strip" aria-hidden="true">
                {Array.from({ length: STEP_COUNT }, (_, step) => (
                  <i
                    key={step}
                    className={[
                      layer.some(
                        (eventCode) =>
                          Math.floor(eventCode / notes.length) === step,
                      )
                        ? 'has-note'
                        : '',
                      controller.currentStep === step ? 'is-current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>

        <div
          className={[
            'music-note-grid',
            controller.instrument === 'violin' ? 'is-violin' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={
            controller.instrument === 'violin'
              ? 'Ре-минорная пентатоника: веди пальцем по пяти нотам'
              : 'До-мажорная пентатоника: пять нот'
          }
          onPointerDown={beginViolinGesture}
          onPointerMove={moveViolinGesture}
          onPointerUp={endViolinGesture}
          onPointerCancel={endViolinGesture}
          onLostPointerCapture={(event) => {
            if (glidePointerRef.current !== event.pointerId) return;
            glidePointerRef.current = null;
            controller.endGlide();
          }}
        >
          {notes.map((note, noteIndex) => (
            <button
              key={note.name}
              type="button"
              data-note-index={noteIndex}
              className={
                soundingNotes.has(noteIndex)
                  ? 'music-note is-sounding'
                  : 'music-note'
              }
              style={{ '--note-color': note.color } as CSSProperties}
              aria-label={'Сыграть ноту ' + note.name}
              onPointerDown={(event) => {
                if (controller.instrument === 'violin') return;
                event.preventDefault();
                controller.pressNote(noteIndex);
              }}
            >
              <span aria-hidden="true">♪</span>
              <strong>{note.name}</strong>
            </button>
          ))}
        </div>

        <div className="music-shaping">
          <label>
            <span>
              Темп <output>{controller.tempo}</output>
            </span>
            <input
              type="range"
              min="68"
              max="160"
              step="1"
              value={controller.tempo}
              onChange={(event) =>
                controller.setTempo(Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>
              Тяжесть <output>{controller.weight}</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={controller.weight}
              onChange={(event) =>
                controller.setWeight(Number(event.target.value))
              }
            />
          </label>
        </div>

        <div className="music-transport">
          <button
            type="button"
            className={
              controller.isRecording ? 'music-record is-active' : 'music-record'
            }
            aria-pressed={controller.isRecording}
            onClick={controller.toggleRecording}
          >
            <span aria-hidden="true">●</span>
            {controller.isRecording
              ? 'Запись…'
              : 'Слой ' + (controller.activeLayer + 1)}
          </button>
          <button type="button" onClick={controller.togglePlayback}>
            <span aria-hidden="true">{controller.isPlaying ? '■' : '▶'}</span>
            {controller.isPlaying ? 'Стоп' : 'Играть'}
          </button>
          <button
            type="button"
            disabled={!controller.layers[controller.activeLayer].length}
            onClick={controller.clearActiveLayer}
          >
            <span aria-hidden="true">↺</span>
            Очистить
          </button>
          <button
            type="button"
            className="music-finish"
            disabled={!controller.hasNotes}
            onClick={onFinish}
          >
            Готово
          </button>
        </div>
      </div>
    </section>
  );
}

