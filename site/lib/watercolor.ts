export interface PigmentProfile {
  color: string;
  name: string;
  spread: number;
  granulation: number;
  opacity: number;
  staining: number;
}

export interface WatercolorPoint {
  x: number;
  y: number;
}

export interface WatercolorSimulation {
  width: number;
  height: number;
  wetness: Float32Array;
  paper: Float32Array;
  red: Float32Array;
  green: Float32Array;
  blue: Float32Array;
  pigment: Float32Array;
  spread: Float32Array;
  granulation: Float32Array;
  staining: Float32Array;
  dryRed: Float32Array;
  dryGreen: Float32Array;
  dryBlue: Float32Array;
  dryAlpha: Float32Array;
  nextWetness: Float32Array;
  nextRed: Float32Array;
  nextGreen: Float32Array;
  nextBlue: Float32Array;
  nextPigment: Float32Array;
  nextSpread: Float32Array;
  nextGranulation: Float32Array;
  nextStaining: Float32Array;
  image: ImageData;
  lastTimestamp: number;
  lastInputAt: number;
  strokeSeed: number;
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const hashNoise = (x: number, y: number, seed: number) => {
  let value =
    Math.imul((x | 0) + Math.imul(seed | 0, 1013), 374761393) +
    Math.imul((y | 0) + Math.imul(seed | 0, 1999), 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};

const smoothNoise = (x: number, y: number, cell: number, seed: number) => {
  const gridX = Math.floor(x / cell);
  const gridY = Math.floor(y / cell);
  const localX = (x - gridX * cell) / cell;
  const localY = (y - gridY * cell) / cell;
  const easeX = localX * localX * (3 - 2 * localX);
  const easeY = localY * localY * (3 - 2 * localY);
  const top = mix(
    hashNoise(gridX, gridY, seed),
    hashNoise(gridX + 1, gridY, seed),
    easeX,
  );
  const bottom = mix(
    hashNoise(gridX, gridY + 1, seed),
    hashNoise(gridX + 1, gridY + 1, seed),
    easeX,
  );
  return mix(top, bottom, easeY);
};

const createPaperTexture = (width: number, height: number, seed: number) => {
  const paper = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const coarse = smoothNoise(x, y, 24, seed + 3);
      const fiber = smoothNoise(x, y, 7, seed + 17);
      const grain = hashNoise(x, y, seed + 41);
      paper[y * width + x] = coarse * 0.48 + fiber * 0.34 + grain * 0.18;
    }
  }
  return paper;
};

const colorFromHex = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
};

const stampWatercolor = (
  simulation: WatercolorSimulation,
  center: WatercolorPoint,
  radius: number,
  profile: PigmentProfile,
  waterAmount: number,
  pigmentAmount: number,
) => {
  const { width, height, paper } = simulation;
  const color = colorFromHex(profile.color);
  const seed = simulation.strokeSeed++;
  const minimumX = Math.max(0, Math.floor(center.x - radius * 1.12));
  const maximumX = Math.min(width - 1, Math.ceil(center.x + radius * 1.12));
  const minimumY = Math.max(0, Math.floor(center.y - radius * 1.12));
  const maximumY = Math.min(height - 1, Math.ceil(center.y + radius * 1.12));

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const index = y * width + x;
      const distance = Math.hypot(x - center.x, y - center.y) / radius;
      const raggedEdge =
        (paper[index] - 0.5) * 0.2 +
        (hashNoise(x * 3, y * 5, seed) - 0.5) * 0.17;
      const reach = 0.88 + raggedEdge;
      if (distance >= reach) continue;

      let coverage = clamp((reach - distance) / Math.max(0.18, reach * 0.76));
      coverage = Math.pow(coverage, 0.62);
      const holeChance = 0.018 + profile.granulation * 0.055;
      if (
        distance > 0.2 &&
        hashNoise(x * 7 + seed, y * 11 - seed, seed + 73) < holeChance
      ) {
        coverage *= 0.18;
      }

      const absorption = 0.8 + paper[index] * 0.4;
      const addedWater = waterAmount * coverage * absorption;
      simulation.wetness[index] = clamp(
        simulation.wetness[index] +
          addedWater * (1 - simulation.wetness[index] * 0.46),
      );

      const addedPigment =
        pigmentAmount * profile.opacity * coverage * (0.78 + paper[index] * 0.34);
      const oldPigment = simulation.pigment[index];
      const combinedPigment = Math.min(1.35, oldPigment + addedPigment);
      const contribution = addedPigment / Math.max(0.0001, oldPigment + addedPigment);

      simulation.red[index] = mix(simulation.red[index], color.red, contribution);
      simulation.green[index] = mix(
        simulation.green[index],
        color.green,
        contribution,
      );
      simulation.blue[index] = mix(
        simulation.blue[index],
        color.blue,
        contribution,
      );
      simulation.spread[index] = mix(
        simulation.spread[index],
        profile.spread,
        contribution,
      );
      simulation.granulation[index] = mix(
        simulation.granulation[index],
        profile.granulation,
        contribution,
      );
      simulation.staining[index] = mix(
        simulation.staining[index],
        profile.staining,
        contribution,
      );
      simulation.pigment[index] = combinedPigment;
    }
  }
};

export const createWatercolorSimulation = (
  width: number,
  height: number,
  context: CanvasRenderingContext2D,
  seed = Date.now(),
): WatercolorSimulation => {
  const pixelCount = width * height;
  const buffer = () => new Float32Array(pixelCount);
  return {
    width,
    height,
    wetness: buffer(),
    paper: createPaperTexture(width, height, seed),
    red: buffer(),
    green: buffer(),
    blue: buffer(),
    pigment: buffer(),
    spread: buffer(),
    granulation: buffer(),
    staining: buffer(),
    dryRed: buffer(),
    dryGreen: buffer(),
    dryBlue: buffer(),
    dryAlpha: buffer(),
    nextWetness: buffer(),
    nextRed: buffer(),
    nextGreen: buffer(),
    nextBlue: buffer(),
    nextPigment: buffer(),
    nextSpread: buffer(),
    nextGranulation: buffer(),
    nextStaining: buffer(),
    image: context.createImageData(width, height),
    lastTimestamp: 0,
    lastInputAt: performance.now(),
    strokeSeed: seed | 0,
  };
};

export const paintWatercolorStroke = (
  simulation: WatercolorSimulation,
  from: WatercolorPoint,
  to: WatercolorPoint,
  profile: PigmentProfile,
  speed: number,
  timestamp: number,
) => {
  const radius = simulation.width * 0.14;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.2)));
  const slow = 1 - clamp(speed / 1.45);
  const waterAmount = 0.16 + slow * 0.2;
  const pigmentAmount = 0.055 + slow * 0.06;

  for (let step = 0; step < steps; step += 1) {
    const progress = steps === 1 ? 1 : step / (steps - 1);
    stampWatercolor(
      simulation,
      {
        x: mix(from.x, to.x, progress),
        y: mix(from.y, to.y, progress),
      },
      radius,
      profile,
      waterAmount,
      pigmentAmount,
    );
  }
  simulation.lastInputAt = timestamp;
};

export const addWatercolorPuddle = (
  simulation: WatercolorSimulation,
  point: WatercolorPoint,
  profile: PigmentProfile,
  timestamp: number,
) => {
  stampWatercolor(
    simulation,
    point,
    simulation.width * 0.125,
    profile,
    0.11,
    0.026,
  );
  simulation.lastInputAt = timestamp;
};

const compositeDryPigment = (
  simulation: WatercolorSimulation,
  index: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
) => {
  const previousAlpha = simulation.dryAlpha[index];
  const outputAlpha = alpha + previousAlpha * (1 - alpha);
  if (outputAlpha <= 0.0001) return;
  simulation.dryRed[index] =
    (red * alpha + simulation.dryRed[index] * previousAlpha * (1 - alpha)) /
    outputAlpha;
  simulation.dryGreen[index] =
    (green * alpha +
      simulation.dryGreen[index] * previousAlpha * (1 - alpha)) /
    outputAlpha;
  simulation.dryBlue[index] =
    (blue * alpha + simulation.dryBlue[index] * previousAlpha * (1 - alpha)) /
    outputAlpha;
  simulation.dryAlpha[index] = outputAlpha;
};

const transportedValue = (
  values: Float32Array,
  pigment: Float32Array,
  top: number,
  bottom: number,
  left: number,
  right: number,
  current: number,
  neighborMass: number,
  retainedMass: number,
  incomingMass: number,
) => {
  if (retainedMass + incomingMass < 0.0001) return 0;
  const neighborValue =
    neighborMass < 0.0001
      ? current
      : (values[top] * pigment[top] +
          values[bottom] * pigment[bottom] +
          values[left] * pigment[left] +
          values[right] * pigment[right]) /
        neighborMass;
  return (
    (current * retainedMass + neighborValue * incomingMass) /
    (retainedMass + incomingMass)
  );
};

export const stepWatercolorSimulation = (
  simulation: WatercolorSimulation,
  timestamp: number,
) => {
  if (!simulation.lastTimestamp) simulation.lastTimestamp = timestamp - 16;
  const deltaSeconds = clamp(
    (timestamp - simulation.lastTimestamp) / 1000,
    0.001,
    0.05,
  );
  simulation.lastTimestamp = timestamp;
  const inputAge = timestamp - simulation.lastInputAt;
  const bloomPhase = 0.16 + 0.84 * (1 - clamp(inputAge / 1800));
  let active = false;

  const {
    width,
    height,
    wetness,
    paper,
    red,
    green,
    blue,
    pigment,
    spread,
    granulation,
    staining,
    nextWetness,
    nextRed,
    nextGreen,
    nextBlue,
    nextPigment,
    nextSpread,
    nextGranulation,
    nextStaining,
  } = simulation;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const top = y > 0 ? index - width : index;
      const bottom = y < height - 1 ? index + width : index;
      const left = x > 0 ? index - 1 : index;
      const right = x < width - 1 ? index + 1 : index;
      const water = wetness[index];
      const pigmentAmount = pigment[index];
      const nearbyWater =
        wetness[top] + wetness[bottom] + wetness[left] + wetness[right];
      const nearbyPigment =
        pigment[top] + pigment[bottom] + pigment[left] + pigment[right];

      if (
        water < 0.0005 &&
        pigmentAmount < 0.0005 &&
        nearbyWater < 0.0005 &&
        nearbyPigment < 0.0005
      ) {
        nextWetness[index] = 0;
        nextRed[index] = 0;
        nextGreen[index] = 0;
        nextBlue[index] = 0;
        nextPigment[index] = 0;
        nextSpread[index] = 0;
        nextGranulation[index] = 0;
        nextStaining[index] = 0;
        continue;
      }

      const averageWater = nearbyWater * 0.25;
      const waterSpread = clamp(
        deltaSeconds * (2.1 + paper[index] * 1.7) * bloomPhase,
        0,
        0.2,
      );
      const evaporation = Math.exp(
        -deltaSeconds * (0.43 + paper[index] * 0.17 + (inputAge > 2000 ? 0.2 : 0)),
      );
      const nextWater = Math.max(
        0,
        (water + (averageWater - water) * waterSpread) * evaporation,
      );

      const averagePigment = nearbyPigment * 0.25;
      const pigmentSpread = clamp(
        deltaSeconds *
          2.2 *
          (0.3 + spread[index] * 0.85) *
          (0.22 + water) *
          bloomPhase,
        0,
        0.14,
      );
      const retainedMass = pigmentAmount * (1 - pigmentSpread);
      const incomingMass = averagePigment * pigmentSpread;
      let nextAmount = retainedMass + incomingMass;
      const edge = Math.max(
        Math.abs(water - wetness[top]),
        Math.abs(water - wetness[bottom]),
        Math.abs(water - wetness[left]),
        Math.abs(water - wetness[right]),
      );
      nextAmount = Math.min(
        1.4,
        nextAmount *
          (1 + Math.min(0.024, edge * deltaSeconds * (1.2 + granulation[index]))),
      );

      const neighborMass =
        pigment[top] + pigment[bottom] + pigment[left] + pigment[right];
      nextRed[index] = transportedValue(
        red, pigment, top, bottom, left, right, red[index], neighborMass,
        retainedMass, incomingMass,
      );
      nextGreen[index] = transportedValue(
        green, pigment, top, bottom, left, right, green[index], neighborMass,
        retainedMass, incomingMass,
      );
      nextBlue[index] = transportedValue(
        blue, pigment, top, bottom, left, right, blue[index], neighborMass,
        retainedMass, incomingMass,
      );
      nextSpread[index] = transportedValue(
        spread, pigment, top, bottom, left, right, spread[index], neighborMass,
        retainedMass, incomingMass,
      );
      nextGranulation[index] = transportedValue(
        granulation, pigment, top, bottom, left, right,
        granulation[index], neighborMass, retainedMass, incomingMass,
      );
      nextStaining[index] = transportedValue(
        staining, pigment, top, bottom, left, right, staining[index],
        neighborMass, retainedMass, incomingMass,
      );
      nextWetness[index] = nextWater;
      nextPigment[index] = nextAmount;

      if (nextWater < 0.036 && inputAge > 650 && nextAmount > 0.001) {
        const rim = clamp(edge * 4.8) * (0.5 + nextGranulation[index] * 0.5);
        const darkening = 1 - rim * 0.2;
        const depositAlpha = clamp(
          nextAmount *
            (0.66 + rim * 0.55 + nextStaining[index] * 0.17) *
            (0.86 + paper[index] * 0.2),
          0,
          0.92,
        );
        compositeDryPigment(
          simulation,
          index,
          nextRed[index] * darkening,
          nextGreen[index] * darkening,
          nextBlue[index] * darkening,
          depositAlpha,
        );
        nextWetness[index] = 0;
        nextPigment[index] = 0;
        nextRed[index] = 0;
        nextGreen[index] = 0;
        nextBlue[index] = 0;
        nextSpread[index] = 0;
        nextGranulation[index] = 0;
        nextStaining[index] = 0;
      } else if (nextWater > 0.002 || nextAmount > 0.002) {
        active = true;
      }
    }
  }

  [simulation.wetness, simulation.nextWetness] = [
    simulation.nextWetness,
    simulation.wetness,
  ];
  [simulation.red, simulation.nextRed] = [simulation.nextRed, simulation.red];
  [simulation.green, simulation.nextGreen] = [
    simulation.nextGreen,
    simulation.green,
  ];
  [simulation.blue, simulation.nextBlue] = [
    simulation.nextBlue,
    simulation.blue,
  ];
  [simulation.pigment, simulation.nextPigment] = [
    simulation.nextPigment,
    simulation.pigment,
  ];
  [simulation.spread, simulation.nextSpread] = [
    simulation.nextSpread,
    simulation.spread,
  ];
  [simulation.granulation, simulation.nextGranulation] = [
    simulation.nextGranulation,
    simulation.granulation,
  ];
  [simulation.staining, simulation.nextStaining] = [
    simulation.nextStaining,
    simulation.staining,
  ];

  return active;
};

export const renderWatercolorLayer = (
  simulation: WatercolorSimulation,
  context: CanvasRenderingContext2D,
) => {
  const { width, height, image, paper } = simulation;
  const pixels = image.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const top = y > 0 ? index - width : index;
      const bottom = y < height - 1 ? index + width : index;
      const left = x > 0 ? index - 1 : index;
      const right = x < width - 1 ? index + 1 : index;
      const water = simulation.wetness[index];
      const pigment = simulation.pigment[index];
      const edge = Math.max(
        Math.abs(water - simulation.wetness[top]),
        Math.abs(water - simulation.wetness[bottom]),
        Math.abs(water - simulation.wetness[left]),
        Math.abs(water - simulation.wetness[right]),
      );
      const granulation = simulation.granulation[index];
      const grain =
        0.76 + paper[index] * (0.22 + granulation * 0.2);
      const hole =
        paper[index] < 0.11 * granulation ? 0.38 + paper[index] * 2.5 : 1;
      const wetAlpha = clamp(
        pigment *
          (0.48 + (1 - water) * 0.34 + edge * (0.7 + granulation * 0.45)) *
          grain *
          hole,
        0,
        0.84,
      );
      const rimDarkening = 1 - clamp(edge * 1.6) * 0.18;
      const dryAlpha = clamp(
        simulation.dryAlpha[index] * (0.88 + paper[index] * 0.15),
        0,
        0.94,
      );
      const outputAlpha = wetAlpha + dryAlpha * (1 - wetAlpha);

      if (outputAlpha <= 0.0001) {
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = 0;
        continue;
      }

      pixels[offset] =
        (simulation.red[index] * rimDarkening * wetAlpha +
          simulation.dryRed[index] * dryAlpha * (1 - wetAlpha)) /
        outputAlpha;
      pixels[offset + 1] =
        (simulation.green[index] * rimDarkening * wetAlpha +
          simulation.dryGreen[index] * dryAlpha * (1 - wetAlpha)) /
        outputAlpha;
      pixels[offset + 2] =
        (simulation.blue[index] * rimDarkening * wetAlpha +
          simulation.dryBlue[index] * dryAlpha * (1 - wetAlpha)) /
        outputAlpha;
      pixels[offset + 3] = outputAlpha * 255;
    }
  }

  context.putImageData(image, 0, 0);
};
