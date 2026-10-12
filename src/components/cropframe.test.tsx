import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CropFrame } from './CropFrame';

afterEach(cleanup);

function setup(resizable: boolean) {
  const onChange = vi.fn();
  const { getByTestId, container } = render(
    <div id="stage" style={{ position: 'relative' }}>
      <CropFrame box={{ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }} resizable={resizable} onChange={onChange} />
    </div>,
  );
  const stage = container.firstElementChild as HTMLElement;
  stage.getBoundingClientRect = () => ({ width: 1000, height: 500, left: 0, top: 0, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return { onChange, frame: getByTestId('crop-frame'), container };
}

describe('CropFrame', () => {
  it('moves when dragged and stays inside the picture', () => {
    const { onChange, frame } = setup(false);
    fireEvent.pointerDown(frame, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 300, clientY: 150, pointerId: 1 });
    const b = onChange.mock.calls.at(-1)![0];
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.2);
    expect(b.w).toBeCloseTo(0.4);
    fireEvent.pointerMove(frame, { clientX: 5000, clientY: 5000, pointerId: 1 });
    const far = onChange.mock.calls.at(-1)![0];
    expect(far.x + far.w).toBeCloseTo(1);
    expect(far.y + far.h).toBeCloseTo(1);
  });

  it('has no resize handles unless the shape is free, and resizes with them', () => {
    expect(setup(false).container.querySelectorAll('[data-grip]').length).toBe(0);
    cleanup();
    const { onChange, container } = setup(true);
    const se = container.querySelector('[data-grip="se"]') as HTMLElement;
    fireEvent.pointerDown(se, { clientX: 500, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(se, { clientX: 600, clientY: 300, pointerId: 1 });
    const b = onChange.mock.calls.at(-1)![0];
    expect(b.x).toBeCloseTo(0.1);
    expect(b.w).toBeCloseTo(0.5);
    expect(b.h).toBeCloseTo(0.5);
  });
});
