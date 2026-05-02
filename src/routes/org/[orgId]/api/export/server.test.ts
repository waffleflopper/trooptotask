import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('POST /api/export', () => {
	it('requires Leader Book view policy before exporting counseling and goals', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'configure',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				},
				compatibilityLanes: { leadersBook: 'none' },
				requireManageMembers() {}
			}
		});

		await expect(handleUseCaseRequest(_postConfig, ctx, { email: 'leader@example.com' })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have permission to perform this action'
		});
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'leadersBook.viewRecords',
				details: expect.objectContaining({
					policyAction: 'leadersBook.viewRecords',
					reasonCode: 'denied:missing-capability'
				})
			})
		);
	});

	it('includes ETS and DEROS in the organization personnel export payload', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: '2026-11-30',
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const payload = JSON.parse(result._json as string) as {
			personnel: Array<Record<string, unknown>>;
		};
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);

		expect(payload.personnel).toEqual([
			expect.objectContaining({
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed'
			})
		]);
	});

	it('still returns the export payload when the export status write fails', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: '2026-11-30',
				archived_at: null
			}
		]);

		const originalUpdate = ctx.rawStore.update.bind(ctx.rawStore);
		ctx.rawStore.update = async (...args) => {
			const [table] = args;
			if (table === 'data_exports') {
				throw new Error('UPDATE denied for data_exports');
			}
			return originalUpdate(...args);
		};

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		const payload = JSON.parse(result._json as string) as {
			personnel: Array<Record<string, unknown>>;
		};
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);

		expect(payload.personnel).toEqual([
			expect.objectContaining({
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'processing'
			})
		]);
	});
});
