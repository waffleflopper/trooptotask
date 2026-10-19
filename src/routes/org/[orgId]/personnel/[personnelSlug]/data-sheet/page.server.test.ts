import { createTestContext } from '$lib/server/adapters/inMemory';
import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelDataSheetPageLoad } from './+page.server';

const seedPerson = {
	id: 'person-1',
	organization_id: 'org-1',
	slug: 'rivera-monica',
	group_id: null,
	archived_at: null
};

function loadFor(ctx: ReturnType<typeof createTestContext>) {
	const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
	return _createPersonnelDataSheetPageLoad({ loadWithContext });
}

function event() {
	return {
		params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
		locals: {} as App.Locals,
		cookies: {} as never,
		depends: vi.fn()
	} as never;
}

describe('personnel data sheet page server load', () => {
	it('streams the data sheet for the slug-resolved Soldier', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.store.seed('personnel', [seedPerson]);
		ctx.store.seed('personnel_extended_info', [
			{
				personnel_id: 'person-1',
				organization_id: 'org-1',
				blood_type: 'O+',
				personal_phone: '555-0100',
				marital_status: 'Married',
				marital_status_date: '2020-06-01',
				updated_at: '2026-10-01T12:00:00Z',
				updated_by: null
			}
		]);

		const result = await loadFor(ctx)(event());

		await expect(result.dataSheet).resolves.toMatchObject({
			bloodType: 'O+',
			personalPhone: '555-0100',
			maritalStatus: 'Married',
			maritalStatusDate: '2020-06-01',
			updatedAt: '2026-10-01T12:00:00Z',
			updatedBy: null
		});
	});
});
