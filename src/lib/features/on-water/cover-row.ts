const PLACED = [
  'top',
  'left',
  'right',
  'bottom',
  'width',
  'height',
  'translate',
  'visibility'
] as const;

export const coverRow = (row: HTMLElement) => (region: HTMLElement) => {
  const place = () => {
    const { top, left, width, height } = row.getBoundingClientRect();
    const style = region.style;
    style.setProperty('top', `${String(top)}px`);
    style.setProperty('left', `${String(left)}px`);
    style.setProperty('right', 'auto');
    style.setProperty('bottom', 'auto');
    style.setProperty('width', `${String(width)}px`);
    style.setProperty('height', `${String(height)}px`);
    style.setProperty('translate', 'none');
    if (width > 0 && height > 0) style.removeProperty('visibility');
    else style.setProperty('visibility', 'hidden');
  };
  place();
  const resized = new ResizeObserver(place);
  resized.observe(row);
  const dock = row.closest('footer');
  if (dock) resized.observe(dock);
  resized.observe(document.documentElement);
  addEventListener('resize', place);
  visualViewport?.addEventListener('resize', place);
  return () => {
    resized.disconnect();
    removeEventListener('resize', place);
    visualViewport?.removeEventListener('resize', place);
    for (const property of PLACED) region.style.removeProperty(property);
  };
};
