// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { speechLang, splitForSpeech } from './speech';

describe('read out loud helpers', () => {
  it('picks the language by script', () => {
    expect(speechLang('مرحبا بكم في الموقع')).toBe('ar-SA');
    expect(speechLang('Hello world')).toBe('en-US');
    expect(speechLang('12345')).toBe('en-US');
  });

  it('cuts at sentence ends, keeps pieces short and never mixes languages', () => {
    const parts = splitForSpeech('First sentence. Second one!\nمرحبا بكم. هذا اختبار.', 40);
    expect(parts.every((p) => p.length <= 40)).toBe(true);
    for (const p of parts) expect(new Set([speechLang(p)]).size).toBe(1);
    expect(parts.join(' ')).toContain('مرحبا بكم');
    const long = splitForSpeech(Array(80).fill('word').join(' '), 100);
    expect(long.length).toBeGreaterThan(2);
    expect(long.every((p) => p.length <= 100)).toBe(true);
  });
});
