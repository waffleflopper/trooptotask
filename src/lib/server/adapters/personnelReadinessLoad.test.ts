import { error } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { loadRequestPersonnelReadiness, loadRequestPersonnelReadinessBadge } from './personnelReadinessLoad';
import type { loadWithContext } from './httpAdapter';

const person = { id: 'person-1' } as Personnel;
const streams = {
	attention: Promise.resolve({ readinessBadge: { count: 3, complete: true } })
};

function request() {
	return { locals: {} as App.Locals, cookies: {} as never, params: { orgId: 'org-1' } };
}

function loader(result: () => Promise<unknown>) {
	return vi.fn(result) as unknown as typeof loadWithContext & ReturnType<typeof vi.fn>;
}

describe('loadRequestPersonnelReadiness', () => {
	it('reads each source once per request for the page and the layout badge', async () => {
		const load = loader(async () => streams);
		const shared = request();

		const page = loadRequestPersonnelReadiness(shared, person, '2026-10-06', load);
		const badge = loadRequestPersonnelReadinessBadge(shared, person, '2026-10-06', load);

		expect(await page).toBe(streams);
		expect(await badge).toEqual({ count: 3, complete: true });
		expect(load).toHaveBeenCalledTimes(1);

		await loadRequestPersonnelReadiness(request(), person, '2026-10-06', load);
		expect(load).toHaveBeenCalledTimes(2);
	});
});

describe('loadRequestPersonnelReadinessBadge', () => {
	it('hides the badge from a viewer denied sensitive records', async () => {
		const denied = loader(async () => error(403, 'Forbidden'));
		await expect(loadRequestPersonnelReadinessBadge(request(), person, '2026-10-06', denied)).resolves.toBeNull();
	});

	it('reports a failed read instead of an empty badge', async () => {
		const failed = loader(async () => {
			throw new Error('provider down');
		});
		await expect(loadRequestPersonnelReadinessBadge(request(), person, '2026-10-06', failed)).rejects.toThrow(
			'provider down'
		);
	});
});
