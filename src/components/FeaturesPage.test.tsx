import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { Header } from './Shell';
import { FeaturesPage } from './FeaturesPage';
import { TOOLS } from '../lib/tools';

describe('Features page', () => {
  it('lists every ready tool and the shortcut table', () => {
    render(
      <I18nProvider>
        <FeaturesPage />
      </I18nProvider>,
    );
    const ready = TOOLS.filter((t) => t.status === 'ready');
    expect(document.querySelectorAll('.feature-card').length).toBeGreaterThanOrEqual(ready.length);
    expect(document.getElementById('shortcuts')).toBeTruthy();
  });
  it('is linked from the header', () => {
    render(
      <I18nProvider>
        <Header showBack={false} activeId={null} />
      </I18nProvider>,
    );
    expect(document.querySelector('a[href="#/features"]')).toBeTruthy();
  });
});
