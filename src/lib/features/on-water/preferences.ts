import {
  readSetting as read,
  writeSetting as write
} from '#lib/local-setting.js';
import type { Kind } from '#lib/features/trip/index.js';

const KIND_KEY = 'krab.drop-kind';
const EXPLAINED_KEY = 'krab.location-explained';

export const savedKind = (): Kind => (read(KIND_KEY) === 'net' ? 'net' : 'pot');

export const saveKind = (kind: Kind) => {
  write(KIND_KEY, kind);
};

export const locationExplained = () => read(EXPLAINED_KEY) === 'yes';

export const rememberLocationExplained = () => {
  write(EXPLAINED_KEY, 'yes');
};
