import { describe, expect, it } from 'vitest';
import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/calendar-reports/status-days', () => {
	it('uses a policy-first route config for report reads', () => {
		expect('permission' in _getConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.viewReports);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });
	});

	it('uses Calendar report policy decisions instead of privileged route gates', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		const result = await handleUseCaseRequest(
			_getConfig,
			ctx,
			{
				startDate: '2026-03-01',
				endDate: '2026-03-31'
			},
			() => ctx
		);

		expect(result).toMatchObject({
			entries: [],
			assignments: [],
			assignmentTypes: [],
			excusals: []
		});
	});

	describe('excusals', () => {
		const range = { startDate: '2026-03-01', endDate: '2026-03-31' };
		const member = {
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				calendar: 'view',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		} as const;

		function seeded(auth?: Parameters<typeof createTestContext>[0]) {
			const ctx = createTestContext(auth);
			const organization_id = ctx.auth.orgId;
			ctx.store.seed('personnel', [
				{ id: 'alpha-1', organization_id, group_id: 'group-alpha' },
				{ id: 'bravo-1', organization_id, group_id: 'group-bravo' }
			]);
			ctx.store.seed('roster_excusals', [
				{
					id: 'x1',
					organization_id,
					assignment_type_id: 'cq',
					personnel_id: 'alpha-1',
					reason: 'Profile',
					starts_on: '2026-03-05',
					ends_on: '2026-03-09'
				},
				{
					id: 'x2',
					organization_id,
					assignment_type_id: 'cq',
					personnel_id: 'bravo-1',
					reason: 'TDY',
					starts_on: '2026-02-01',
					ends_on: null
				},
				{
					id: 'x3',
					organization_id,
					assignment_type_id: 'sd',
					personnel_id: 'alpha-1',
					reason: 'Old',
					starts_on: '2026-01-01',
					ends_on: '2026-02-28'
				},
				{
					id: 'x4',
					organization_id,
					assignment_type_id: 'sd',
					personnel_id: 'alpha-1',
					reason: 'Later',
					starts_on: '2026-04-01',
					ends_on: null
				}
			]);
			return ctx;
		}

		it('returns the excusals that overlap the span, reinstated ones included and without their reasons', async () => {
			const ctx = seeded();

			const result = await handleUseCaseRequest(_getConfig, ctx, range, () => ctx);

			expect((result as { excusals: unknown }).excusals).toEqual([
				{ assignmentTypeId: 'cq', personId: 'bravo-1', from: '2026-02-01', through: null },
				{ assignmentTypeId: 'cq', personId: 'alpha-1', from: '2026-03-05', through: '2026-03-09' }
			]);
		});

		it('shows a Group-scoped reader only the excusals of the people in their Groups', async () => {
			const ctx = seeded({
				auth: { ...member, scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }) }
			});

			const result = await handleUseCaseRequest(_getConfig, ctx, range, () => ctx);

			expect(result).toMatchObject({
				excusals: [{ assignmentTypeId: 'cq', personId: 'alpha-1', from: '2026-03-05', through: '2026-03-09' }]
			});
		});

		it('shows a reader scoped to no Group no excusals', async () => {
			const ctx = seeded({ auth: { ...member, scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: [] }) } });

			const result = await handleUseCaseRequest(_getConfig, ctx, range, () => ctx);

			expect(result).toMatchObject({ excusals: [] });
		});
	});

	describe('pool spans', () => {
		const range = { startDate: '2026-03-01', endDate: '2026-03-31' };
		const medic = { rank: null, mos: ['68W'], role: [], groupIds: [] };

		it('returns the DA 6 forms that overlap the span as the pool each drew from, without their records', async () => {
			const ctx = createTestContext();
			const organization_id = ctx.auth.orgId;
			const record = { segments: [{ month: '2026-02' }] };
			ctx.store.seed('roster_forms', [
				{
					id: 'f1',
					organization_id,
					assignment_type_id: 'cq',
					starts_on: '2026-01-01',
					ends_on: '2026-02-14',
					rules: { pool: null, weekendMode: 'same' },
					record
				},
				{
					id: 'f2',
					organization_id,
					assignment_type_id: 'cq',
					starts_on: '2026-02-15',
					ends_on: '2026-03-10',
					rules: { pool: null, weekendMode: 'same' },
					record
				},
				{
					id: 'f3',
					organization_id,
					assignment_type_id: 'cq',
					starts_on: '2026-03-11',
					ends_on: null,
					rules: { pool: medic, weekendMode: 'same' },
					record: null
				},
				{
					id: 'f4',
					organization_id,
					assignment_type_id: 'sd',
					starts_on: '2026-04-01',
					ends_on: null,
					rules: { pool: medic, weekendMode: 'same' },
					record: null
				}
			]);

			const result = await handleUseCaseRequest(_getConfig, ctx, range, () => ctx);

			expect((result as { poolSpans: unknown }).poolSpans).toEqual([
				{ assignmentTypeId: 'cq', from: '2026-02-15', through: '2026-03-10', pool: null },
				{ assignmentTypeId: 'cq', from: '2026-03-11', through: null, pool: medic }
			]);
		});
	});

	it('denies report reads without Calendar view capability', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});

		await expect(
			handleUseCaseRequest(
				_getConfig,
				ctx,
				{
					startDate: '2026-03-01',
					endDate: '2026-03-31'
				},
				() => ctx
			)
		).rejects.toMatchObject({
			status: 403,
			message:
				"You don't have permission. This requires Calendar can view permissions. Talk to your organization owner or admin."
		});
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar.viewReports',
			details: {
				policyAction: 'calendar.viewReports',
				reasonCode: 'denied:missing-capability'
			}
		});
	});

	it.each([
		['2026-02-30', '2026-03-31'],
		['2026-03-01', '2026-13-01'],
		['2026-3-01', '2026-03-31']
	])('rejects the impossible or malformed range %s to %s with 400', async (startDate, endDate) => {
		const ctx = createTestContext();

		await expect(handleUseCaseRequest(_getConfig, ctx, { startDate, endDate }, () => ctx)).rejects.toMatchObject({
			status: 400,
			message: 'Dates must be in YYYY-MM-DD format'
		});
	});

	it('reads a span of 366 inclusive days', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(
			_getConfig,
			ctx,
			{ startDate: '2026-01-01', endDate: '2027-01-01' },
			() => ctx
		);

		expect(result).toMatchObject({ entries: [], assignments: [], assignmentTypes: [], excusals: [] });
	});

	it.each([
		['2026-01-01', '2027-01-02'],
		['1970-01-01', '9999-12-31']
	])('rejects the span %s to %s past 366 days with 400', async (startDate, endDate) => {
		const ctx = createTestContext();

		await expect(handleUseCaseRequest(_getConfig, ctx, { startDate, endDate }, () => ctx)).rejects.toMatchObject({
			status: 400,
			message: 'Calendar range cannot exceed 366 days'
		});
	});
});
