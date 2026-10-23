import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const PERSON = '00000000-0000-4000-8000-000000000010';
const STATUS = '00000000-0000-4000-8000-000000000020';
const ENTRY = { personnelId: PERSON, statusTypeId: STATUS, note: null, overlap: 'none' };

function context(calendar: 'view' | 'operate' = 'operate') {
	const ctx = createWritePortsContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'organization' },
			capabilityMap: {
				calendar,
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	ctx.store.seed('personnel', [{ id: PERSON, organization_id: 'test-org', group_id: null }]);
	return ctx;
}

describe('POST /api/availability/import', () => {
	it('lets a Calendar operator import statuses and reports the counts', async () => {
		const ctx = context();
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ entries: [{ ...ENTRY, startDate: '2026-12-01', endDate: '2026-12-03' }] },
				() => ctx
			)
		).resolves.toEqual({ added: 1, removed: 0, errors: [] });
	});

	it('denies a Calendar viewer before decoding input or writing', async () => {
		const ctx = context('view');
		await expect(handleUseCaseRequest(_postConfig, ctx, { entries: 'invalid' }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.store.findMany('availability_entries', 'test-org')).toEqual([]);
	});

	it('rejects an end date before the start date at the route boundary', async () => {
		const ctx = context();
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ entries: [{ ...ENTRY, startDate: '2026-12-03', endDate: '2026-12-01' }] },
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('availability_entries', 'test-org')).toEqual([]);
	});

	it('rejects 501 entries at the route boundary', async () => {
		const ctx = context();
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ entries: Array.from({ length: 501 }, () => ({ ...ENTRY, startDate: '2026-12-01', endDate: '2026-12-01' })) },
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects more than 500 replaced entries in one request at the route boundary', async () => {
		const ctx = context();
		const replaces = Array.from({ length: 2 }, (_, index) => ({
			id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
			statusTypeId: STATUS,
			startDate: '2026-12-01',
			endDate: '2026-12-01',
			note: null
		}));
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					entries: Array.from({ length: 251 }, () => ({
						...ENTRY,
						startDate: '2026-12-01',
						endDate: '2026-12-01',
						overlap: 'replace',
						replaces
					}))
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
	});

	it('requires the reviewed note before it accepts a replacement', async () => {
		const ctx = context();
		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					entries: [
						{
							...ENTRY,
							startDate: '2026-12-01',
							endDate: '2026-12-03',
							overlap: 'replace',
							replaces: [
								{
									id: '00000000-0000-4000-8000-000000000030',
									statusTypeId: STATUS,
									startDate: '2026-12-01',
									endDate: '2026-12-02'
								}
							]
						}
					]
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('availability_entries', 'test-org')).toEqual([]);
	});
});
