import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _createPersonnelFollowUpsPageLoad } from './follow-ups/+page.server';

function makeEvent() {
	return {
		params: { orgId: 'org-1' },
		locals: {},
		cookies: {},
		parent: vi.fn(async () => ({
			personnelDetailHeader: {
				person: { id: 'person-1' }
			}
		})),
		depends: vi.fn()
	};
}

describe('personnel detail subpage server loads', () => {
	it('loads follow-ups as an isolated personnel detail sub-page', async () => {
		const event = makeEvent();
		const records = [
			{
				id: 'follow-up-1',
				personnelId: 'person-1',
				title: 'Check packet',
				notes: '',
				dueDate: null,
				status: 'open',
				createdBy: 'user-1',
				createdAt: '2026-05-15T00:00:00Z',
				updatedAt: '2026-05-15T00:00:00Z',
				completedAt: null
			}
		];
		const loadWithContext = vi.fn(async () => records);
		const load = _createPersonnelFollowUpsPageLoad({ loadWithContext: loadWithContext as never });

		const result = await load(event as never);

		expect(result).toMatchObject({
			orgId: 'org-1',
			personnelId: 'person-1',
			title: 'Follow-ups',
			records
		});
		expect(event.depends).toHaveBeenCalledWith('app:personnel-detail-follow-ups');
		expect(loadWithContext).toHaveBeenCalledWith(
			event.locals,
			event.cookies,
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' }
			})
		);
	});
});
