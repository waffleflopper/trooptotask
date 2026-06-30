import { describe, expect, it } from 'vitest';
import { changelog } from './changelog';

describe('changelog', () => {
	it('announces Organization rank catalog support in the latest Whats New entry', () => {
		expect(changelog[0]).toMatchObject({
			id: '2026-06-29-organization-rank-catalogs',
			title: 'Organization Rank Catalogs'
		});
		expect(changelog[0].items.join(' ')).toContain('joint-service ranks');
		expect(changelog[0].items.join(' ')).toContain('Navy ranks');
		expect(changelog[0].items.join(' ')).toContain('pay-grade-aware ordering');
	});
});
