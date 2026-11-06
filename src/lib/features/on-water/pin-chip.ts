import type { Box, MapPlace } from '#lib/features/map/index.js';
import type { Day, Kind } from '#lib/features/trip/index.js';

export type ChipFace = {
  kind: Kind;
  layer: MapPlace['layer'];
  number: number | null;
  day: Day | null;
  uncollected: boolean;
};

type Metrics = {
  pad: { left: number; right: number; y: number };
  icon: number;
  text: number;
  day: number;
};

export const CHIP_METRICS: Record<MapPlace['layer'], Metrics> = {
  'in-water': { pad: { left: 4, right: 4, y: 4 }, icon: 17, text: 14, day: 15 },
  collected: { pad: { left: 2, right: 4, y: 2 }, icon: 15, text: 13, day: 14 },
  past: { pad: { left: 2, right: 4, y: 2 }, icon: 15, text: 13, day: 14 }
};

export const MARK_SIZE = 14;
export const SELECTED_RING =
  'ring-3 ring-[#a3256f] ring-offset-2 ring-offset-white';
export const TIME_LABEL = { top: 15, size: 12, line: 15 };

const BORDER = 2;
const GAP = 2;
const DAY_GAP = 4;
const MARK_REACH = 8;
const DIGIT_EM = 0.63;
const DAY_EM = 2;
const PLUS_EM = 0.62;
const SEGMENT_PAD = 4;
const MIN_SEGMENT_DIGITS = 2;
const SLACK = 1;
const TAP_HALF = 22;

const digits = (value: number) => String(value).length;

const faceSize = (face: ChipFace) => {
  const metrics = CHIP_METRICS[face.layer];
  const pad = face.number === null ? metrics.pad.left : metrics.pad.right;
  const number =
    face.number === null
      ? 0
      : GAP + digits(face.number) * DIGIT_EM * metrics.text;
  const day = face.day
    ? GAP +
      DAY_GAP +
      metrics.day +
      GAP +
      (DAY_EM + digits(face.day.number) * DIGIT_EM) * metrics.text
    : 0;
  return {
    width: 2 * BORDER + metrics.pad.left + pad + metrics.icon + number + day,
    height:
      2 * BORDER +
      2 * metrics.pad.y +
      Math.max(metrics.icon, face.day ? metrics.day : 0, metrics.text)
  };
};

const segmentWidth = (layer: MapPlace['layer'], more: number) =>
  2 * BORDER +
  2 * SEGMENT_PAD +
  (PLUS_EM + Math.max(MIN_SEGMENT_DIGITS, digits(more)) * DIGIT_EM) *
    CHIP_METRICS[layer].text;

export const chipBoxes = (
  face: ChipFace,
  timeLabel: string | null
): Pick<MapPlace, 'alone' | 'leading'> => {
  const { width, height } = faceSize(face);
  const half = width / 2 + SLACK;
  const labelHalf = timeLabel
    ? (timeLabel.length * DIGIT_EM * TIME_LABEL.size + 8) / 2 + SLACK
    : 0;
  const up = height / 2 + SLACK + (face.uncollected ? MARK_REACH : 0);
  const down = timeLabel
    ? TIME_LABEL.top + TIME_LABEL.line + SLACK
    : height / 2 + SLACK;
  const alone: Box = {
    left: Math.max(half, labelHalf, TAP_HALF),
    right: Math.max(
      half + (face.uncollected ? MARK_REACH : 0),
      labelHalf,
      TAP_HALF
    ),
    up: Math.max(up, TAP_HALF),
    down: Math.max(down, TAP_HALF)
  };
  return {
    alone,
    leading: (more) => ({
      ...alone,
      right: Math.max(
        alone.right,
        half + segmentWidth(face.layer, more) + MARK_REACH
      ),
      up: Math.max(height / 2 + SLACK + MARK_REACH, TAP_HALF),
      down: Math.max(height / 2 + SLACK, TAP_HALF)
    })
  };
};
