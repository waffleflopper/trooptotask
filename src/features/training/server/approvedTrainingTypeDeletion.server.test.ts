import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabaseApprovedTrainingTypeDeletionPort } from './approvedTrainingTypeDeletion.server';

type Row = Record<string, unknown>;

function provider(requests: Row[], types: Row[], deleteError?: string) {
	const from = vi.fn((table: string) => {
		let deleting = false;
		const filters: Record<string, unknown> = {};
		const query = {
			select: () => query,
			eq: (column: string, value: unknown) => {
				filters[column] = value;
				return query;
			},
			delete: () => {
				deleting = true;
				return query;
			},
			maybeSingle: async () => {
				const rows = table === 'deletion_requests' ? requests : types;
				const index = rows.findIndex((row) =>
					Object.entries(filters).every(([column, value]) => row[column] === value)
				);
				if (deleting && deleteError) return { data: null, error: { message: deleteError } };
				const data = index >= 0 ? rows[index] : null;
				if (deleting && index >= 0) rows.splice(index, 1);
				return { data, error: null };
			}
		};
		return query;
	});
	const getAdminClient = vi.fn(() => ({ from }) as unknown as SupabaseClient);
	return { from, getAdminClient, port: createSupabaseApprovedTrainingTypeDeletionPort(getAdminClient) };
}

function reviewer(role: 'admin' | 'member' = 'admin') {
	return createTestAuthContext({
		orgId: 'org-1',
		role,
		isPrivileged: role === 'admin',
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: role === 'admin' ? 'none' : 'configure',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
}

describe('approved Training type deletion provider', () => {
	it('lets an Organization reviewer without Training configure delete only the bound same-Organization type', async () => {
		const types = [
			{ id: 'type-1', organization_id: 'org-1' },
			{ id: 'type-2', organization_id: 'org-2' }
		];
		const { port, from } = provider(
			[
				{
					id: 'request-1',
					organization_id: 'org-1',
					status: 'pending',
					resource_type: 'training_type',
					resource_id: 'type-1'
				}
			],
			types
		);

		await port.deleteApprovedTrainingType(reviewer(), 'request-1', 'type-1');
		expect(types).toEqual([{ id: 'type-2', organization_id: 'org-2' }]);
		expect(from.mock.calls.map(([table]) => table)).toEqual(['deletion_requests', 'training_types']);
	});

	it('denies a member before opening the admin client even with Training configure', async () => {
		const { port, getAdminClient } = provider([], []);
		await expect(port.deleteApprovedTrainingType(reviewer('member'), 'request-1', 'type-1')).rejects.toMatchObject({
			status: 403
		});
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('requires a pending request bound to the same Organization and type before deletion', async () => {
		const types = [{ id: 'type-1', organization_id: 'org-1' }];
		const { port, from } = provider(
			[
				{
					id: 'request-1',
					organization_id: 'org-2',
					status: 'pending',
					resource_type: 'training_type',
					resource_id: 'type-1'
				}
			],
			types
		);
		await expect(port.deleteApprovedTrainingType(reviewer(), 'request-1', 'type-1')).rejects.toMatchObject({
			status: 404
		});
		expect(types).toHaveLength(1);
		expect(from).toHaveBeenCalledTimes(1);
	});

	it('keeps a foreign target or failed database delete unchanged', async () => {
		const requests = [
			{
				id: 'request-1',
				organization_id: 'org-1',
				status: 'pending',
				resource_type: 'training_type',
				resource_id: 'type-1'
			}
		];
		const foreignTypes = [{ id: 'type-1', organization_id: 'org-2' }];
		await expect(
			provider(requests, foreignTypes).port.deleteApprovedTrainingType(reviewer(), 'request-1', 'type-1')
		).rejects.toMatchObject({
			status: 404
		});
		expect(foreignTypes).toHaveLength(1);

		const localTypes = [{ id: 'type-1', organization_id: 'org-1' }];
		await expect(
			provider(requests, localTypes, 'foreign reference blocks delete').port.deleteApprovedTrainingType(
				reviewer(),
				'request-1',
				'type-1'
			)
		).rejects.toThrow('foreign reference blocks delete');
		expect(localTypes).toHaveLength(1);
	});
});
