import { describe, it, expect } from 'vitest';
import { validateSearchQuery } from '$lib/server/admin';

describe('validateSearchQuery', () => {
  it('returns null for queries shorter than 3 chars', () => {
    expect(validateSearchQuery('ab')).toBeNull();
    expect(validateSearchQuery('')).toBeNull();
  });

  it('returns sanitized string for valid queries', () => {
    expect(validateSearchQuery('test@email.com')).toBe('test@email.com');
  });

  it('trims whitespace', () => {
    expect(validateSearchQuery('  test  ')).toBe('test');
  });

  it('truncates to 100 characters', () => {
    const long = 'a'.repeat(150);
    const result = validateSearchQuery(long);
    expect(result?.length).toBe(100);
  });

  it('returns null for null/undefined input', () => {
    expect(validateSearchQuery(null as unknown as string)).toBeNull();
    expect(validateSearchQuery(undefined as unknown as string)).toBeNull();
  });
});
