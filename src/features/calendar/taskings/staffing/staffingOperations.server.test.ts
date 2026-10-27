import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '$lib/audit/contracts';
import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
import type { Personnel } from '$features/personnel/contracts';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { Tasking, TaskingResponsibility } from '../taskingModel';
import type { StaffingSave, TaskingStaffing } from './staffingModel';
import { loadStaffingPicker, saveTaskingPeople, type CalendarStaffingPorts } from './staffingOperations.server';
import type { CalendarStaffingPersistence } from './staffingPersistence.server';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TASKING = '00000000-0000-4000-8000-000000000101';
const ALPHA = '00000000-0000-4000-8000-000000000201';
const BRAVO = '00000000-0000-4000-8000-000000000202';
const ALICE = '00000000-0000-4000-8000-000000000501';
const BRUNO = '00000000-0000-4000-8000-000000000502';
const UNGROUPED = '00000000-0000-4000-8000-000000000503';

const person = (id: string, groupId: string | null): Personnel =>
	({ id, rank: 'SPC', firstName: 'Pat', lastName: id.slice(-3), groupId, archivedAt: null }) as Personnel;

function tasking(responsibility: TaskingResponsibility, withDates = true): Tasking {
	return {
		id: TASKING,
		title: 'Provide four trauma-lane medics',
		event: null,
		responsibility,
		suspenseOn: '2030-10-23',
		execution: withDates ? { startsOn: '2030-10-19', endsOn: '2030-10-23', reportTime: null } : null,
		requirement: { count: 4, qualifications: null },
		instructions: null,
		status: { kind: 'open' },
		readiness: { equipment: null, checklist: null }
	};
}

/** Holds the selection and its revision the way the save function does. */
function memoryStaffing(advisories: () => Promise<Record<string, never>> = async () => ({})) {
	let picked: string[] = [];
	let revision = 0;
	const saves: StaffingSave[] = [];
	const staffing = (): TaskingStaffing => ({
		revision,
		picked: picked.length,
		needsReview: 0,
		outsideScope: 0,
		picks: picked.map((personnelId) => ({
			personnelId,
			rank: 'SPC',
			firstName: 'Pat',
			lastName: personnelId.slice(-3),
			groupId: ALPHA,
			mos: '68W',
			clinicRole: '',
			archived: false,
			selectedAt: '2030-10-01T00:00:00Z',
			reviewSince: null
		}))
	});
	const port: CalendarStaffingPersistence = {
		findStaffing: async () => staffing(),
		countStaffing: async () => ({}),
		listAdvisories: advisories,
		async saveStaffing(_id, save) {
			saves.push(save);
			if ([...save.personnelIds].sort().join() === [...picked].sort().join()) return { outcome: 'unchanged', revision };
			if (save.expectedRevision !== revision) return { outcome: 'conflict', revision };
			picked = save.personnelIds;
			revision += 1;
			return { outcome: 'saved', revision };
		}
	};
	return { port, saves };
}

function slowAudit() {
	const entries: AuditEvent[] = [];
	return {
		entries,
		log: (entry: AuditEvent) =>
			new Promise<void>((resolve) =>
				setTimeout(() => {
					entries.push(entry);
					resolve();
				}, 0)
			)
	};
}

function member(
	calendar: CapabilityLevel,
	work: Tasking,
	options: { scopeSet?: ScopeSet; advisories?: () => Promise<Record<string, never>> } = {}
) {
	const scopeSet = options.scopeSet ?? { kind: 'organization' };
	const staffing = memoryStaffing(options.advisories);
	const audit = slowAudit();
	let advisoryReads = 0;
	const ctx: CalendarStaffingPorts = {
		auth: createTestAuthContext({
			userId: ACTOR,
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar,
				personnel: 'view',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet
		}),
		audit,
		calendarTaskings: { findTasking: async (id) => (id === work.id ? work : null) },
		calendarStaffing: {
			...staffing.port,
			listAdvisories: (id) => {
				advisoryReads += 1;
				return staffing.port.listAdvisories(id);
			}
		},
		personnelCalendarRoster: {
			listActive: async () =>
				scopeSet.kind === 'organization'
					? [person(ALICE, ALPHA), person(BRUNO, BRAVO), person(UNGROUPED, null)]
					: [person(ALICE, ALPHA)]
		}
	};
	return { ctx, saves: staffing.saves, audit, advisoryReads: () => advisoryReads };
}

const alpha: { scopeSet: ScopeSet } = { scopeSet: { kind: 'groups', groupIds: [ALPHA] } };
const save = (personnelIds: string[], expectedRevision: number) => ({
	personnelIds,
	keep: [],
	removeOutsideScope: false,
	expectedRevision
});

describe('Tasking staffing operations', () => {
	it('offers a Group Tasking only its Group’s roster', async () => {
		const { ctx } = member('operate', tasking({ kind: 'group', groupId: ALPHA }));

		const picker = await loadStaffingPicker(ctx, TASKING);

		expect(picker.candidates.map((candidate) => candidate.personnelId)).toEqual([ALICE]);
	});

	it('offers Organization-level work the whole active roster, ungrouped people included', async () => {
		const { ctx } = member('operate', tasking({ kind: 'organization' }));

		const picker = await loadStaffingPicker(ctx, TASKING);

		expect(picker.candidates.map((candidate) => candidate.personnelId)).toEqual([ALICE, BRUNO, UNGROUPED]);
	});

	it.each([
		['another Group’s', { kind: 'group', groupId: BRAVO }],
		['Organization-level', { kind: 'organization' }]
	] as const)('refuses an Alpha operator staffing %s work', async (_what, responsibility) => {
		const { ctx, saves, audit } = member('operate', tasking(responsibility), alpha);

		await expect(loadStaffingPicker(ctx, TASKING)).rejects.toMatchObject({ status: 403 });
		await expect(saveTaskingPeople(ctx, TASKING, save([ALICE], 0))).rejects.toMatchObject({ status: 403 });
		expect(saves).toEqual([]);
		expect(audit.entries).toEqual([]);
	});

	it('keeps viewers from staffing', async () => {
		const { ctx, saves } = member('view', tasking({ kind: 'group', groupId: ALPHA }));

		await expect(loadStaffingPicker(ctx, TASKING)).rejects.toMatchObject({ status: 403 });
		await expect(saveTaskingPeople(ctx, TASKING, save([ALICE], 0))).rejects.toMatchObject({ status: 403 });
		expect(saves).toEqual([]);
	});

	it('still offers the roster when the advisory read fails, marked as failed rather than clear', async () => {
		const { ctx } = member('operate', tasking({ kind: 'group', groupId: ALPHA }), {
			advisories: () => Promise.reject(new Error('timeout'))
		});

		const picker = await loadStaffingPicker(ctx, TASKING);

		expect(picker.advisories).toEqual({ kind: 'failed' });
		expect(picker.candidates).toHaveLength(1);
	});

	it('reports missing execution dates instead of reading advisories', async () => {
		const { ctx, advisoryReads } = member('operate', tasking({ kind: 'group', groupId: ALPHA }, false));

		expect((await loadStaffingPicker(ctx, TASKING)).advisories).toEqual({ kind: 'no_execution' });
		expect(advisoryReads()).toBe(0);
	});

	it('audits a saved selection once; a retry and a stale save write nothing', async () => {
		const { ctx, audit } = member('operate', tasking({ kind: 'group', groupId: ALPHA }));

		const first = await saveTaskingPeople(ctx, TASKING, save([ALICE], 0));
		const retry = await saveTaskingPeople(ctx, TASKING, save([ALICE], 0));
		const stale = await saveTaskingPeople(ctx, TASKING, save([], 0));

		expect([first.outcome, retry.outcome, stale.outcome]).toEqual(['saved', 'unchanged', 'conflict']);
		expect(stale.staffing.picks.map((pick) => pick.personnelId)).toEqual([ALICE]);
		expect(audit.entries.map((entry) => entry.action)).toEqual(['calendar_tasking.staffed']);
	});

	it('refuses keeping someone the selection drops before anything is saved', async () => {
		const { ctx, saves } = member('operate', tasking({ kind: 'group', groupId: ALPHA }));

		await expect(saveTaskingPeople(ctx, TASKING, { ...save([ALICE], 0), keep: [BRUNO] })).rejects.toMatchObject({
			status: 400
		});
		expect(saves).toEqual([]);
	});
});
