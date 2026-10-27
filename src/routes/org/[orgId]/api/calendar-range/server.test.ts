import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/calendar-range', () => {
	it('exports a calendar read RouteConfig', () => {
		expect('permission' in _getConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.viewAvailability);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_getConfig.mutation).toBeUndefined();
	});

	it('rejects malformed calendar range dates', async () => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(
				_getConfig,
				ctx,
				{
					rangeStart: '03/01/2026',
					rangeEnd: '2026-03-31',
					today: '2026-03-15',
					collections: ['availability']
				},
				() => ctx
			)
		).rejects.toThrow('Use a valid date (YYYY-MM-DD)');
	});

	it('rejects inverted calendar ranges', async () => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(
				_getConfig,
				ctx,
				{
					rangeStart: '2026-04-01',
					rangeEnd: '2026-03-31',
					today: '2026-03-15',
					collections: ['availability']
				},
				() => ctx
			)
		).rejects.toThrow('rangeStart must not exceed rangeEnd');
	});

	it('rejects calendar ranges longer than one year', async () => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(
				_getConfig,
				ctx,
				{
					rangeStart: '2026-01-01',
					rangeEnd: '2027-01-02',
					today: '2026-03-15',
					collections: ['availability']
				},
				() => ctx
			)
		).rejects.toThrow('Calendar range cannot exceed 366 days');
	});

	it.each([
		[[], 'Too small'],
		[['availability', 'availability'], 'collections must not repeat'],
		[['availability', 'personnel'], 'Invalid']
	])('rejects the collection list %j', async (collections, message) => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(
				_getConfig,
				ctx,
				{ rangeStart: '2026-03-01', rangeEnd: '2026-03-31', today: '2026-03-15', collections } as never,
				() => ctx
			)
		).rejects.toThrow(message);
	});

	function seedMarch(ctx: ReturnType<typeof createTestContext>) {
		ctx.store.seed('availability_entries', [
			{
				id: 'a1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: '2026-03-01',
				end_date: '2026-03-05',
				note: null
			}
		]);
		ctx.store.seed('special_days', [
			{ id: 'sd1', organization_id: ctx.auth.orgId, date: '2026-03-15', name: 'Training Holiday', type: 'org-closure' }
		]);
		ctx.store.seed('daily_assignments', [
			{ id: 'da1', organization_id: ctx.auth.orgId, date: '2026-03-10', assignment_type_id: 'at1', assignee_id: 'p1' }
		]);
	}

	it('returns only the ranged calendar payload for the requested window', async () => {
		const ctx = createTestContext();

		seedMarch(ctx);

		const result = await handleUseCaseRequest(
			_getConfig,
			ctx,
			{
				rangeStart: '2026-03-01',
				rangeEnd: '2026-03-31',
				today: '2026-03-15',
				collections: ['availability', 'assignments']
			},
			() => ctx
		);

		expect(result).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			availabilityEntries: [
				expect.objectContaining({
					id: 'a1',
					personnelId: 'p1'
				})
			],
			specialDays: [
				expect.objectContaining({
					id: 'sd1',
					name: 'Training Holiday'
				})
			],
			dailyAssignments: [
				expect.objectContaining({
					id: 'da1',
					assignmentTypeId: 'at1'
				})
			]
		});
		expect('assignmentTypes' in result).toBe(false);
		expect('pinnedGroups' in result).toBe(false);
	});

	it('sends availability alone, or assignments with their special days, as the request names', async () => {
		const ctx = createTestContext();
		seedMarch(ctx);
		const sent = async (collections: ('availability' | 'assignments')[]) =>
			JSON.parse(
				JSON.stringify(
					await handleUseCaseRequest(
						_getConfig,
						ctx,
						{ rangeStart: '2026-03-01', rangeEnd: '2026-03-31', today: '2026-03-15', collections },
						() => ctx
					)
				)
			);

		expect(await sent(['availability'])).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			availabilityEntries: [expect.objectContaining({ id: 'a1' })]
		});
		expect(await sent(['assignments'])).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			specialDays: [expect.objectContaining({ id: 'sd1' })],
			dailyAssignments: [expect.objectContaining({ id: 'da1' })]
		});
	});

	it('sends every collection to a request that names none, as a tab loaded before collections did', async () => {
		const ctx = createTestContext();
		seedMarch(ctx);
		const input = _getConfig.parseInput!({
			url: new URL('https://trooptotask.test/org/o/api/calendar-range?rangeStart=2026-03-01&rangeEnd=2026-03-31'),
			cookies: { get: () => undefined }
		} as never);

		expect(JSON.parse(JSON.stringify(await handleUseCaseRequest(_getConfig, ctx, input, () => ctx)))).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			availabilityEntries: [expect.objectContaining({ id: 'a1' })],
			specialDays: [expect.objectContaining({ id: 'sd1' })],
			dailyAssignments: [expect.objectContaining({ id: 'da1' })]
		});
	});

	describe('events collection', () => {
		const projection = {
			events: [
				{
					id: '11111111-1111-4111-8111-111111111111',
					title: 'Field exercise',
					startsOn: '2026-03-04',
					endsOn: '2026-03-06',
					cancelled: false,
					hasWork: false,
					host: null
				}
			],
			suspenses: [],
			commitments: []
		};
		const request = {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			today: '2026-03-15',
			collections: ['events' as const]
		};
		const workspace = {
			taskings: {},
			events: {},
			counts: { active: 0, overdue: 0, blocked: 0, needsPeople: 0, completed: 0 }
		};
		const taskingWorkspace = { read: async () => workspace };
		const noFacts = { taskings: {}, events: {}, needAction: 0 };

		it('returns the projection of the range beside nothing else', async () => {
			const ctx = { ...createTestContext(), calendarProjection: { read: async () => projection }, taskingWorkspace };

			const result = await handleUseCaseRequest(_getConfig, ctx, request, () => ctx);

			expect(JSON.parse(JSON.stringify(result))).toEqual({
				rangeStart: '2026-03-01',
				rangeEnd: '2026-03-31',
				projection: { kind: 'loaded', ...projection, facts: noFacts }
			});
		});

		it('reports a refused projection as failed so the rest of the Calendar still answers', async () => {
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
			const ctx = {
				...createTestContext(),
				calendarProjection: {
					read: async () => {
						throw new Error('rpc failed');
					}
				},
				taskingWorkspace
			};
			seedMarch(ctx);

			const result = await handleUseCaseRequest(
				_getConfig,
				ctx,
				{ ...request, collections: ['availability', 'events'] },
				() => ctx
			);

			expect(result.projection).toEqual({ kind: 'failed' });
			expect(result.availabilityEntries).toEqual([expect.objectContaining({ id: 'a1' })]);
			consoleError.mockRestore();
		});

		it('reads nothing while the switch is off', async () => {
			const read = vi.fn();
			const base = createTestContext();
			const ctx = { ...base, disabledFeatures: ['eventsAndTaskings' as const], calendarProjection: { read } };

			const result = await handleUseCaseRequest(_getConfig, ctx, request, () => ctx);

			expect(read).not.toHaveBeenCalled();
			expect(result.projection).toEqual({ kind: 'loaded', events: [], suspenses: [], commitments: [], facts: noFacts });
		});
	});
});
