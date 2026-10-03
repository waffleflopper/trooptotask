import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabaseApprovedTrainingDeletionPort } from './approvedTrainingDeletion.server';

type Row = Record<string, unknown>;

function provider(requests: Row[], types: Row[], deleteError?: string, completions: Row[] = [], readError?: string) {
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
				const rows = table === 'training_types' ? types : completions;
				const index = rows.findIndex((row) =>
					Object.entries(filters).every(([column, value]) => row[column] === value)
				);
				if (deleting && deleteError) return { data: null, error: { message: deleteError } };
				if (!deleting && readError) return { data: null, error: { message: readError } };
				const data = index >= 0 ? rows[index] : null;
				if (deleting && index >= 0) rows.splice(index, 1);
				return { data, error: null };
			}
		};
		return query;
	});
	const getAdminClient = vi.fn(() => ({ from }) as unknown as SupabaseClient);
	const requirePending = vi.fn(async (orgId: string, requestId: string, resourceType: string, resourceId: string) => {
		if (
			!requests.some(
				(row) =>
					row.organization_id === orgId &&
					row.id === requestId &&
					row.status === 'pending' &&
					row.resource_type === resourceType &&
					row.resource_id === resourceId
			)
		) {
			throw Object.assign(new Error('Pending deletion request not found'), { status: 404 });
		}
	});
	return {
		from,
		getAdminClient,
		requirePending,
		port: createSupabaseApprovedTrainingDeletionPort(getAdminClient, requirePending)
	};
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
		const { port } = provider(
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
	});

	it('denies a member before opening the admin client even with Training configure', async () => {
		const { port, getAdminClient, requirePending } = provider([], []);
		await expect(port.deleteApprovedTrainingType(reviewer('member'), 'request-1', 'type-1')).rejects.toMatchObject({
			status: 403
		});
		expect(getAdminClient).not.toHaveBeenCalled();
		expect(requirePending).not.toHaveBeenCalled();
	});

	it('requires a pending request bound to the same Organization and type before deletion', async () => {
		const types = [{ id: 'type-1', organization_id: 'org-1' }];
		const { port } = provider(
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
	});

	it('rechecks pending authority on an absent-type retry without re-reading a successful target', async () => {
		const requests = [
			{
				id: 'request-1',
				organization_id: 'org-1',
				status: 'pending',
				resource_type: 'training_type',
				resource_id: 'type-1'
			}
		];
		const types = [{ id: 'type-1', organization_id: 'org-1' }];
		const { port, from, requirePending } = provider(requests, types);
		await port.deleteApprovedTrainingType(reviewer(), 'request-1', 'type-1');
		expect(from).toHaveBeenCalledTimes(1);
		await port.deleteApprovedTrainingType(reviewer(), 'request-1', 'type-1');
		expect(types).toEqual([]);
		expect(requirePending).toHaveBeenCalledTimes(2);
		expect(requirePending).toHaveBeenLastCalledWith('org-1', 'request-1', 'training_type', 'type-1');
		requests[0].status = 'cancelled';
		await expect(port.deleteApprovedTrainingType(reviewer(), 'request-1', 'type-1')).rejects.toMatchObject({
			status: 404
		});
		expect(from).toHaveBeenCalledTimes(3);
	});

	it('propagates a failed pending guard before privileged access and a failed missing-target lookup', async () => {
		const requests = [
			{
				id: 'request-1',
				organization_id: 'org-1',
				status: 'pending',
				resource_type: 'training_type',
				resource_id: 'type-1'
			}
		];
		const unavailable = provider(requests, []);
		unavailable.requirePending.mockRejectedValueOnce(new Error('request unavailable'));
		await expect(unavailable.port.deleteApprovedTrainingType(reviewer(), 'request-1', 'type-1')).rejects.toThrow(
			'request unavailable'
		);
		expect(unavailable.getAdminClient).not.toHaveBeenCalled();
		await expect(
			provider(requests, [], undefined, [], 'lookup unavailable').port.deleteApprovedTrainingType(
				reviewer(),
				'request-1',
				'type-1'
			)
		).rejects.toThrow('lookup unavailable');
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

describe('approved Training completion deletion provider', () => {
	function pendingRequest(overrides: Row = {}): Row {
		return {
			id: 'request-1',
			organization_id: 'org-1',
			status: 'pending',
			resource_type: 'personnel_training',
			resource_id: 'completion-1',
			...overrides
		};
	}

	it('lets an Organization reviewer without Training authority delete only the requested completion and retry', async () => {
		const completions = [
			{ id: 'completion-1', organization_id: 'org-1' },
			{ id: 'completion-2', organization_id: 'org-1' },
			{ id: 'completion-foreign', organization_id: 'org-2' }
		];
		const { port } = provider([pendingRequest()], [], undefined, completions);

		await port.deleteApprovedTrainingRecord(reviewer(), 'request-1', 'completion-1');
		await expect(port.deleteApprovedTrainingRecord(reviewer(), 'request-1', 'completion-1')).resolves.toBeUndefined();
		expect(completions).toEqual([
			{ id: 'completion-2', organization_id: 'org-1' },
			{ id: 'completion-foreign', organization_id: 'org-2' }
		]);
	});

	it('denies a member before opening the privileged client even with Training configure', async () => {
		const { port, getAdminClient, requirePending } = provider([pendingRequest()], []);
		await expect(
			port.deleteApprovedTrainingRecord(reviewer('member'), 'request-1', 'completion-1')
		).rejects.toMatchObject({ status: 403 });
		expect(getAdminClient).not.toHaveBeenCalled();
		expect(requirePending).not.toHaveBeenCalled();
	});

	it.each([
		['another Organization', { organization_id: 'org-2' }],
		['a completed review', { status: 'approved' }],
		['another resource kind', { resource_type: 'training_type' }],
		['another completion', { resource_id: 'completion-2' }],
		['another request', { id: 'request-2' }]
	])('rejects a pending-request mismatch for %s without deleting the completion', async (_reason, overrides) => {
		const completions = [{ id: 'completion-1', organization_id: 'org-1' }];
		const { port } = provider([pendingRequest(overrides)], [], undefined, completions);
		await expect(port.deleteApprovedTrainingRecord(reviewer(), 'request-1', 'completion-1')).rejects.toMatchObject({
			status: 404
		});
		expect(completions).toEqual([{ id: 'completion-1', organization_id: 'org-1' }]);
	});

	it('treats an absent local target as an idempotent no-op without touching a foreign target', async () => {
		const completions = [{ id: 'completion-1', organization_id: 'org-2' }];
		const { port } = provider([pendingRequest()], [], undefined, completions);
		await expect(port.deleteApprovedTrainingRecord(reviewer(), 'request-1', 'completion-1')).resolves.toBeUndefined();
		expect(completions).toEqual([{ id: 'completion-1', organization_id: 'org-2' }]);
	});

	it('propagates database deletion failure and retains the completion', async () => {
		const completions = [{ id: 'completion-1', organization_id: 'org-1' }];
		const { port } = provider([pendingRequest()], [], 'delete unavailable', completions);
		await expect(port.deleteApprovedTrainingRecord(reviewer(), 'request-1', 'completion-1')).rejects.toThrow(
			'delete unavailable'
		);
		expect(completions).toEqual([{ id: 'completion-1', organization_id: 'org-1' }]);
	});
});
