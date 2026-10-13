import { configure } from '@testing-library/react';

// CI machines are slower than a laptop: wait longer before an async expectation gives up
configure({ asyncUtilTimeout: 20_000 });

import { beforeEach } from 'vitest';
// keeping files needs an explicit first-use choice in the app; tests start from "chosen: keep" unless they clear it
beforeEach(() => {
  try {
    localStorage.setItem('shootcut:keep', '1');
  } catch {
    /* no storage in this environment */
  }
});
