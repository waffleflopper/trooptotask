import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const PERSON_1 = '00000000-0000-4000-8000-000000000010';
const PERSON_2 = '00000000-0000-4000-8000-000000000011';
const FOREIGN_PERSON = '00000000-0000-4000-8000-000000000012';
const PERSON_ALPHA = '00000000-0000-4000-8000-000000000013';
const PERSON_BRAVO = '00000000-0000-4000-8000-000000000014';
const PERSON_UNASSIGNED = '00000000-0000-4000-8000-000000000015';
const PERSON_FOREIGN = '00000000-0000-4000-8000-000000000016';
const STATUS_OLD = '00000000-0000-4000-8000-000000000017';
const STATUS_NEW = '00000000-0000-4000-8000-000000000018';
const STATUS_1 = '00000000-0000-4000-8000-000000000019';
const STATUS_2 = '00000000-0000-4000-8000-00000000001a';
const GROUP_ALPHA = '00000000-0000-4000-8000-00000000001b';
const GROUP_BRAVO = '00000000-0000-4000-8000-00000000001c';
const GROUP_1 = '00000000-0000-4000-8000-00000000001d';

describe('single-record Calendar availability', () => {
	it('edits one saved status without removing it and rejects a Person change', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const id = '00000000-0000-4000-8000-000000000001';
		ctx.store.seed('personnel', [{ id: PERSON_1, organization_id: ctx.auth.orgId, group_id: null }]);
		ctx.store.seed('availability_entries', [
			{
				id,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_1,
				status_type_id: STATUS_OLD,
				start_date: '2026-09-26',
				end_date: '2026-09-26',
				note: null
			}
		]);

		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id, personnelId: PERSON_2, statusTypeId: STATUS_NEW }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
		expect(
			await ctx.store.findOne<{ status_type_id: string }>('availability_entries', ctx.auth.orgId, { id })
		).toMatchObject({
			status_type_id: STATUS_OLD
		});

		const updated = (await handleUseCaseRequest(
			_putConfig,
			ctx,
			{
				id,
				statusTypeId: STATUS_NEW,
				startDate: '2026-09-27',
				endDate: '2026-09-28',
				note: 'Confirmed'
			},
			() => ctx
		)) as { id: string; personnelId: string; statusTypeId: string };
		expect(updated).toMatchObject({ id, personnelId: PERSON_1, statusTypeId: STATUS_NEW });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toHaveLength(1);
	});
	it('rejects a foreign Person before a Calendar-only Organization operator writes', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [{ id: FOREIGN_PERSON, organization_id: 'another-org', group_id: GROUP_1 }]);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					personnelId: FOREIGN_PERSON,
					statusTypeId: STATUS_1,
					startDate: '2026-09-26',
					endDate: '2026-09-26'
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 404, body: { message: 'Person not found' } });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toHaveLength(0);
	});

	it('lets a Calendar-only Group operator write in scope and rejects other and unassigned People', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: [GROUP_ALPHA] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: PERSON_ALPHA, organization_id: ctx.auth.orgId, group_id: GROUP_ALPHA },
			{ id: PERSON_BRAVO, organization_id: ctx.auth.orgId, group_id: GROUP_BRAVO },
			{ id: PERSON_UNASSIGNED, organization_id: ctx.auth.orgId, group_id: null },
			{ id: PERSON_FOREIGN, organization_id: 'another-org', group_id: GROUP_ALPHA }
		]);

		const entry = {
			personnelId: PERSON_ALPHA,
			statusTypeId: STATUS_1,
			startDate: '2026-09-26',
			endDate: '2026-09-26'
		};
		const created = (await handleUseCaseRequest(_postConfig, ctx, entry, () => ctx)) as { id: string };
		const bravoEntryId = '00000000-0000-4000-8000-000000000002';
		for (const personnelId of [PERSON_BRAVO, PERSON_UNASSIGNED, PERSON_FOREIGN]) {
			await expect(handleUseCaseRequest(_postConfig, ctx, { ...entry, personnelId }, () => ctx)).rejects.toMatchObject({
				status: 403
			});
		}
		ctx.store.seed('availability_entries', [
			{
				id: bravoEntryId,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_BRAVO,
				status_type_id: STATUS_1,
				start_date: '2026-09-26',
				end_date: '2026-09-26'
			}
		]);
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: bravoEntryId }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: bravoEntryId, statusTypeId: STATUS_2 }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		expect(
			await ctx.rawStore.findOne<{ status_type_id: string }>('availability_entries', ctx.auth.orgId, {
				id: bravoEntryId
			})
		).toMatchObject({ status_type_id: STATUS_1 });
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: created.id }, () => ctx)).resolves.toBeDefined();
		expect(await ctx.rawStore.findOne('availability_entries', ctx.auth.orgId, { id: bravoEntryId })).not.toBeNull();
	});

	it('answers 400 for an end date before the start date and saves nothing', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [{ id: PERSON_ALPHA, organization_id: ctx.auth.orgId, group_id: null }]);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ personnelId: PERSON_ALPHA, statusTypeId: STATUS_1, startDate: '2026-09-27', endDate: '2026-09-26' },
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toHaveLength(0);
	});
});
