import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '$lib/server/database';
import { createSupabaseCalendarAssignmentReplacementPort } from './dailyAssignmentPersistence.server';

function clientWithResult(result: { data: unknown; error: { code: string; message: string } | null }) {
	return { rpc: vi.fn().mockResolvedValue(result) } as unknown as SupabaseClient;
}

const portFor = (client: SupabaseClient, admin = clientWithResult({ data: [], error: null })) =>
	createSupabaseCalendarAssignmentReplacementPort(client, { admin: () => admin, actorId: 'user-a' });

describe('Calendar assignment replacement provider', () => {
	it('returns the saved assignment identity and retained metadata', async () => {
		const client = clientWithResult({
			data: [
				{
					id: 'saved-id',
					organization_id: 'org-a',
					date: '2026-09-22',
					assignment_type_id: 'type-a',
					assignee_id: 'person-a',
					created_at: '2026-09-28T12:00:00Z'
				}
			],
			error: null
		});
		const port = portFor(client);

		await expect(
			port.replace(
				'org-a',
				['2026-09-22'],
				[
					{ date: '2026-09-22', assignmentTypeId: 'type-a', assigneeId: 'person-a' },
					{ date: '2026-09-22', assignmentTypeId: 'type-b', assigneeId: '' }
				]
			)
		).resolves.toEqual([
			{
				id: 'saved-id',
				organization_id: 'org-a',
				date: '2026-09-22',
				assignmentTypeId: 'type-a',
				assigneeId: 'person-a',
				created_at: '2026-09-28T12:00:00Z'
			}
		]);
		expect(client.rpc).toHaveBeenCalledWith('replace_daily_assignment_slots', {
			p_organization_id: 'org-a',
			p_replace_days: ['2026-09-22'],
			p_slots: [
				{ date: '2026-09-22', assignment_type_id: 'type-a', assignee_id: 'person-a' },
				{ date: '2026-09-22', assignment_type_id: 'type-b', assignee_id: '' }
			]
		});
	});

	it.each([
		[{ code: 'P0001', message: 'Assignment slot unavailable' }, 409],
		[
			{
				code: '23505',
				message:
					'duplicate key value violates unique constraint "daily_assignments_clinic_id_assignment_type_id_date_key"'
			},
			409
		],
		[{ code: '42501', message: 'Permission denied' }, 403]
	] as const)('turns a scoped or occupied-slot rejection into a safe response', async (error, status) => {
		const port = portFor(clientWithResult({ data: null, error }));
		const rejected = port.replace(
			'org-a',
			[],
			[
				{
					date: '2026-09-22',
					assignmentTypeId: 'type-a',
					assigneeId: 'person-a'
				}
			]
		);
		await expect(rejected).rejects.toMatchObject({ status });
		if (status === 409) {
			await expect(rejected).rejects.toMatchObject({
				message: 'This assignment slot is unavailable. Refresh the Calendar and try again.'
			});
		}
	});

	it('does not mislabel an unrelated database failure as a slot conflict', async () => {
		const port = portFor(
			clientWithResult({
				data: null,
				error: { code: '22000', message: 'Another database failure' }
			})
		);
		await expect(
			port.replace(
				'org-a',
				[],
				[
					{
						date: '2026-09-22',
						assignmentTypeId: 'type-a',
						assigneeId: 'person-a'
					}
				]
			)
		).rejects.toMatchObject({ message: 'Another database failure' });
	});

	it('writes roster picks through the service role on behalf of the signed-in operator', async () => {
		const operator = clientWithResult({ data: [], error: null });
		const admin = clientWithResult({
			data: [
				{
					id: 'roster-id',
					organization_id: 'org-a',
					date: '2026-09-23',
					assignment_type_id: 'type-a',
					assignee_id: 'person-a',
					created_at: '2026-09-28T12:00:00Z'
				}
			],
			error: null
		});
		const port = portFor(operator, admin);

		await expect(
			port.writeRoster('org-a', [
				{ date: '2026-09-23', assignmentTypeId: 'type-a', assigneeId: 'person-a', was: 'person-b', source: 'manual' }
			])
		).resolves.toEqual([
			{
				id: 'roster-id',
				organization_id: 'org-a',
				date: '2026-09-23',
				assignmentTypeId: 'type-a',
				assigneeId: 'person-a',
				created_at: '2026-09-28T12:00:00Z'
			}
		]);
		expect(admin.rpc).toHaveBeenCalledWith('write_roster_assignment_slots', {
			p_actor: 'user-a',
			p_organization_id: 'org-a',
			p_slots: [
				{ date: '2026-09-23', assignment_type_id: 'type-a', assignee_id: 'person-a', was: 'person-b', source: 'manual' }
			]
		});
		expect(operator.rpc).not.toHaveBeenCalled();
	});
});
