import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { createTestAuthContext } from '$lib/server/adapters/inMemory';
import {
	createPersonnelArtifactDeliveryContext,
	createPersonnelLeaderNoteDeliveryContext
} from '$lib/server/adapters/requestContexts.server';
import { _createPeekContext, _getConfig } from './+server';

const OKAFOR = '00000000-0000-4000-8000-0000000000a1';
const BANKS = '00000000-0000-4000-8000-0000000000a2';
const LANE_FEATURES: FeatureKey[] = ['training', 'criticalTasks', 'evaluations', 'onboarding'];

const leaderAuth = {
	orgId: 'org-1',
	role: 'member',
	isPrivileged: false,
	canManageMembers: false,
	capabilityMap: {
		calendar: 'view',
		personnel: 'configure',
		training: 'view',
		criticalTasks: 'view',
		onboarding: 'view',
		ratingScheme: 'view'
	},
	scopeSet: { kind: 'organization' }
} satisfies Parameters<typeof createTestAuthContext>[0];

function testContext(auth: Parameters<typeof createTestAuthContext>[0] = {}) {
	const ctx = createTestContext({ auth: { ...leaderAuth, ...auth }, disabledFeatures: LANE_FEATURES });
	ctx.rawStore.seed('personnel', [
		{ id: OKAFOR, organization_id: 'org-1', slug: 'okafor-daniel', group_id: 'group-2', ets: '2026-12-03' },
		{ id: BANKS, organization_id: 'org-1', slug: 'banks-tamara', group_id: 'group-3' }
	]);
	return ctx;
}

type TestContext = ReturnType<typeof testContext>;

function peekContext(ctx: TestContext): ReturnType<typeof _createPeekContext> {
	return {
		detail: {
			auth: ctx.auth,
			audit: ctx.audit,
			organizationPersonnel: ctx.organizationPersonnel,
			personnelSheets: ctx.personnelSheets,
			scope: ctx.scope
		},
		overview: {
			calendar: {
				auth: ctx.auth,
				audit: ctx.audit,
				calendarAvailability: ctx.calendarAvailability,
				personnelCalendarRoster: ctx.personnelCalendarRoster,
				calendarAssignments: ctx.calendarAssignments,
				calendarCatalogs: ctx.calendarCatalogs
			},
			extendedInfo: {
				auth: ctx.auth,
				audit: ctx.audit,
				personnelSheets: ctx.personnelSheets,
				personnel: ctx.personnel,
				scope: ctx.scope,
				contributorLabels: ctx.contributorLabels
			},
			artifacts: createPersonnelArtifactDeliveryContext(ctx),
			leaderNotes: createPersonnelLeaderNoteDeliveryContext(ctx)
		},
		readiness: {
			detail: { auth: ctx.auth, audit: ctx.audit },
			findPersonNames: async () => new Map(),
			loadLossWarningWindowDays: async () => 90,
			disabledFeatures: LANE_FEATURES
		}
	} as unknown as ReturnType<typeof _createPeekContext>;
}

function read(ctx: TestContext, section: string, personnelId = OKAFOR, asOf = '2026-10-23') {
	return handleUseCaseRequest(_getConfig, ctx, { personnelId, section, asOf }, () => peekContext(ctx));
}

function event(section: string | null, id = OKAFOR) {
	const query = section === null ? '' : `?section=${section}`;
	return {
		params: { orgId: 'org-1', id },
		url: new URL(`http://localhost/org/org-1/api/personnel/${id}/peek${query}`),
		cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) }
	} as unknown as RequestEvent;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('/api/personnel/[id]/peek', () => {
	it('reads with sensitive-record permission, changes nothing and is never stored', () => {
		expect(_getConfig).toMatchObject({
			policyAction: { id: 'personnel.readSensitiveRecords' },
			policyResource: { kind: 'unscoped' }
		});
		expect('mutation' in _getConfig).toBe(false);
		expect(_getConfig.formatOutput({ state: 'hidden' }).headers.get('Cache-Control')).toBe('private, no-store');
	});

	it("reads one section for the Person on the viewer's day", () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-24T02:00:00Z'));
		expect(_getConfig.parseInput(event('next7'))).toEqual({
			personnelId: OKAFOR,
			section: 'next7',
			asOf: '2026-10-23'
		});
		expect(() => _getConfig.parseInput(event('roster'))).toThrow(expect.objectContaining({ status: 400 }));
		expect(() => _getConfig.parseInput(event(null))).toThrow(expect.objectContaining({ status: 400 }));
		expect(() => _getConfig.parseInput(event('note', 'okafor'))).toThrow(expect.objectContaining({ status: 404 }));
	});

	it("returns the phone on the Person's Data sheet", async () => {
		const ctx = testContext();
		ctx.store.seed('personnel_extended_info', [
			{ id: 'info-1', organization_id: 'org-1', personnel_id: OKAFOR, personal_phone: '(910) 555-0148' }
		]);

		await expect(read(ctx, 'identity')).resolves.toEqual({ state: 'ready', value: { phone: '(910) 555-0148' } });
		await expect(read(ctx, 'identity', BANKS)).resolves.toEqual({ state: 'ready', value: { phone: null } });
	});

	it('reads the Calendar for seven days from the viewer day', async () => {
		const ctx = testContext();

		await expect(read(ctx, 'next7')).resolves.toMatchObject({
			state: 'ready',
			value: { rangeStart: '2026-10-23', rangeEnd: '2026-10-29', availability: [], assignments: [] }
		});
	});

	it('ranks the attention items the record Overview shows', async () => {
		const ctx = testContext();

		const result = await read(ctx, 'attention');

		expect(result).toMatchObject({ state: 'ready', value: { failed: [] } });
		const items = result.state === 'ready' ? (result.value as { items: { kind: string; title: string }[] }).items : [];
		expect(items.map((item) => [item.kind, item.title])).toEqual([['loss', 'ETS 3 Dec 2026']]);
	});

	it("lists the Person's open follow-ups and latest note", async () => {
		const ctx = testContext();
		const followUp = (id: string, personnelId: string, status: string) => ({
			id,
			organization_id: 'org-1',
			personnel_id: personnelId,
			title: id,
			notes: '',
			status,
			created_at: '2026-10-01T10:00:00Z',
			updated_at: '2026-10-01T10:00:00Z'
		});
		ctx.store.seed('personnel_follow_ups', [
			followUp('turn-in-ta-50', OKAFOR, 'open'),
			followUp('done', OKAFOR, 'completed'),
			followUp('banks-open', BANKS, 'open')
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'older',
				organization_id: 'org-1',
				personnel_id: OKAFOR,
				text: 'Older',
				created_at: '2026-09-01T10:00:00Z'
			},
			{
				id: 'newer',
				organization_id: 'org-1',
				personnel_id: OKAFOR,
				text: 'Wants BLC',
				created_at: '2026-09-30T10:00:00Z'
			}
		]);

		const followUps = await read(ctx, 'followUps');
		const note = await read(ctx, 'note');

		expect(followUps.state === 'ready' && (followUps.value as { id: string }[]).map((row) => row.id)).toEqual([
			'turn-in-ta-50'
		]);
		expect(note).toMatchObject({ state: 'ready', value: { id: 'newer', text: 'Wants BLC' } });
	});

	it('hides the Calendar from a viewer denied availability and keeps the other sections', async () => {
		const ctx = testContext({ capabilityMap: { ...leaderAuth.capabilityMap, calendar: 'none' } });

		await expect(read(ctx, 'next7')).resolves.toEqual({ state: 'hidden' });
		await expect(read(ctx, 'note')).resolves.toEqual({ state: 'ready', value: null });
	});

	it('serves a Group-scoped leader their Group and refuses another Group before reading it', async () => {
		const ctx = testContext({ scopeSet: { kind: 'groups', groupIds: ['group-2'] } });
		const findMany = vi.spyOn(ctx.store, 'findMany');

		await expect(read(ctx, 'note')).resolves.toEqual({ state: 'ready', value: null });
		findMany.mockClear();
		await expect(read(ctx, 'followUps', BANKS)).rejects.toMatchObject({ status: 403 });
		expect(findMany.mock.calls.map(([table]) => table)).toEqual([]);
	});

	it('refuses a viewer who cannot read sensitive records, and an archived or unknown Person', async () => {
		const viewer = testContext({ capabilityMap: { ...leaderAuth.capabilityMap, personnel: 'view' } });
		await expect(read(viewer, 'note')).rejects.toMatchObject({ status: 403 });

		const ctx = testContext();
		ctx.rawStore.seed('personnel', [
			{ id: '00000000-0000-4000-8000-0000000000a3', organization_id: 'org-1', archived_at: '2026-10-01T00:00:00Z' }
		]);
		await expect(read(ctx, 'note', '00000000-0000-4000-8000-0000000000a3')).rejects.toMatchObject({ status: 404 });
		await expect(read(ctx, 'note', '00000000-0000-4000-8000-0000000000ff')).rejects.toMatchObject({ status: 404 });
	});
});
