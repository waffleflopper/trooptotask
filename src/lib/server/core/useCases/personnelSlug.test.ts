import { describe, expect, it } from 'vitest';
import {
	buildAvailablePersonnelSlug,
	buildPersonnelSlugBase,
	isPersonnelSlugUniqueConstraintError
} from './personnelSlug';

describe('personnel slug helpers', () => {
	it('normalizes accents and punctuation into lowercase ASCII slug parts', () => {
		expect(buildPersonnelSlugBase({ lastName: "O'Connor-Sánchez", firstName: 'Zoë' })).toBe('o-connor-sanchez-zoe');
	});

	it('falls back when names do not contain ASCII slug characters', () => {
		expect(buildPersonnelSlugBase({ lastName: '李', firstName: '山田' })).toBe('personnel');
		expect(buildPersonnelSlugBase({ lastName: '!!!', firstName: '   ' })).toBe('personnel');
	});

	it('keeps long common names stable and appends the first free collision suffix', () => {
		const base = buildPersonnelSlugBase({
			lastName: 'Van Der Long Common Compound Name',
			firstName: 'Alexandria Catherine'
		});

		expect(base).toBe('van-der-long-common-compound-name-alexandria-catherine');
		expect(buildAvailablePersonnelSlug(base, new Set([base, `${base}-2`, `${base}-3`]))).toBe(`${base}-4`);
	});

	it('recognizes Personnel slug unique-constraint errors narrowly', () => {
		expect(
			isPersonnelSlugUniqueConstraintError({
				code: '23505',
				message: 'duplicate key value violates unique constraint "personnel_org_slug_key"'
			})
		).toBe(true);
		expect(isPersonnelSlugUniqueConstraintError(new Error('unrelated failure'))).toBe(false);
	});
});
