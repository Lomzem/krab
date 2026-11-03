import { Effect } from 'effect';
import type { Kind } from '#lib/features/trip/index.js';

const KIND_KEY = 'krab.drop-kind';
const EXPLAINED_KEY = 'krab.location-explained';

const read = (key: string) =>
  Effect.runSync(
    Effect.orElseSucceed(
      Effect.try(() => localStorage.getItem(key)),
      () => null
    )
  );

const write = (key: string, value: string) => {
  Effect.runSync(
    Effect.ignore(
      Effect.try(() => {
        localStorage.setItem(key, value);
      })
    )
  );
};

export const savedKind = (): Kind => (read(KIND_KEY) === 'net' ? 'net' : 'pot');

export const saveKind = (kind: Kind) => {
  write(KIND_KEY, kind);
};

export const locationExplained = () => read(EXPLAINED_KEY) === 'yes';

export const rememberLocationExplained = () => {
  write(EXPLAINED_KEY, 'yes');
};
