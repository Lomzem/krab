import { Effect } from 'effect';

export const readSetting = (key: string) =>
  Effect.runSync(
    Effect.orElseSucceed(
      Effect.try(() => localStorage.getItem(key)),
      () => null
    )
  );

export const writeSetting = (key: string, value: string) => {
  Effect.runSync(
    Effect.ignore(
      Effect.try(() => {
        localStorage.setItem(key, value);
      })
    )
  );
};
