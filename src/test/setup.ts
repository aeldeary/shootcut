import { configure } from '@testing-library/react';

// CI machines are slower than a laptop: wait longer before an async expectation gives up
configure({ asyncUtilTimeout: 20_000 });
