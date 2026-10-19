import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { fail } from '$lib/errors';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { loadRequestPersonnelReadiness } from '$lib/server/adapters/personnelReadinessLoad';
import {
	createPersonnelArtifactDeliveryContext,
	createPersonnelLeaderNoteDeliveryContext,
	createRequestPersonnelDetailContext,
	createRequestPersonnelDetailLayoutContext,
	type createRequestPersonnelOverviewContext
} from '$lib/server/adapters/requestContexts.server';
import { _createPersonnelDetailLayoutLoad } from './+layout.server';
import { _createPersonnelOverviewPageLoad } from './+page.server';

const operateAuth = {
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

function detailTestContext(
	personnelId = 'person-1',
	auth: Parameters<typeof createTestAuthContext>[0] = {},
	groupId: string | null = null
) {
	const ctx = createTestContext({ auth: { ...operateAuth, ...auth } });
	ctx.rawStore.seed('personnel', [
		{ id: personnelId, organization_id: 'org-1', slug: 'rivera-monica', group_id: groupId, archived_at: null }
	]);
	return ctx;
}

type TestContext = ReturnType<typeof detailTestContext>;

function overviewContext(ctx: TestContext): ReturnType<typeof createRequestPersonnelOverviewContext> {
	return {
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
	};
}

function loadWithSelectedContexts(ctx: TestContext) {
	return vi.fn(async (_locals, _cookies, _orgId, config) => {
		if (config.context === createRequestPersonnelDetailContext)
			return config.fn({
				auth: ctx.auth,
				audit: ctx.audit,
				organizationPersonnel: ctx.organizationPersonnel,
				personnelSheets: ctx.personnelSheets,
				scope: ctx.scope
			});
		const selected = overviewContext(ctx);
		if (config.context === createRequestPersonnelDetailLayoutContext)
			return config.fn({
				auth: ctx.auth,
				audit: ctx.audit,
				artifactReads: ctx.artifactReads,
				calendar: selected.calendar
			});
		return config.fn(selected);
	});
}

function readiness(evaluation: () => Promise<unknown> = async () => null) {
	return vi.fn(async () => ({
		attention: Promise.resolve({ items: [] }),
		evaluation: evaluation()
	})) as unknown as typeof loadRequestPersonnelReadiness;
}

function overviewLoad(ctx: TestContext, loadReadiness = readiness()) {
	return _createPersonnelOverviewPageLoad({ loadWithContext: loadWithSelectedContexts(ctx), loadReadiness });
}

function detailEvent(overrides: Record<string, unknown> = {}) {
	return {
		params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
		locals: {} as App.Locals,
		cookies: { get: () => undefined },
		depends: vi.fn(),
		parent: () => {
			throw new Error('The detail page must not run ancestor loads');
		},
		...overrides
	} as never;
}

function settleOverview(overview: Record<string, Promise<unknown>>) {
	return Promise.allSettled(Object.values(overview));
}

describe('personnel Overview page server load', () => {
	it("shows the slug-resolved Person's latest active counseling held by the viewer's day", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-19T18:00:00Z'));
		const ctx = detailTestContext('person-9');
		const counseling = (id: string, personnelId: string, dateConducted: string, archivedAt: string | null = null) => ({
			id,
			organization_id: 'org-1',
			personnel_id: personnelId,
			date_conducted: dateConducted,
			title: id,
			status: 'uploaded',
			uploaded_by: 'SSG Alvarez',
			file_name: `${id}.pdf`,
			created_at: `${dateConducted}T12:00:00Z`,
			archived_at: archivedAt
		});
		ctx.store.seed('counseling_records', [
			counseling('september', 'person-9', '2026-09-01'),
			counseling('october', 'person-9', '2026-10-01'),
			counseling('archived', 'person-9', '2026-10-05', '2026-10-06T00:00:00Z'),
			counseling('scheduled', 'person-9', '2026-10-25'),
			counseling('someone-else', 'person-other', '2026-10-10')
		]);

		try {
			const result = await overviewLoad(ctx)(detailEvent());

			await expect(result.overview.lastCounseling).resolves.toMatchObject({ id: 'october', personnelId: 'person-9' });
			await expect(result.overview.latestNote).resolves.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("lists only the Person's open follow-ups", async () => {
		const ctx = detailTestContext('person-9');
		const followUp = (id: string, personnelId: string, status: string) => ({
			id,
			organization_id: 'org-1',
			personnel_id: personnelId,
			title: id,
			notes: '',
			status,
			created_by: null,
			created_at: '2026-10-01T10:00:00Z',
			updated_at: '2026-10-01T10:00:00Z',
			completed_at: status === 'completed' ? '2026-10-02T10:00:00Z' : null,
			completed_by: null,
			archived_at: status === 'archived' ? '2026-10-03T10:00:00Z' : null,
			archived_by: null
		});
		ctx.store.seed('personnel_follow_ups', [
			followUp('open', 'person-9', 'open'),
			followUp('done', 'person-9', 'completed'),
			followUp('archived', 'person-9', 'archived'),
			followUp('someone-else', 'person-other', 'open')
		]);

		const result = await overviewLoad(ctx)(detailEvent());

		const rows = await result.overview.openFollowUps;
		expect(rows.map((row) => [row.id, row.status])).toEqual([['open', 'open']]);
	});

	it('reads the next 14 days from the viewer day in the time zone cookie', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-05-15T02:00:00Z'));
		try {
			const ctx = detailTestContext();
			const cookies = { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) };

			const result = await overviewLoad(ctx)(detailEvent({ cookies }));

			expect(result.asOf).toBe('2026-05-14');
			await expect(result.overview.nextDays).resolves.toMatchObject({
				rangeStart: '2026-05-14',
				rangeEnd: '2026-05-27',
				availability: [],
				assignments: []
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('reaches the Person through the phone, email and emergency contact on their Data sheet', async () => {
		const ctx = detailTestContext();
		ctx.store.seed('personnel_extended_info', [
			{
				id: 'info-1',
				organization_id: 'org-1',
				personnel_id: 'person-1',
				personal_phone: '907-555-0102',
				personal_email: 'rivera@example.com',
				emergency_contact_name: 'Jamie Rivera',
				emergency_contact_relationship: 'Spouse',
				emergency_contact_phone: '907-555-0100'
			}
		]);

		const result = await overviewLoad(ctx)(detailEvent());

		await expect(result.overview.reach).resolves.toEqual({
			phone: '907-555-0102',
			email: 'rivera@example.com',
			emergency: { name: 'Jamie Rivera', relationship: 'Spouse', phone: '907-555-0100' }
		});
	});

	it('keeps a saved emergency phone even when the contact has no name', async () => {
		const ctx = detailTestContext();
		ctx.store.seed('personnel_extended_info', [
			{ id: 'info-1', organization_id: 'org-1', personnel_id: 'person-1', emergency_contact_phone: '907-555-0100' }
		]);

		const result = await overviewLoad(ctx)(detailEvent());

		await expect(result.overview.reach).resolves.toEqual({
			phone: '',
			email: '',
			emergency: { name: '', relationship: '', phone: '907-555-0100' }
		});
	});

	it('hides the Calendar and the rating chain from a viewer denied them', async () => {
		const ctx = detailTestContext('person-1', {
			capabilityMap: { ...operateAuth.capabilityMap, calendar: 'none' }
		});

		const result = await overviewLoad(
			ctx,
			readiness(async () => fail(403, 'Forbidden'))
		)(detailEvent());

		await expect(result.overview.nextDays).resolves.toBeNull();
		await expect(result.overview.evaluation).resolves.toBeNull();
	});

	it('fails only the section whose read failed', async () => {
		const ctx = detailTestContext();
		const read = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation(async (table, ...args) => {
			if (table === 'availability_entries') throw new Error('Calendar read failed');
			return read(table, ...args);
		});
		const providerDown = new Error('Rating scheme read failed');

		const result = await overviewLoad(
			ctx,
			readiness(async () => {
				throw providerDown;
			})
		)(detailEvent());
		const [nextDays, attention, evaluation, openFollowUps, reach, lastCounseling, latestNote] =
			await Promise.allSettled([
				result.overview.nextDays,
				result.overview.attention,
				result.overview.evaluation,
				result.overview.openFollowUps,
				result.overview.reach,
				result.overview.lastCounseling,
				result.overview.latestNote
			]);

		expect(nextDays).toMatchObject({ status: 'rejected', reason: { message: 'Calendar read failed' } });
		expect(evaluation).toEqual({ status: 'rejected', reason: providerDown });
		expect([attention, openFollowUps, reach, lastCounseling, latestNote].map((section) => section.status)).toEqual([
			'fulfilled',
			'fulfilled',
			'fulfilled',
			'fulfilled',
			'fulfilled'
		]);
	});

	it('resolves the Person by slug once for the detail layout and the Overview in one request', async () => {
		const ctx = detailTestContext('person-1', { scopeSet: { kind: 'groups', groupIds: ['group-1'] } }, 'group-1');
		const findBySlug = vi.spyOn(ctx.organizationPersonnel, 'findBySlug');
		const findById = vi.spyOn(ctx.organizationPersonnel, 'findById');
		const loadWithContext = loadWithSelectedContexts(ctx);
		const event = detailEvent();

		const [layout, page] = await Promise.all([
			_createPersonnelDetailLayoutLoad({ loadWithContext, loadReadinessBadge: async () => null })(event),
			_createPersonnelOverviewPageLoad({ loadWithContext, loadReadiness: readiness() })(event)
		]);
		await settleOverview(page.overview);

		expect(layout.personnelDetailHeader.person.id).toBe('person-1');
		expect(findBySlug.mock.calls).toEqual([['rivera-monica']]);
		expect(findById.mock.calls).toEqual([]);
	});

	it.each<[string, Parameters<typeof createTestAuthContext>[0], string, number]>([
		['an out-of-Group target', { scopeSet: { kind: 'groups', groupIds: ['other-group'] } }, 'rivera-monica', 403],
		['an unknown or foreign slug', {}, 'foreign-person', 404]
	])('denies the Overview for %s before any section read', async (_, auth, slug, status) => {
		const ctx = detailTestContext('person-1', auth);
		ctx.rawStore.seed('personnel', [{ id: 'foreign-1', organization_id: 'org-2', slug: 'foreign-person' }]);
		const findMany = vi.spyOn(ctx.store, 'findMany');

		await expect(
			overviewLoad(ctx)(detailEvent({ params: { orgId: 'org-1', personnelSlug: slug } }))
		).rejects.toMatchObject({ status });
		expect(findMany.mock.calls.map(([table]) => table)).toEqual([]);
	});
});
