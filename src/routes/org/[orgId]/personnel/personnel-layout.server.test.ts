import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { DeferredData, ReadyAppShell } from '$lib/server/core/orgShell';
import type { PersonnelWorkspaceResult } from '$features/personnel/server/personnelWorkspaceBootstrap';
import { _createPersonnelLayoutLoad } from './+layout.server';

describe('personnel layout server load', () => {
	it('registers personnel dependencies and streams Personnel with canonical shell organization identity', async () => {
		const depends = vi.fn();
		const personnel = { data: Promise.resolve({ laneKey: 'personnel' } as PersonnelWorkspaceResult) };
		const streamPersonnelWorkspace = vi.fn().mockResolvedValue({
			personnel
		} satisfies { personnel: DeferredData<PersonnelWorkspaceResult> });
		const load = _createPersonnelLayoutLoad({
			streamPersonnelWorkspace
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;
		const shell = {
			shell: {
				kind: 'ready',
				org: {
					id: 'canonical-org-id',
					urlSegment: 'alpha-company',
					name: 'Alpha Company'
				}
			} as ReadyAppShell
		};

		const result = await load({
			params: { orgId: 'stale-route-param' },
			locals,
			cookies,
			depends,
			url: new URL('https://example.test/org/stale-route-param/personnel'),
			parent: () => Promise.resolve(shell)
		} as unknown as Parameters<typeof load>[0]);

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:personnel-data');
		expect(streamPersonnelWorkspace).toHaveBeenCalledWith({
			locals,
			cookies,
			orgId: 'canonical-org-id'
		});
		expect(result).toEqual({ personnel });
	});
});
