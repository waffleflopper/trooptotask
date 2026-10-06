import { describe, expect, it, vi } from 'vitest';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { createReadyAppShellRouteData } from '../appShell.test-support';
import { _createTrainingLayoutLoad } from './+layout.server';

type TrainingLoadEvent = Parameters<ReturnType<typeof _createTrainingLayoutLoad>>[0];

function eventFor(pathname: string, ready = true) {
	const parentData = createReadyAppShellRouteData({ orgId: 'org-1', role: 'member' });
	if (parentData.shell.kind !== 'ready') throw new Error('Expected ready shell fixture');
	parentData.shell.member.capabilityMap = { ...createCapabilityMap('none'), training: 'view' };
	const depends = vi.fn();
	const event = {
		locals: {} as App.Locals,
		cookies: {} as import('@sveltejs/kit').Cookies,
		url: new URL(`https://example.test${pathname}`),
		depends,
		parent: vi.fn(async () => (ready ? parentData : { ...parentData, shell: { kind: 'suspended' } }))
	} as unknown as TrainingLoadEvent;
	return { event, depends };
}

const workspace = { training: { data: Promise.resolve(null as never) } };

describe('Training layout workspace delivery', () => {
	it.each(['/org/org-1/training/reports', '/org/org-1/training/reports/'])(
		'skips the matrix workspace on %s while keeping the ready-shell dependencies',
		async (pathname) => {
			const stream = vi.fn(async () => workspace);
			const { event, depends } = eventFor(pathname);

			expect(await _createTrainingLayoutLoad({ streamTrainingWorkspace: stream })(event)).toEqual({
				training: undefined
			});
			expect(stream).not.toHaveBeenCalled();
			expect(depends).toHaveBeenCalledWith('app:org-core', 'app:training-data');
		}
	);

	it.each(['/org/org-1/training', '/org/org-1/training/types', '/org/org-1/training/views'])(
		'streams the matrix workspace on %s',
		async (pathname) => {
			const stream = vi.fn(async () => workspace);

			expect(await _createTrainingLayoutLoad({ streamTrainingWorkspace: stream })(eventFor(pathname).event)).toBe(
				workspace
			);
		}
	);

	it('keeps Reports behind ready-shell admission for a suspended Organization', async () => {
		const load = _createTrainingLayoutLoad({ streamTrainingWorkspace: vi.fn() });

		await expect(load(eventFor('/org/org-1/training/reports', false).event)).rejects.toMatchObject({ status: 403 });
	});
});
