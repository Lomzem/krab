const POINTS = [
  ['north', 'N'],
  ['north-north-east', 'NNE'],
  ['north-east', 'NE'],
  ['east-north-east', 'ENE'],
  ['east', 'E'],
  ['east-south-east', 'ESE'],
  ['south-east', 'SE'],
  ['south-south-east', 'SSE'],
  ['south', 'S'],
  ['south-south-west', 'SSW'],
  ['south-west', 'SW'],
  ['west-south-west', 'WSW'],
  ['west', 'W'],
  ['west-north-west', 'WNW'],
  ['north-west', 'NW'],
  ['north-north-west', 'NNW']
] as const;

export const compassPoint = (bearing: number) =>
  POINTS[Math.round(bearing / 22.5) % 16] ?? POINTS[0];

const FEET_PER_MILE = 5280;

const MOST_FEET_SHOWN = 990;

const roundedFeet = (feet: number) =>
  feet < 100
    ? Math.round(feet)
    : Math.min(MOST_FEET_SHOWN, Math.round(feet / 10) * 10);

export const distanceText = (feet: number) => {
  const shown = roundedFeet(feet);
  if (feet < 1000) {
    return { short: `${String(shown)} ft`, spoken: `${String(shown)} feet` };
  }
  const miles = (feet / FEET_PER_MILE).toFixed(1);
  return { short: `${miles} mi`, spoken: `${miles} miles` };
};

const count = (n: number, one: string, many: string) =>
  `${String(n)} ${n === 1 ? one : many}`;

export const durationText = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (hours < 1) {
    return {
      short: `${String(minutes)} min`,
      spoken: count(minutes, 'minute', 'minutes')
    };
  }
  if (days < 1) {
    return {
      short: `${String(hours)} h ${String(minutes % 60)} min`,
      spoken: `${count(hours, 'hour', 'hours')} ${count(minutes % 60, 'minute', 'minutes')}`
    };
  }
  return {
    short: `${String(days)} d ${String(hours % 24)} h`,
    spoken: `${count(days, 'day', 'days')} ${count(hours % 24, 'hour', 'hours')}`
  };
};

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

export const shortDateRange = (first: number, last: number) =>
  SHORT_DATE.formatRange(first, last);
