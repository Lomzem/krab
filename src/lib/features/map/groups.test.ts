import { expect, it } from 'vitest';
import { spotsAt, zoomToSeparate } from './groups';
import type { Box, MapPlace } from './types';

const SEA = { lat: -47.123456, lon: -128.654321 };
const CHIP: Box = { left: 30, right: 30, up: 15, down: 15 };
const LEADING: Box = { ...CHIP, right: CHIP.right + 30 };

const at = (
  id: string,
  where: MapPlace['at'],
  layer: MapPlace['layer'] = 'in-water',
  alone: Box = CHIP
): MapPlace => ({
  id,
  at: where,
  layer,
  alone,
  leading: () => ({ ...alone, right: alone.right + 30 })
});

const eightPots: MapPlace[] = Array.from({ length: 8 }, (_, index) =>
  at(`pot-${String(index + 1)}`, {
    lat: SEA.lat + index * 0.001,
    lon: SEA.lon
  })
);

it('keeps eight drops about 70 px apart as eight spots at zoom 15 and one spot of all eight when zoomed out', () => {
  expect(spotsAt(eightPots, 15).map(({ ids }) => ids)).toEqual(
    eightPots.map(({ id }) => [id])
  );
  const [group, ...rest] = spotsAt(eightPots, 10);
  expect(rest).toEqual([]);
  expect(group.ids).toEqual(eightPots.map(({ id }) => id));
  expect(group.lead).toBe('pot-1');
  expect(group.at).toEqual(eightPots[0]?.at);
  expect(group.box).toEqual(LEADING);
});

it('puts every drop in exactly one spot at any zoom', () => {
  const mixed: MapPlace[] = eightPots.map((place, index) => ({
    ...place,
    layer: (['past', 'collected', 'in-water'] as const)[index % 3] ?? 'past'
  }));
  for (const zoom of [0, 8, 12, 13, 14, 15, 19]) {
    const ids = spotsAt(mixed, zoom).flatMap((spot) => spot.ids);
    expect(ids.toSorted()).toEqual(mixed.map(({ id }) => id).toSorted());
  }
});

it('draws every drop in a line once, alone or in a group of several, even where a time label reaches the next drop but a group chip would not', () => {
  const labelled: Box = { left: 22, right: 22, up: 22, down: 31 };
  const chip: Box = { left: 22, right: 60, up: 25, down: 22 };
  const line = (ids: string[], layers: MapPlace['layer'][]): MapPlace[] =>
    ids.map((id, index) => ({
      id,
      at: { lat: SEA.lat + index * 0.0012, lon: SEA.lon + index * 0.0004 },
      layer: layers[index % layers.length] ?? 'in-water',
      alone: labelled,
      leading: () => chip
    }));
  const ids = ['pot-1', 'pot-2', 'pot-3', 'pot-4', 'pot-5', 'net-1'];
  const lines = [
    line(ids, ['in-water']),
    line(ids, ['in-water']).toReversed(),
    line(ids, ['in-water', 'collected', 'past'])
  ];
  for (const places of lines) {
    for (const first of [[], ['net-1'], ['pot-3'], ['pot-1', 'net-1']]) {
      for (let zoom = 12; zoom <= 17; zoom += 0.05) {
        const spots = spotsAt(places, zoom, first);
        expect(spots.flatMap((spot) => spot.ids).toSorted()).toEqual(
          ids.toSorted()
        );
        expect(spots.map(({ ids, key }) => ({ first: ids[0], key }))).toEqual(
          spots.map(({ ids, lead }) => ({
            first: lead,
            key: ids.length > 1 ? `group:${lead}` : lead
          }))
        );
      }
    }
  }
});

it('groups only drops whose drawn markers would touch', () => {
  const short: Box = { left: 34, right: 34, up: 12, down: 12 };
  const stacked = [0, 1, 2].map((index) =>
    at(`past-${String(index)}`, SEA, 'past', short)
  );
  const pxPerDegreeLat = 46_603 / Math.cos((SEA.lat * Math.PI) / 180);
  const apart = (px: number) =>
    stacked.map((place, index) => ({
      ...place,
      at: { ...SEA, lat: SEA.lat - (index * px) / pxPerDegreeLat }
    }));
  expect(spotsAt(apart(32), 15).map(({ ids }) => ids)).toEqual([
    ['past-0'],
    ['past-1'],
    ['past-2']
  ]);
  expect(spotsAt(apart(24), 15).map(({ ids }) => ids)).toEqual([
    ['past-0', 'past-1'],
    ['past-2']
  ]);

  const pxPerDegreeLon = 46_603;
  const across = [0, 40, 80, 150].map((px, index) =>
    at(`pot-${String(index + 1)}`, {
      ...SEA,
      lon: SEA.lon + px / pxPerDegreeLon
    })
  );
  expect(spotsAt(across, 15).map(({ ids }) => ids)).toEqual([
    ['pot-1', 'pot-2', 'pot-3'],
    ['pot-4']
  ]);
});

it('anchors a group at the stored position of its gear in the water, ahead of collected and past drops', () => {
  const places: MapPlace[] = [
    at('old', SEA, 'past'),
    at('done', { ...SEA, lat: SEA.lat + 0.0002 }, 'collected'),
    at('wet', { ...SEA, lat: SEA.lat + 0.0004 }, 'in-water')
  ];
  expect(spotsAt(places, 12)).toEqual([
    {
      key: 'group:wet',
      at: places[2]?.at,
      layer: 'in-water',
      lead: 'wet',
      ids: ['wet', 'done', 'old'],
      box: LEADING,
      apart: true
    }
  ]);
});

it('leads a group with the drop asked for, at its own stored position, even when it is a past drop sharing that position', () => {
  const places: MapPlace[] = [
    at('old', SEA, 'past'),
    at('wet', SEA, 'in-water'),
    at('done', SEA, 'collected')
  ];
  const [featured] = spotsAt(places, 15, ['old']);
  expect(featured).toMatchObject({
    key: 'group:old',
    at: SEA,
    layer: 'past',
    lead: 'old',
    ids: ['old', 'wet', 'done']
  });
  expect(spotsAt(places, 15, ['missing', 'done'])[0]?.lead).toBe('done');
});

it('keeps drops that share a spot together even when a nearby drop leads, and says the group spans more than one spot', () => {
  const pxPerDegreeLon = 46_603;
  const east = (id: string, px: number) =>
    at(id, { ...SEA, lon: SEA.lon + px / pxPerDegreeLon });
  const shared = [east('pot-1', 0), east('pot-2', 0), east('pot-3', 1)];
  const nearby = east('pot-4', 64.5);

  expect(
    spotsAt([...shared, nearby], 15, ['pot-4']).map(({ ids, apart }) => ({
      ids,
      apart
    }))
  ).toEqual([{ ids: ['pot-4', 'pot-1', 'pot-2', 'pot-3'], apart: true }]);
  expect(spotsAt(shared, 15).map(({ ids, apart }) => ({ ids, apart }))).toEqual(
    [{ ids: ['pot-1', 'pot-2', 'pot-3'], apart: false }]
  );
});

it('joins two groups whose markers would touch into one, from either side, with every drop once', () => {
  const alone: Box = { left: 22, right: 22, up: 22, down: 22 };
  const leading: Box = { ...alone, right: 63.035 };
  const pxPerDegreeLon = 46_603 * 2 ** 4;
  const pair = (side: string, px: number): MapPlace[] =>
    [1, 2].map((index) => ({
      id: `${side}-${String(index)}`,
      at: { ...SEA, lon: SEA.lon + px / pxPerDegreeLon },
      layer: 'collected',
      alone,
      leading: () => leading
    }));
  const east = pair('east', 49);
  const west = pair('west', 0);
  for (const places of [
    [...east, ...west],
    [...west, ...east]
  ]) {
    const spots = spotsAt(places, 19);
    expect(spots.map(({ ids, key, apart }) => ({ ids, key, apart }))).toEqual([
      {
        ids: places.map(({ id }) => id),
        key: `group:${places[0]?.id ?? ''}`,
        apart: false
      }
    ]);
  }
});

it('groups drops either side of the 180th meridian', () => {
  const places: MapPlace[] = [
    at('east', { lat: 0, lon: 179.9999 }, 'past'),
    at('west', { lat: 0, lon: -179.9999 }, 'past')
  ];
  expect(spotsAt(places, 10).map(({ ids }) => ids)).toEqual([['east', 'west']]);
});

it('finds the first zoom at or above the start that separates a drop, and keeps the start when drops share a position', () => {
  expect(zoomToSeparate(eightPots, 'pot-3', 15, 19)).toBe(15);
  expect(zoomToSeparate(eightPots, 'pot-3', 12.4, 19)).toBe(14);
  expect(zoomToSeparate(eightPots, 'pot-3', 13, 19)).toBe(14);
  const twins: MapPlace[] = [at('a', SEA), at('b', SEA)];
  expect(zoomToSeparate(twins, 'a', 15, 19)).toBe(15);
});

it('keeps a nearby drop clear of a group whose count gains a digit, by joining it into the group', () => {
  const alone: Box = { left: 22, right: 22, up: 22, down: 22 };
  const leading = (more: number): Box => ({
    ...alone,
    right: 40 + 8 * Math.max(2, String(more).length)
  });
  const pxPerDegreeLon = 46_603 * 2 ** 4;
  const stack = (count: number): MapPlace[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `pot-${String(index + 1)}`,
      at: SEA,
      layer: 'past',
      alone,
      leading
    }));
  const nearby: MapPlace = {
    id: 'net-1',
    at: { ...SEA, lon: SEA.lon + 86 / pxPerDegreeLon },
    layer: 'past',
    alone,
    leading
  };

  expect(
    spotsAt([...stack(100), nearby], 19).map(({ ids, box }) => ({
      size: ids.length,
      box
    }))
  ).toEqual([
    { size: 100, box: leading(99) },
    { size: 1, box: alone }
  ]);
  const [group, ...rest] = spotsAt([...stack(101), nearby], 19);
  expect(rest).toEqual([]);
  expect(group.ids).toEqual([...stack(101), nearby].map(({ id }) => id));
  expect(group.box).toEqual(leading(101));
});
