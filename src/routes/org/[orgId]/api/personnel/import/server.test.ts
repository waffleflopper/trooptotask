import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

function context(personnel: 'view' | 'operate' = 'operate') {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'organization' },
			capabilityMap: {
				personnel,
				calendar: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	ctx.store.seed('organization_rank_catalog', [{ organization_id: 'test-org', code: 'SGT', state: 'active' }]);
	ctx.store.seed('personnel', [
		{
			id: 'person-a',
			organization_id: 'test-org',
			rank: 'SGT',
			first_name: 'Jamie',
			last_name: 'Smith',
			group_id: null,
			mos: '68W',
			clinic_role: 'Medic',
			archived_at: null
		}
	]);
	return ctx;
}

describe('POST /api/personnel/import', () => {
	it('lets a Personnel operator submit resolved creates and updates and returns saved rows', async () => {
		const ctx = context();
		const result = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				records: [
					{ op: 'create', rank: 'SGT', firstName: 'New', lastName: 'Person' },
					{ op: 'update', personnelId: 'person-a', changes: { mos: '68V' } }
				]
			},
			() => ctx
		);
		expect(result).toMatchObject({
			created: [{ slug: 'person-new', rank: 'SGT', firstName: 'New', lastName: 'Person' }],
			updated: [{ id: 'person-a', mos: '68V', clinicRole: 'Medic' }],
			errors: []
		});
	});

	it('denies a viewer before decoding input or writing records', async () => {
		const ctx = context('view');
		await expect(handleUseCaseRequest(_postConfig, ctx, { records: 'invalid' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ mos: '68W' });
	});

	it('rejects 501 records through the route boundary', async () => {
		const ctx = context();
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					records: Array.from({ length: 501 }, () => ({
						op: 'update',
						personnelId: 'person-a',
						changes: { mos: 'BAD' }
					}))
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({ mos: '68W' });
	});

	it('strips fields outside the create and update contracts before saving', async () => {
		const ctx = context();
		const result = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				records: [
					{
						op: 'update',
						personnelId: 'person-a',
						changes: { mos: '68V', firstName: 'Overwritten', archivedAt: '2026-10-01', organizationId: 'other-org' }
					}
				]
			},
			() => ctx
		);
		expect(result).toMatchObject({
			created: [],
			updated: [{ id: 'person-a', firstName: 'Jamie', mos: '68V', archivedAt: null }],
			errors: []
		});
		await expect(ctx.personnel.findById('person-a')).resolves.toMatchObject({
			firstName: 'Jamie',
			mos: '68V',
			archivedAt: null
		});
	});
});
