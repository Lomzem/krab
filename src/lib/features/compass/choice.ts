import { readSetting, writeSetting } from '#lib/local-setting.js';
import type { CompassChoice } from './types';

const COMPASS_KEY = 'krab.compass';

export const compassChoice: CompassChoice = {
  remembered: () => readSetting(COMPASS_KEY) === 'on',
  remember: (on) => {
    writeSetting(COMPASS_KEY, on ? 'on' : 'off');
  }
};
