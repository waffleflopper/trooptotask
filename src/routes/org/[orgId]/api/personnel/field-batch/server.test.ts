import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { GroupCoverage } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const alpha = '0a000000-0000-4000-8000-000000000001';
const bravo = '0b000000-0000-4000-8000-000000000002';
const charlie = '0c000000-0000-4000-8000-000000000003';
const able = '1a000000-0000-4000-8000-000000000001';
const baker = '1b000000-0000-4000-8000-000000000002';
const archived = '1c000000-0000-4000-8000-000000000003';
const unassigned = '1d000000-0000-4000-8000-000000000004';
const charlieMember = '1e000000-0000-4000-8000-000000000005';
const missing = '1f000000-0000-4000-8000-000000000006';

function context(personnel: 'view' | 'operate', scopeSet: GroupCoverage = { kind: 'organization' }) {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar: 'none',
				personnel,
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet
		}
	});
	const orgId = ctx.auth.orgId;
	ctx.rawStore.seed('groups', [
		{ id: alpha, organization_id: orgId, name: 'Alpha', sort_order: 0 },
		{ id: bravo, organization_id: orgId, name: 'Bravo', sort_order: 1 },
		{ id: charlie, organization_id: orgId, name: 'Charlie', sort_order: 2 }
	]);
	ctx.store.seed(
		'organization_rank_catalog',
		['SGT', 'SSG'].map((code, index) => ({
			organization_id: orgId,
			code,
			label: code,
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-5',
			state: 'active',
			source: 'built-in',
			sort_order: index
		}))
	);
	const person = (id: string, last: string, groupId: string | null, archivedAt: string | null = null) => ({
		id,
		organization_id: orgId,
		rank: 'SGT',
		last_name: last,
		first_name: 'Pat',
		slug: `${last.toLowerCase()}-pat`,
		mos: '68W',
		clinic_role: 'Medic',
		ets: null,
		group_id: groupId,
		archived_at: archivedAt
	});
	ctx.rawStore.seed('personnel', [
		person(able, 'Able', alpha),
		person(baker, 'Baker', bravo),
		person(archived, 'Archived', alpha, '2026-01-01T00:00:00Z'),
		person(unassigned, 'Unassigned', null),
		person(charlieMember, 'Charlie', charlie)
	]);
	return ctx;
}

const setField = (ctx: ReturnType<typeof context>, input: Record<string, unknown>) =>
	handleUseCaseRequest(_postConfig, ctx, input, () => ctx);

async function stored(ctx: ReturnType<typeof context>, id: string) {
	const row = await ctx.rawStore.findOne<{ rank: string; mos: string; clinic_role: string; ets: string | null }>(
		'personnel',
		ctx.auth.orgId,
		{ id }
	);
	return { rank: row?.rank, mos: row?.mos, clinicRole: row?.clinic_role, ets: row?.ets };
}

describe('POST /api/personnel/field-batch', () => {
	it('declares the unscoped manageRecords route policy and leaves the per-person check to the operation', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' }
		});
	});

	it('sets one field for every selected Person and reports each one', async () => {
		const ctx = context('operate');

		await expect(
			setField(ctx, { personnelIds: [able, baker, unassigned], field: 'rank', value: 'ssg' })
		).resolves.toEqual({
			field: 'rank',
			value: 'SSG',
			results: [
				{ id: able, outcome: 'updated' },
				{ id: baker, outcome: 'updated' },
				{ id: unassigned, outcome: 'updated' }
			]
		});
		expect((await stored(ctx, able)).rank).toBe('SSG');
		expect((await stored(ctx, unassigned)).rank).toBe('SSG');
		expect((await stored(ctx, charlieMember)).rank).toBe('SGT');
	});

	it('sets MOS, Duty Role and ETS and leaves the other fields alone', async () => {
		const ctx = context('operate');

		await setField(ctx, { personnelIds: [able, baker], field: 'mos', value: ' 68C ' });
		await setField(ctx, { personnelIds: [able], field: 'clinicRole', value: 'Platoon Medic' });
		await expect(setField(ctx, { personnelIds: [able], field: 'ets', value: '2027-03-15' })).resolves.toMatchObject({
			field: 'ets',
			value: '2027-03-15'
		});

		expect(await stored(ctx, able)).toEqual({
			rank: 'SGT',
			mos: '68C',
			clinicRole: 'Platoon Medic',
			ets: '2027-03-15'
		});
		expect(await stored(ctx, baker)).toEqual({ rank: 'SGT', mos: '68C', clinicRole: 'Medic', ets: null });
	});

	it('refuses the People in a Group the operator cannot write and still saves the others', async () => {
		const ctx = context('operate', groupCoverageForTest({ kind: 'groups', groupIds: [alpha, bravo] }));

		const result = await setField(ctx, { personnelIds: [able, charlieMember, baker], field: 'mos', value: '68W1' });

		expect(result.results.map(({ id, outcome }) => ({ id, outcome }))).toEqual([
			{ id: able, outcome: 'updated' },
			{ id: charlieMember, outcome: 'refused' },
			{ id: baker, outcome: 'updated' }
		]);
		expect(
			[await stored(ctx, able), await stored(ctx, charlieMember), await stored(ctx, baker)].map((p) => p.mos)
		).toEqual(['68W1', '68W', '68W1']);
		expect(ctx.auditPort.events.filter((event) => event.action === 'policy.denied')).toHaveLength(1);
	});

	it('reports an archived or missing Person as unavailable without writing', async () => {
		const ctx = context('operate');

		const result = await setField(ctx, { personnelIds: [archived, missing, able], field: 'clinicRole', value: 'Lead' });

		expect(result.results.map(({ id, outcome }) => ({ id, outcome }))).toEqual([
			{ id: archived, outcome: 'unavailable' },
			{ id: missing, outcome: 'unavailable' },
			{ id: able, outcome: 'updated' }
		]);
		expect((await stored(ctx, archived)).clinicRole).toBe('Medic');
	});

	it('rejects a Personnel viewer with 403 and writes nothing', async () => {
		const ctx = context('view');

		await expect(setField(ctx, { personnelIds: [able], field: 'mos', value: '11B' })).rejects.toMatchObject({
			status: 403
		});
		expect((await stored(ctx, able)).mos).toBe('68W');
	});

	it('rejects a rank outside the catalog, an empty value, a bad date and malformed input with 400 before any write', async () => {
		const ctx = context('operate');
		const rejected = [
			{ personnelIds: [able], field: 'rank', value: 'GEN' },
			{ personnelIds: [able], field: 'mos', value: '   ' },
			{ personnelIds: [able], field: 'ets', value: 'next spring' },
			{ personnelIds: [able], field: 'deros', value: '2027-03-15' },
			{ personnelIds: [able], field: 'mos' },
			{ personnelIds: [], field: 'mos', value: '11B' },
			{ personnelIds: ['not-a-uuid'], field: 'mos', value: '11B' },
			{ personnelIds: Array.from({ length: 501 }, () => able), field: 'mos', value: '11B' }
		];

		for (const input of rejected) {
			await expect(setField(ctx, input)).rejects.toMatchObject({ status: 400 });
		}
		expect(await stored(ctx, able)).toEqual({ rank: 'SGT', mos: '68W', clinicRole: 'Medic', ets: null });
	});
});
