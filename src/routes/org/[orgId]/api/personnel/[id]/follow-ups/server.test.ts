import { createPersonnelArtifactDeliveryContext } from '$lib/server/adapters/requestContexts.server';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { PersonnelFollowUp } from '$features/personnel/contracts';
import { _getConfig, _postConfig } from './+server';
import { _patchConfig } from './[followUpId]/+server';

const PERSON_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_PERSON_ID = '00000000-0000-4000-8000-0000000000a2';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: PERSON_ID,
			organization_id: ctx.auth.orgId,
			group_id: null
		}
	]);
}

describe('/api/personnel/[id]/follow-ups', () => {
	it('lists, creates, updates, toggles, and archives follow-ups through API configs', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		const created = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				title: 'Complete BLC packet'
			},
			() => createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp;
		const completed = (await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				followUpId: created.id,
				status: 'completed'
			},
			() => createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp;
		const edited = (await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				followUpId: created.id,
				title: 'Updated packet follow-up',
				notes: 'Bring forms to the training room',
				dueDate: '2026-06-15'
			},
			() => createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp;
		const followUps = (await handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_ID }, () =>
			createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp[];
		const archived = (await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				followUpId: created.id,
				status: 'archived'
			},
			() => createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp;
		const restored = (await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				followUpId: created.id,
				action: 'restore'
			},
			() => createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp;

		expect(created).toMatchObject({ title: 'Complete BLC packet', status: 'open' });
		expect(completed).toMatchObject({ id: created.id, status: 'completed' });
		expect(edited).toMatchObject({
			id: created.id,
			title: 'Updated packet follow-up',
			notes: 'Bring forms to the training room',
			dueDate: '2026-06-15'
		});
		expect(followUps).toHaveLength(1);
		expect(archived.status).toBe('archived');
		expect(restored.status).toBe('completed');
	});

	it('derives the Personnel id from the route param and rejects mismatched bodies', async () => {
		await expect(
			_postConfig.parseInput?.({
				params: { id: PERSON_ID },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ personnelId: OTHER_PERSON_ID, title: 'Mismatch' })
				})
			} as never)
		).rejects.toMatchObject({ status: 400 });

		await expect(
			_postConfig.parseInput?.({
				params: { id: PERSON_ID },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ title: 'Follow up' })
				})
			} as never)
		).resolves.toMatchObject({ personnelId: PERSON_ID, title: 'Follow up' });
	});

	it('rejects mixed status and edit payloads instead of silently dropping fields', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		const created = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				title: 'Complete BLC packet'
			},
			() => createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp;

		await expect(
			handleUseCaseRequest(
				_patchConfig,
				ctx,
				{
					personnelId: PERSON_ID,
					followUpId: created.id,
					title: 'Updated packet follow-up',
					status: 'open'
				},
				() => createPersonnelArtifactDeliveryContext(ctx)
			)
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects unknown follow-up action and status payloads', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);
		const created = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				title: 'Complete BLC packet'
			},
			() => createPersonnelArtifactDeliveryContext(ctx)
		)) as PersonnelFollowUp;

		await expect(
			handleUseCaseRequest(
				_patchConfig,
				ctx,
				{
					personnelId: PERSON_ID,
					followUpId: created.id,
					action: 'publish'
				},
				() => createPersonnelArtifactDeliveryContext(ctx)
			)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			handleUseCaseRequest(
				_patchConfig,
				ctx,
				{
					personnelId: PERSON_ID,
					followUpId: created.id,
					status: 'pending'
				},
				() => createPersonnelArtifactDeliveryContext(ctx)
			)
		).rejects.toMatchObject({ status: 400 });
	});

	it('requires Personnel configure capability for sensitive follow-up reads', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		await expect(
			handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_ID }, () =>
				createPersonnelArtifactDeliveryContext(ctx)
			)
		).rejects.toMatchObject({
			status: 403
		});
	});
});
