import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it } from 'vitest';
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
	const rank = (code: string, state: 'active' | 'retired', sortOrder: number) => ({
		organization_id: orgId,
		code,
		label: code,
		service: 'army',
		category: 'enlisted',
		pay_grade: 'E-5',
		state,
		source: 'built-in',
		sort_order: sortOrder
	});
	ctx.store.seed('organization_rank_catalog', [
		rank('SGT', 'active', 0),
		rank('SSG', 'active', 1),
		rank('CPL', 'retired', 2)
	]);
	ctx.rawStore.seed('groups', [
		{ id: alpha, organization_id: orgId, name: 'Alpha', sort_order: 0 },
		{ id: bravo, organization_id: orgId, name: 'Bravo', sort_order: 1 },
		{ id: charlie, organization_id: orgId, name: 'Charlie', sort_order: 2 }
	]);
	const person = (id: string, last: string, groupId: string | null, archivedAt: string | null = null) => ({
		id,
		organization_id: orgId,
		rank: 'SGT',
		last_name: last,
		first_name: 'Pat',
		mos: '68W',
		clinic_role: 'Medic',
		ets: '2027-01-01',
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

type TestContext = ReturnType<typeof context>;

const setField = (ctx: TestContext, input: Record<string, unknown>) =>
	handleUseCaseRequest(_postConfig, ctx, input, () => ctx);

async function valuesOf(ctx: TestContext, ids: string[]) {
	return Promise.all(
		ids.map(async (id) => {
			const row = await ctx.rawStore.findOne<Record<string, unknown>>('personnel', ctx.auth.orgId, { id });
			return [row?.rank, row?.mos, row?.clinic_role, row?.ets];
		})
	);
}

describe('POST /api/personnel/field-batch', () => {
	it('sets each field on every active Person and reports the archived and missing ones as unavailable', async () => {
		const ctx = context('operate');
		const ids = [able, baker, archived, unassigned, missing];

		await expect(setField(ctx, { personnelIds: ids, field: 'mos', value: '  68X  ' })).resolves.toEqual({
			field: 'mos',
			value: '68X',
			updatedIds: [able, baker, unassigned],
			refusedIds: [],
			unavailableIds: [archived, missing]
		});
		await expect(
			setField(ctx, { personnelIds: ids, field: 'clinicRole', value: 'Platoon medic' })
		).resolves.toMatchObject({
			updatedIds: [able, baker, unassigned]
		});
		await expect(setField(ctx, { personnelIds: ids, field: 'ets', value: '2028-02-29' })).resolves.toMatchObject({
			value: '2028-02-29',
			updatedIds: [able, baker, unassigned]
		});
		await expect(setField(ctx, { personnelIds: ids, field: 'rank', value: 'SSG' })).resolves.toMatchObject({
			value: 'SSG',
			updatedIds: [able, baker, unassigned]
		});

		expect(await valuesOf(ctx, [able, baker, unassigned])).toEqual([
			['SSG', '68X', 'Platoon medic', '2028-02-29'],
			['SSG', '68X', 'Platoon medic', '2028-02-29'],
			['SSG', '68X', 'Platoon medic', '2028-02-29']
		]);
		expect(await valuesOf(ctx, [archived, charlieMember])).toEqual([
			['SGT', '68W', 'Medic', '2027-01-01'],
			['SGT', '68W', 'Medic', '2027-01-01']
		]);
	});

	it('saves a rank typed in another case as the catalog code, and lists a repeated id once', async () => {
		const ctx = context('operate');

		await expect(setField(ctx, { personnelIds: [able, able], field: 'rank', value: ' ssg ' })).resolves.toEqual({
			field: 'rank',
			value: 'SSG',
			updatedIds: [able],
			refusedIds: [],
			unavailableIds: []
		});
		expect((await valuesOf(ctx, [able]))[0][0]).toBe('SSG');
	});

	it('rejects a rank that is unknown or retired without writing anything', async () => {
		const ctx = context('operate');

		for (const value of ['ZZZ', 'CPL']) {
			await expect(setField(ctx, { personnelIds: [able, baker], field: 'rank', value })).rejects.toMatchObject({
				status: 400
			});
		}
		expect(await valuesOf(ctx, [able, baker])).toEqual([
			['SGT', '68W', 'Medic', '2027-01-01'],
			['SGT', '68W', 'Medic', '2027-01-01']
		]);
	});

	it("updates a Group-scoped operator's own Groups and leaves People they cannot read untouched", async () => {
		const ctx = context('operate', groupCoverageForTest({ kind: 'groups', groupIds: [alpha, bravo] }));

		await expect(
			setField(ctx, { personnelIds: [able, baker, charlieMember, unassigned], field: 'mos', value: '68Y' })
		).resolves.toEqual({
			field: 'mos',
			value: '68Y',
			updatedIds: [able, baker],
			refusedIds: [],
			unavailableIds: [charlieMember, unassigned]
		});
		expect((await valuesOf(ctx, [able, baker, charlieMember, unassigned])).map(([, mos]) => mos)).toEqual([
			'68Y',
			'68Y',
			'68W',
			'68W'
		]);
	});

	it('refuses, rather than writes, a Person the reader may see but the actor cannot manage', async () => {
		const scoped = context('operate', groupCoverageForTest({ kind: 'groups', groupIds: [alpha, bravo] }));
		const readsEveryone = () => ({ ...scoped, personnel: scoped.organizationPersonnel });

		await expect(
			handleUseCaseRequest(
				_postConfig,
				scoped,
				{ personnelIds: [able, charlieMember, unassigned, archived, missing], field: 'clinicRole', value: 'Driver' },
				readsEveryone
			)
		).resolves.toEqual({
			field: 'clinicRole',
			value: 'Driver',
			updatedIds: [able],
			refusedIds: [charlieMember, unassigned],
			unavailableIds: [archived, missing]
		});
		expect((await valuesOf(scoped, [able, charlieMember, unassigned])).map(([, , role]) => role)).toEqual([
			'Driver',
			'Medic',
			'Medic'
		]);
	});

	it('refuses a Personnel viewer without writing', async () => {
		const viewer = context('view');

		await expect(setField(viewer, { personnelIds: [able], field: 'mos', value: '68X' })).rejects.toMatchObject({
			status: 403
		});
		expect((await valuesOf(viewer, [able]))[0][1]).toBe('68W');
	});

	it('rejects empty, oversized and malformed input without writing', async () => {
		const ctx = context('operate');
		for (const input of [
			{ personnelIds: [able], field: 'mos', value: '   ' },
			{ personnelIds: [able], field: 'clinicRole', value: '' },
			{ personnelIds: [able], field: 'rank', value: '' },
			{ personnelIds: [able], field: 'ets', value: '' },
			{ personnelIds: [able], field: 'ets', value: '2027-02-30' },
			{ personnelIds: [able], field: 'ets', value: 'next spring' },
			{ personnelIds: [able], field: 'mos', value: 'x'.repeat(101) },
			{ personnelIds: [able], field: 'deros', value: '2027-02-01' },
			{ personnelIds: [able], field: 'mos' },
			{ personnelIds: [], field: 'mos', value: '68X' },
			{ personnelIds: ['not-a-uuid'], field: 'mos', value: '68X' },
			{ personnelIds: Array.from({ length: 501 }, () => able), field: 'mos', value: '68X' }
		]) {
			await expect(setField(ctx, input)).rejects.toMatchObject({ status: 400 });
		}
		expect(await valuesOf(ctx, [able])).toEqual([['SGT', '68W', 'Medic', '2027-01-01']]);
	});
});
