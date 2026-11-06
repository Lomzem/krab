import type { LatLon } from '#lib/features/trip/index.js';
import type { Box, MapPlace } from './types';

export type Spot = {
  key: string;
  at: LatLon;
  layer: MapPlace['layer'];
  lead: string;
  ids: string[];
  box: Box;
  apart: boolean;
};

export const MAX_ZOOM = 19;

const TILE_PX = 512;
const GAP_PX = 4;
const MAX_LAT = 85.051129;
const SEED_ORDER: Record<MapPlace['layer'], number> = {
  'in-water': 0,
  collected: 1,
  past: 2
};

const onScreen = (at: LatLon, zoom: number) => {
  const world = TILE_PX * 2 ** zoom;
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, at.lat)) * Math.PI) / 180;
  return {
    world,
    x: ((at.lon + 180) / 360) * world,
    y: ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * world
  };
};

const overlap = (
  a: { at: LatLon; box: Box },
  b: { at: LatLon; box: Box },
  zoom: number
) => {
  const from = onScreen(a.at, zoom);
  const to = onScreen(b.at, zoom);
  const across = to.x - from.x;
  const dx = across - from.world * Math.round(across / from.world);
  const dy = to.y - from.y;
  return (
    dx - b.box.left < a.box.right + GAP_PX &&
    -a.box.left < dx + b.box.right + GAP_PX &&
    dy - b.box.up < a.box.down + GAP_PX &&
    -a.box.up < dy + b.box.down + GAP_PX
  );
};

const alone = (place: MapPlace) => ({ at: place.at, box: place.alone });

const reachedFrom =
  (from: MapPlace, boxes: readonly Box[], zoom: number) => (place: MapPlace) =>
    boxes.some((box) => overlap({ at: from.at, box }, alone(place), zoom));

const greedy = (
  ordered: readonly MapPlace[],
  zoom: number,
  stackOf: (place: MapPlace) => readonly MapPlace[]
) => {
  const taken = new Set<string>();
  const stackIds = (place: MapPlace) => stackOf(place).map(({ id }) => id);
  return ordered.flatMap((seed) => {
    if (taken.has(seed.id)) return [];
    const others = ordered.filter(
      (place) => place.id !== seed.id && !taken.has(place.id)
    );
    const crowded =
      stackOf(seed).length > 1 ||
      others.some((place) => overlap(alone(seed), alone(place), zoom));
    const box = crowded ? seed.leading : seed.alone;
    const near = new Set(
      crowded
        ? [seed, ...others]
            .filter(reachedFrom(seed, [seed.alone, box], zoom))
            .flatMap(stackIds)
        : [seed.id]
    );
    const members = ordered.filter(
      (place) => !taken.has(place.id) && near.has(place.id)
    );
    for (const member of members) taken.add(member.id);
    return [{ seed, crowded, box, members }];
  });
};

export const spotsAt = (
  places: readonly MapPlace[],
  zoom: number,
  first: readonly string[] = []
): Spot[] => {
  const rank = (place: MapPlace) => {
    const featured = first.indexOf(place.id);
    return featured === -1 ? first.length + SEED_ORDER[place.layer] : featured;
  };
  const ordered = [...places].sort((a, b) => rank(a) - rank(b));
  const stacks = new Map<string, readonly MapPlace[]>();
  for (const { members } of greedy(ordered, MAX_ZOOM, (place) => [place])) {
    for (const member of members) stacks.set(member.id, members);
  }
  const stackOf = (place: MapPlace) => stacks.get(place.id) ?? [place];
  return greedy(ordered, zoom, stackOf).map(
    ({ seed, crowded, box, members }) => ({
      key: crowded ? `group:${seed.id}` : seed.id,
      at: seed.at,
      layer: seed.layer,
      lead: seed.id,
      ids: members.map(({ id }) => id),
      box,
      apart: members.some((member) => !stackOf(seed).includes(member))
    })
  );
};

export const zoomToSeparate = (
  places: readonly MapPlace[],
  id: string,
  from: number,
  max: number
) => {
  const target = places.find((place) => place.id === id);
  if (!target) return from;
  const separate = (zoom: number) =>
    places.every(
      (place) => place.id === id || !overlap(alone(target), alone(place), zoom)
    );
  const steps = [from];
  for (let zoom = Math.ceil(from); zoom <= max; zoom += 1) steps.push(zoom);
  return steps.find(separate) ?? from;
};
