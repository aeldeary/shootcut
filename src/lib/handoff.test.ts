// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { clearHeld, holdFile, takeFile } from './handoff';

const f = () => ({ name: 'a.pdf' }) as unknown as File;
afterEach(clearHeld);

describe('handoff', () => {
  it('gives the held file to the next tool, also on a second look', () => {
    const file = f();
    holdFile(file);
    expect(takeFile()).toBe(file);
    expect(takeFile()).toBe(file);
  });
  it('forgets it after a few seconds', () => {
    holdFile(f());
    expect(takeFile(Date.now() + 6000)).toBeNull();
    expect(takeFile()).toBeNull();
  });
  it('has nothing when nothing was handed over', () => expect(takeFile()).toBeNull());
});
