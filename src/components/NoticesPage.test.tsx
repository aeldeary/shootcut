import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { NoticesPage } from './NoticesPage';
import { STUDIOS } from '../lib/studios';

describe('notices page', () => {
  it('lists every studio app with its licence files, and none of the old names', () => {
    const { container } = render(<I18nProvider><NoticesPage /></I18nProvider>);
    const apps = STUDIOS.flatMap((s) => s.apps);
    expect(container.querySelectorAll('li[data-app]').length).toBe(apps.length);
    expect(container.querySelectorAll('a[href$="LICENSE-MIT"]').length).toBe(apps.length);
    expect(container.textContent ?? '').not.toMatch(/storytold|artcraft|discord/i);
  });
});
