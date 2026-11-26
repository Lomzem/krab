const isVisible = () => document.visibilityState === 'visible';

export const watchVisibility = (changed: (visible: boolean) => void) => {
  const onChange = () => {
    changed(isVisible());
  };
  document.addEventListener('visibilitychange', onChange);
  onChange();
  return () => {
    document.removeEventListener('visibilitychange', onChange);
  };
};
