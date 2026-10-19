import { withTrainingPersistence } from '$features/training/server/trainingPersistence.test-support.server';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createTestContext as createCriticalTasksTestContext } from '$features/critical-tasks/server/criticalTasksPersistence.test-support.server';
import { withCalendarPersistence } from '$features/calendar/calendarPersistence.test-support.server';
import { createInMemoryRatingSchemePersistence } from '$features/rating-scheme/server/inMemoryRatingSchemePersistence.server';

function createTestContext(options?: Parameters<typeof createCriticalTasksTestContext>[0]) {
	return createCriticalTasksTestContext(withTrainingPersistence(withCalendarPersistence(options)));
}
import {
	createPersonnelArtifactDeliveryContext,
	createPersonnelLeaderNoteDeliveryContext,
	createRequestPersonnelDetailContext,
	createRequestPersonnelDetailLayoutContext,
	type createRequestPersonnelDetailStreamsContext
} from '$lib/server/adapters/requestContexts.server';
import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelDetailLayoutLoad } from './+layout.server';
import { _createPersonnelDetailPageLoad } from './+page.server';

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
	const ctx = createTestContext({
		ratingSchemeFactory: createInMemoryRatingSchemePersistence,
		auth: { ...operateAuth, ...auth }
	});
	ctx.rawStore.seed('personnel', [
		{
			id: personnelId,
			organization_id: 'org-1',
			slug: 'rivera-monica',
			group_id: groupId,
			ets: null,
			archived_at: null
		}
	]);
	return ctx;
}

function selectedContexts(
	ctx: ReturnType<typeof createTestContext>
): ReturnType<typeof createRequestPersonnelDetailStreamsContext> {
	return {
		calendar: {
			auth: ctx.auth,
			audit: ctx.audit,
			calendarAvailability: ctx.calendarAvailability,
			calendarCatalogs: ctx.calendarCatalogs,
			personnelCalendarRoster: ctx.personnelCalendarRoster
		},
		organizationSettings: ctx.organizationSettings,
		trainingCatalog: ctx.trainingCatalog,
		trainingCompletions: ctx.trainingCompletions,
		criticalTaskLibrary: ctx.criticalTaskLibrary,
		criticalTaskCompletions: ctx.criticalTaskCompletions,
		ratingScheme: ctx.ratingScheme,
		detail: { auth: ctx.auth, audit: ctx.audit },
		extendedInfo: {
			auth: ctx.auth,
			audit: ctx.audit,
			personnelSheets: ctx.personnelSheets,
			personnel: ctx.personnel,
			scope: ctx.scope,
			contributorLabels: ctx.contributorLabels
		},
		artifacts: createPersonnelArtifactDeliveryContext(ctx),
		leaderNotes: createPersonnelLeaderNoteDeliveryContext(ctx),
		loadLossWarningWindowDays: () => ctx.organizationSettings.findLossWarningWindowDays(ctx.auth.orgId)
	};
}

const noCookies = { get: () => undefined } as never;

function loadWithSelectedContexts(ctx: ReturnType<typeof createTestContext>) {
	return vi.fn(async (_locals, _cookies, _orgId, config) => {
		if (config.context === createRequestPersonnelDetailContext)
			return config.fn({
				auth: ctx.auth,
				audit: ctx.audit,
				organizationPersonnel: ctx.organizationPersonnel,
				personnelSheets: ctx.personnelSheets,
				scope: ctx.scope
			});
		const selected = selectedContexts(ctx);
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

function detailEvent(overrides: Record<string, unknown> = {}) {
	return {
		params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
		locals: {} as App.Locals,
		cookies: noCookies,
		depends: vi.fn(),
		parent: () => {
			throw new Error('The detail page must not run ancestor loads');
		},
		...overrides
	} as never;
}

describe('personnel detail page server load', () => {
	it.each([0, null, 'failure', 'no-ets'] as const)(
		'uses the owned warning scalar lazily and reports a failed read as unavailable (%s)',
		async (value) => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
			try {
				const ctx = createTestContext({
					ratingSchemeFactory: createInMemoryRatingSchemePersistence,
					auth: { orgId: 'org-1' }
				});
				ctx.store.seed('personnel', [
					{
						id: 'person-1',
						organization_id: 'org-1',
						slug: 'person-1',
						group_id: null,
						ets: value === 'no-ets' ? null : '2026-05-15',
						archived_at: null
					}
				]);
				const window = vi.fn(async () => {
					if (value === 'failure') throw new Error('Optional settings unavailable');
					return value === 'no-ets' ? 30 : value;
				});
				ctx.organizationSettings.findLossWarningWindowDays = window;
				const load = _createPersonnelDetailPageLoad({
					loadWithContext: loadWithSelectedContexts(ctx)
				});
				const result = await load({
					params: { orgId: 'org-1', personnelSlug: 'person-1' },
					locals: {},
					cookies: noCookies,
					depends: vi.fn()
				} as never);
				const lanes = result.personnelDetail.readinessLanes;
				const settled = Promise.allSettled(Object.values(lanes));
				const expected = {
					0: { value: 'No loss risk', tone: 'good' },
					null: { value: 'Action needed', tone: 'watch' },
					failure: { value: 'Unavailable', tone: 'neutral' },
					'no-ets': { value: 'Missing ETS', tone: 'bad' }
				}[String(value)];
				await expect(lanes.lossTracking).resolves.toMatchObject(expected!);
				if (value === 'no-ets') expect(window).not.toHaveBeenCalled();
				await settled;
			} finally {
				vi.useRealTimers();
			}
		}
	);

	it('evaluates readiness on the viewer day from the time zone cookie', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-05-15T02:00:00Z'));
		try {
			const ctx = createTestContext({ ratingSchemeFactory: createInMemoryRatingSchemePersistence, auth: operateAuth });
			ctx.rawStore.seed('personnel', [
				{
					id: 'person-1',
					organization_id: 'org-1',
					slug: 'person-1',
					group_id: null,
					ets: '2026-05-15',
					archived_at: null
				}
			]);
			ctx.organizationSettings.findLossWarningWindowDays = async () => 0;
			const load = _createPersonnelDetailPageLoad({ loadWithContext: loadWithSelectedContexts(ctx) });
			const lossTrackingFor = async (timeZone: string | undefined) => {
				const result = await load({
					params: { orgId: 'org-1', personnelSlug: 'person-1' },
					locals: {} as App.Locals,
					cookies: { get: (name: string) => (name === 't2t_tz' ? timeZone : undefined) } as never,
					depends: vi.fn()
				} as never);
				const lanes = result.personnelDetail.readinessLanes;
				await Promise.allSettled(Object.values(lanes));
				return lanes.lossTracking;
			};

			await expect(lossTrackingFor('America/New_York')).resolves.toMatchObject({
				value: 'No loss risk',
				detail: 'ETS May 15, 2026 is 1 days away.'
			});
			await expect(lossTrackingFor(undefined)).resolves.toMatchObject({
				value: 'Action needed',
				detail: 'ETS May 15, 2026 is 0 days away.'
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('denies Training readiness before reading its catalog when Training access is absent', async () => {
		const ctx = detailTestContext('person-1', {
			capabilityMap: { ...operateAuth.capabilityMap, training: 'none' }
		});
		vi.spyOn(ctx.scope, 'requireGroupAccess');
		const findMany = vi.spyOn(ctx.store, 'findMany');
		const loadWithContext = loadWithSelectedContexts(ctx);
		const load = _createPersonnelDetailPageLoad({ loadWithContext });
		const result = await load(detailEvent());

		const readinessLanes = result.personnelDetail.readinessLanes;
		const [trainingOutcome] = await Promise.allSettled([readinessLanes.training, ...Object.values(readinessLanes)]);
		expect(trainingOutcome).toMatchObject({ status: 'rejected', reason: { status: 403 } });
		expect(ctx.scope.requireGroupAccess).toHaveBeenCalledWith('person-1');
		const trainingReads = findMany.mock.calls.filter(([table]) =>
			['training_types', 'personnel_trainings'].includes(table)
		);
		expect(trainingReads).toEqual([]);
	});

	it('loads retained detail streams with Duty storage unavailable for the layout-resolved personnel id', async () => {
		const ctx = detailTestContext();
		const read = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findOne');
		vi.spyOn(ctx.store, 'findMany').mockImplementation(async (table, ...args) => {
			if (table.startsWith('duty_')) throw new Error('Duty storage is unavailable');
			return read(table, ...args);
		});
		const loadWithContext = loadWithSelectedContexts(ctx);
		const load = _createPersonnelDetailPageLoad({ loadWithContext });
		const depends = vi.fn();

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: noCookies,
			depends
		} as never);

		await result.personnelDetail.extendedInfo;
		await expect(Promise.all(Object.values(result.personnelDetail.readinessLanes))).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ label: 'Availability', value: 'Present', tone: 'good' })])
		);
		expect(result.personnelDetail.readinessLanes).not.toHaveProperty('dutyRoster');
		expect(depends).toHaveBeenCalledWith('app:personnel-detail');
		expect(ctx.store.findOne).not.toHaveBeenCalledWith('personnel', 'org-1', { slug: 'rivera-monica' }, 'id');
		expect(ctx.store.findMany).toHaveBeenCalledWith('personnel_extended_info', 'org-1', {
			personnel_id: 'person-1'
		});
	});

	it('streams expanded Soldier Data Sheet fields for the resolved Personnel Slug', async () => {
		const ctx = detailTestContext();
		ctx.store.seed('personnel_extended_info', [
			{
				id: 'info-1',
				organization_id: 'org-1',
				personnel_id: 'person-1',
				blood_type: 'O+',
				basd: '2020-01-15',
				date_of_rank: '2024-06-01',
				marital_status: 'Married',
				number_of_dependents: 2,
				children: [{ name: 'Avery', age: 7 }],
				civilian_education: 'BSN',
				military_education: ['BLC'],
				emergency_contact_name: 'Jamie Rivera',
				emergency_contact_relationship: 'Spouse',
				emergency_contact_phone: '907-555-0100',
				spouse_name: 'Jamie Rivera',
				spouse_phone: '907-555-0101',
				vehicle_make_model: 'Toyota Tacoma',
				vehicle_plate: 'JBER482',
				vehicle_color: 'Gray',
				personal_email: 'rivera@example.com',
				personal_phone: '907-555-0102',
				address_street: '1128 Arctic Valley Rd',
				address_city: 'Anchorage',
				address_state: 'AK',
				address_zip: '99505',
				leader_notes: 'Strong performer'
			}
		]);
		const loadWithContext = loadWithSelectedContexts(ctx);
		const load = _createPersonnelDetailPageLoad({ loadWithContext });

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: noCookies,
			depends: vi.fn()
		} as never);

		await expect(result.personnelDetail.extendedInfo).resolves.toMatchObject({
			bloodType: 'O+',
			basd: '2020-01-15',
			dateOfRank: '2024-06-01',
			maritalStatus: 'Married',
			numberOfDependents: 2,
			children: [{ name: 'Avery', age: 7 }],
			civilianEducation: 'BSN',
			militaryEducation: ['BLC']
		});
	});

	it('uses the slug-resolved personnel id for all dashboard streams without running ancestor loads', async () => {
		const ctx = detailTestContext('person-9');
		vi.spyOn(ctx.store, 'findMany');
		const load = _createPersonnelDetailPageLoad({ loadWithContext: loadWithSelectedContexts(ctx) });

		const result = await load(detailEvent());

		await result.personnelDetail.counselingRecords;
		expect(ctx.store.findMany).toHaveBeenCalledWith(
			'counseling_records',
			'org-1',
			{ personnel_id: 'person-9' },
			expect.any(Object)
		);
	});

	it('resolves the Person by slug once for the detail layout, the page and all five lanes in one request', async () => {
		const ctx = detailTestContext('person-1', { scopeSet: { kind: 'groups', groupIds: ['group-1'] } }, 'group-1');
		const findBySlug = vi.spyOn(ctx.organizationPersonnel, 'findBySlug');
		const findById = vi.spyOn(ctx.organizationPersonnel, 'findById');
		const loadWithContext = loadWithSelectedContexts(ctx);
		const event = detailEvent();

		const [layout, page] = await Promise.all([
			_createPersonnelDetailLayoutLoad({ loadWithContext })(event),
			_createPersonnelDetailPageLoad({ loadWithContext })(event)
		]);
		const lanes = page.personnelDetail.readinessLanes;
		const settled = await Promise.all(Object.values(lanes));

		expect(layout.personnelDetailHeader.person.id).toBe('person-1');
		expect(settled.map((lane) => lane.value)).toEqual([
			'Present',
			'Current',
			'No tasks',
			'Not assigned',
			'Missing ETS'
		]);
		expect(findBySlug.mock.calls).toEqual([['rivera-monica']]);
		expect(findById.mock.calls).toEqual([]);
	});

	it('computes Loss Tracking from the stored Person on the request after its ETS is cleared', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
		try {
			const ctx = detailTestContext();
			await ctx.store.update('personnel', 'org-1', 'person-1', { ets: '2027-05-02' });
			ctx.rawStore.seed('organizations', [{ id: 'org-1', loss_warning_window_days: 90 }]);
			const load = _createPersonnelDetailPageLoad({ loadWithContext: loadWithSelectedContexts(ctx) });
			const lossTrackingOnNextRequest = async () => {
				const lanes = (await load(detailEvent())).personnelDetail.readinessLanes;
				await Promise.allSettled(Object.values(lanes));
				return lanes.lossTracking;
			};

			await expect(lossTrackingOnNextRequest()).resolves.toMatchObject({ value: 'No loss risk', tone: 'good' });
			await ctx.store.update('personnel', 'org-1', 'person-1', { ets: null });
			await expect(lossTrackingOnNextRequest()).resolves.toMatchObject({ value: 'Missing ETS', tone: 'bad' });
		} finally {
			vi.useRealTimers();
		}
	});

	it.each<[string, Parameters<typeof createTestAuthContext>[0], string, number]>([
		['an out-of-Group target', { scopeSet: { kind: 'groups', groupIds: ['other-group'] } }, 'rivera-monica', 403],
		['an unknown or foreign slug', {}, 'foreign-person', 404]
	])('denies the page and every lane for %s before any lane read', async (_, auth, slug, status) => {
		const ctx = detailTestContext('person-1', auth);
		ctx.rawStore.seed('personnel', [{ id: 'foreign-1', organization_id: 'org-2', slug: 'foreign-person' }]);
		const findMany = vi.spyOn(ctx.store, 'findMany');
		const load = _createPersonnelDetailPageLoad({ loadWithContext: loadWithSelectedContexts(ctx) });

		await expect(load(detailEvent({ params: { orgId: 'org-1', personnelSlug: slug } }))).rejects.toMatchObject({
			status
		});
		expect(findMany.mock.calls.map(([table]) => table)).toEqual([]);
	});

	it('preserves independently settled lanes when the request-bound Calendar read fails', async () => {
		const failure = new Error('Calendar read failed');
		const ctx = detailTestContext();
		const read = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation(async (table, ...args) => {
			if (table === 'availability_entries') throw failure;
			return read(table, ...args);
		});
		const load = _createPersonnelDetailPageLoad({
			loadWithContext: loadWithSelectedContexts(ctx)
		});
		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: noCookies,
			depends: vi.fn()
		} as never);
		const lanes = result.personnelDetail.readinessLanes;
		const [availability, training, criticalTasks, ratingScheme, lossTracking] = await Promise.allSettled([
			lanes.availability,
			lanes.training,
			lanes.criticalTasks,
			lanes.ratingScheme,
			lanes.lossTracking
		]);
		expect(availability).toEqual({ status: 'rejected', reason: failure });
		expect(training).toMatchObject({ status: 'fulfilled', value: { value: 'Current' } });
		expect(criticalTasks).toMatchObject({ status: 'fulfilled', value: { value: 'No tasks' } });
		expect(ratingScheme).toMatchObject({ status: 'fulfilled', value: { value: 'Not assigned' } });
		expect(lossTracking).toMatchObject({ status: 'fulfilled', value: { value: 'Missing ETS' } });
	});
});
