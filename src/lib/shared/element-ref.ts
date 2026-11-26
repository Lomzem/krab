import type { Attachment } from 'svelte/attachments';

export const elementRef =
  <T extends Element>(set: (element: T | undefined) => void): Attachment<T> =>
  (element) => {
    set(element);
    return () => {
      set(undefined);
    };
  };
