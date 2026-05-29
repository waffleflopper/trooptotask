import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _createPersonnelImportPageLoad } from './+page.server';

describe('personnel import page server load', () => {
	it('guards import route access behind the Personnel import policy boundary', async () => {
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createPersonnelImportPageLoad({ loadWithContext });
		const depends = vi.fn();

		await load({
			params: { orgId: 'org-1' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:personnel-import');
		expect(loadWithContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
				policyResource: { kind: 'unscoped' }
			})
		);
		expect(loadWithContext.mock.calls[0]?.[3]).not.toHaveProperty('permission');
	});

	it('does not load the import route when the policy guard rejects access', async () => {
		const forbidden = Object.assign(new Error('Forbidden'), { status: 403 });
		const loadWithContext = vi.fn(async () => {
			throw forbidden;
		});
		const load = _createPersonnelImportPageLoad({ loadWithContext });

		await expect(
			load({
				params: { orgId: 'org-1' },
				locals: {} as App.Locals,
				cookies: {} as never,
				depends: vi.fn()
			} as never)
		).rejects.toMatchObject({ status: 403 });
		expect(loadWithContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.personnel.importRecords
			})
		);
	});
});
