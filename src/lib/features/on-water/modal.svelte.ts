import { untrack } from 'svelte';

let open = $state(0);

export const modalOpen = () => open > 0;

export const openModal = () => {
  untrack(() => {
    open += 1;
  });
  return () => {
    open -= 1;
  };
};
