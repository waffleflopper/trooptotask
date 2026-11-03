import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { helpRouteKey, splitStepTarget } from './contracts';
import { HELP_GUIDES } from './guides';

const orgRoutes = fileURLToPath(new URL('../../routes/org/[orgId]', import.meta.url));
const pageKeys = new Set(
	readdirSync(orgRoutes, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name === '+page.svelte')
		.map((entry) => {
			const dir = entry.parentPath.slice(orgRoutes.length).split(/[\\/]/).filter(Boolean).join('/');
			return helpRouteKey(`/org/[orgId]/${dir}`);
		})
);

describe('the real page keys', () => {
	it('include the dashboard and a grouped page', () => {
		expect(pageKeys.has('')).toBe(true);
		expect(pageKeys.has('critical-tasks')).toBe(true);
	});
});

describe('HELP_GUIDES', () => {
	const ids = HELP_GUIDES.map((guide) => guide.id);

	it('have unique kebab-case ids', () => {
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
	});

	it('point next at a guide that exists', () => {
		const dangling = HELP_GUIDES.filter((guide) => guide.next && !ids.includes(guide.next)).map((g) => g.id);
		expect(dangling).toEqual([]);
	});

	it('name only pages that exist', () => {
		const unknown = HELP_GUIDES.flatMap((guide) => [
			...guide.routes.filter((route) => !pageKeys.has(route)).map((route) => `${guide.id} routes ${route}`),
			...guide.steps
				.filter((step) => step.to !== undefined && !pageKeys.has(splitStepTarget(step.to).key))
				.map((step) => `${guide.id} step ${step.to}`)
		]);
		expect(unknown).toEqual([]);
	});
});
