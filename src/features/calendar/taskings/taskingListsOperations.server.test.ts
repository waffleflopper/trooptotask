import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '$lib/audit/contracts';
import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { ChecklistItem, EquipmentRequirement } from './taskingListsModel';
import {
	addChecklistItem,
	addEquipment,
	loadTaskingLists,
	removeEquipment,
	reorderTaskingList,
	updateChecklistItem,
	updateEquipment,
	type CalendarTaskingListsPorts
} from './taskingListsOperations.server';
import type { CalendarTaskingListsPersistence } from './taskingListsPersistence.server';
import type { Tasking, TaskingStatus } from './taskingModel';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TASKING = '00000000-0000-4000-8000-000000000101';
const ALPHA = '00000000-0000-4000-8000-000000000201';
const BRAVO = '00000000-0000-4000-8000-000000000202';
const LITTERS = '00000000-0000-4000-8000-000000000501';
const RADIOS = '00000000-0000-4000-8000-000000000502';
const NOT_READY = { equipment: null, checklist: null };

function tasking(groupId: string, status: TaskingStatus = { kind: 'in_progress' }): Tasking {
	return {
		id: TASKING,
		title: 'Provide four trauma-lane medics',
		event: null,
		responsibility: { kind: 'group', groupId },
		suspenseOn: '2026-10-30',
		execution: null,
		requirement: null,
		instructions: null,
		status,
		readiness: NOT_READY
	};
}

function memoryLists() {
	const equipment: EquipmentRequirement[] = [];
	const checklist: ChecklistItem[] = [];
	const port: CalendarTaskingListsPersistence = {
		list: async () => ({ equipment: [...equipment], checklist: [...checklist] }),
		async addEquipment(_tasking, id, draft) {
			const existing = equipment.find((item) => item.id === id);
			if (existing) return { item: existing, created: false };
			const item = { id, ...draft };
			equipment.push(item);
			return { item, created: true };
		},
		async updateEquipment(_tasking, id, change) {
			const index = equipment.findIndex((item) => item.id === id);
			if (index < 0) return null;
			equipment[index] = { ...equipment[index], ...change };
			return equipment[index];
		},
		async removeEquipment(_tasking, id) {
			const index = equipment.findIndex((item) => item.id === id);
			return index < 0 ? null : equipment.splice(index, 1)[0];
		},
		async addChecklistItem(_tasking, id, label) {
			const existing = checklist.find((item) => item.id === id);
			if (existing) return { item: existing, created: false };
			const item = { id, label, done: false, doneAt: null, doneBy: null };
			checklist.push(item);
			return { item, created: true };
		},
		async updateChecklistItem(_tasking, id, change) {
			const index = checklist.findIndex((item) => item.id === id);
			if (index < 0) return null;
			checklist[index] = { ...checklist[index], ...change };
			return checklist[index];
		},
		removeChecklistItem: async () => null,
		async reorder(_tasking, list, ids) {
			const rows: { id: string }[] = list === 'equipment' ? equipment : checklist;
			rows.sort((a, b) => (ids.indexOf(a.id) + 1 || 99) - (ids.indexOf(b.id) + 1 || 99));
		}
	};
	return { port, equipment, checklist };
}

/** The audit write lands a tick after it is called, so only an awaited write is visible when the operation returns. */
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
	scopeSet: ScopeSet = { kind: 'organization' },
	stored: Tasking | null = tasking(ALPHA)
) {
	const lists = memoryLists();
	const audit = slowAudit();
	const ctx: CalendarTaskingListsPorts = {
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
		calendarStaffing: { countStaffing: async () => ({}) },
		calendarTaskings: {
			findTasking: async () => stored,
			listTaskings: async () => [],
			listEventTaskings: async () => [],
			listEventTaskingSummaries: async () => [],
			listActivity: async () => [],
			findEventTitles: async () => ({}),
			createTasking: async () => {
				throw new Error('unused');
			},
			updateTasking: async () => null,
			transitionTasking: async () => {
				throw new Error('unused');
			}
		},
		taskingLists: lists.port,
		calendarEvents: { listEvents: async () => [] },
		groups: { listCatalog: async () => [] },
		memberLabels: async () => ({})
	};
	return { ctx, audit, ...lists };
}

const littersDraft = { name: 'Litters', quantity: 4, securedQuantity: 0 };
const alphaOperator = (stored?: Tasking | null) => member('operate', { kind: 'groups', groupIds: [ALPHA] }, stored);
const actions = (entries: AuditEvent[]) => entries.map((entry) => entry.action);

describe('Tasking equipment and checklist operations', () => {
	it('adds equipment once when the same entry is sent again, and audits it once', async () => {
		const { ctx, equipment, audit } = member('operate');

		const first = await addEquipment(ctx, TASKING, { id: LITTERS, draft: littersDraft });
		const retry = await addEquipment(ctx, TASKING, { id: LITTERS, draft: { ...littersDraft, name: 'Retyped' } });

		expect(retry).toEqual(first);
		expect(equipment).toHaveLength(1);
		expect(actions(audit.entries)).toEqual(['calendar_tasking.equipment_added']);
	});

	it('audits securing and editing separately and waits for each audit write', async () => {
		const { ctx, audit } = member('operate');
		await addEquipment(ctx, TASKING, { id: LITTERS, draft: littersDraft });

		await updateEquipment(ctx, TASKING, LITTERS, { securedQuantity: 4 });
		await updateEquipment(ctx, TASKING, LITTERS, { name: 'Field litters', quantity: 6 });
		await updateEquipment(ctx, TASKING, LITTERS, { name: 'Field litters', securedQuantity: 6 });

		expect(actions(audit.entries)).toEqual([
			'calendar_tasking.equipment_added',
			'calendar_tasking.equipment_secured',
			'calendar_tasking.equipment_changed',
			'calendar_tasking.equipment_changed',
			'calendar_tasking.equipment_secured'
		]);
	});

	it('lets a Group-scoped operator work their own Group’s lists and refuses another Group’s', async () => {
		const own = alphaOperator();
		await addEquipment(own.ctx, TASKING, { id: LITTERS, draft: littersDraft });
		await addChecklistItem(own.ctx, TASKING, { id: RADIOS, label: 'Confirm radios' });
		expect(own.equipment).toHaveLength(1);
		expect(own.checklist).toHaveLength(1);

		const other = alphaOperator(tasking(BRAVO));
		await expect(addEquipment(other.ctx, TASKING, { id: LITTERS, draft: littersDraft })).rejects.toMatchObject({
			status: 403
		});
		await expect(updateChecklistItem(other.ctx, TASKING, RADIOS, { done: true })).rejects.toMatchObject({
			status: 403
		});
		expect(other.equipment).toEqual([]);
		expect(other.audit.entries).toEqual([]);
	});

	it('refuses every write from a viewer and every read from a member without Calendar access', async () => {
		const viewer = member('view');
		await expect(addEquipment(viewer.ctx, TASKING, { id: LITTERS, draft: littersDraft })).rejects.toMatchObject({
			status: 403
		});
		await expect(removeEquipment(viewer.ctx, TASKING, LITTERS)).rejects.toMatchObject({ status: 403 });
		await expect(reorderTaskingList(viewer.ctx, TASKING, 'equipment', { ids: [] })).rejects.toMatchObject({
			status: 403
		});
		expect(await loadTaskingLists(viewer.ctx, TASKING)).toEqual({ equipment: [], checklist: [] });

		await expect(loadTaskingLists(member('none').ctx, TASKING)).rejects.toMatchObject({ status: 403 });
	});

	it.each([
		['completed', { kind: 'completed', note: null, at: '2026-10-25T12:00:00Z', by: ACTOR }],
		['cancelled', { kind: 'cancelled', reason: null, at: '2026-10-25T12:00:00Z', by: ACTOR }]
	] as const)('refuses changes to a %s Tasking and says to reopen it', async (_label, status) => {
		const { ctx, equipment, audit } = member('operate', { kind: 'organization' }, tasking(ALPHA, status));

		await expect(addEquipment(ctx, TASKING, { id: LITTERS, draft: littersDraft })).rejects.toMatchObject({
			status: 409
		});
		expect(equipment).toEqual([]);
		expect(audit.entries).toEqual([]);
	});

	it('records a return on a completed Tasking and keeps everything else on it closed', async () => {
		const completed = tasking(ALPHA, { kind: 'completed', note: null, at: '2026-10-25T12:00:00Z', by: ACTOR });
		const { ctx, equipment } = member('operate', { kind: 'organization' }, completed);
		equipment.push({ id: LITTERS, ...littersDraft, securedQuantity: 4, returnedQuantity: 0 });

		await updateEquipment(ctx, TASKING, LITTERS, { returnedQuantity: 3 });
		await expect(
			updateEquipment(ctx, TASKING, LITTERS, { returnedQuantity: 4, securedQuantity: 3 })
		).rejects.toMatchObject({ status: 409 });

		expect(equipment[0]).toMatchObject({ securedQuantity: 4, returnedQuantity: 3 });
		const cancelled = member(
			'operate',
			{ kind: 'organization' },
			tasking(ALPHA, { kind: 'cancelled', reason: null, at: '2026-10-25T12:00:00Z', by: ACTOR })
		);
		cancelled.equipment.push({ id: LITTERS, ...littersDraft, returnedQuantity: 0 });
		await expect(updateEquipment(cancelled.ctx, TASKING, LITTERS, { returnedQuantity: 1 })).rejects.toMatchObject({
			status: 409
		});
	});

	it('conceals a Tasking the viewer cannot see', async () => {
		const { ctx } = member('operate', { kind: 'organization' }, null);

		await expect(addEquipment(ctx, TASKING, { id: LITTERS, draft: littersDraft })).rejects.toMatchObject({
			status: 404
		});
		await expect(addEquipment(ctx, 'not-a-uuid', { id: LITTERS, draft: littersDraft })).rejects.toMatchObject({
			status: 404
		});
	});

	it.each([
		['a secured count above the quantity', { id: LITTERS, draft: { ...littersDraft, securedQuantity: 5 } }],
		['a quantity of zero', { id: LITTERS, draft: { ...littersDraft, quantity: 0 } }],
		['an attribution column', { id: LITTERS, draft: littersDraft, createdBy: ACTOR }]
	])('rejects %s before anything is stored', async (_why, input) => {
		const { ctx, equipment } = member('operate');

		await expect(addEquipment(ctx, TASKING, input)).rejects.toMatchObject({ status: 400 });
		expect(equipment).toEqual([]);
	});

	it('refuses to complete a checklist item with fields a client may not set', async () => {
		const { ctx, checklist } = member('operate');
		await addChecklistItem(ctx, TASKING, { id: RADIOS, label: 'Confirm radios' });

		await expect(updateChecklistItem(ctx, TASKING, RADIOS, { done: true, doneBy: ACTOR })).rejects.toMatchObject({
			status: 400
		});
		expect(checklist[0].done).toBe(false);
	});

	it('records completing and reopening a checklist item and never touches the Tasking', async () => {
		const stored = tasking(ALPHA);
		const { ctx, audit } = member('operate', { kind: 'organization' }, stored);
		await addChecklistItem(ctx, TASKING, { id: RADIOS, label: 'Confirm radios' });

		await updateChecklistItem(ctx, TASKING, RADIOS, { done: true });
		await updateChecklistItem(ctx, TASKING, RADIOS, { done: false });

		expect(actions(audit.entries)).toEqual([
			'calendar_tasking.checklist_added',
			'calendar_tasking.checklist_completed',
			'calendar_tasking.checklist_reopened'
		]);
		expect(stored.status).toEqual({ kind: 'in_progress' });
	});

	it('answers a removal of an item that is already gone without auditing it again', async () => {
		const { ctx, audit } = member('operate');
		await addEquipment(ctx, TASKING, { id: LITTERS, draft: littersDraft });

		expect(await removeEquipment(ctx, TASKING, LITTERS)).toEqual({ removed: true });
		expect(await removeEquipment(ctx, TASKING, LITTERS)).toEqual({ removed: false });
		expect(actions(audit.entries)).toEqual(['calendar_tasking.equipment_added', 'calendar_tasking.equipment_removed']);
	});

	it('returns the authoritative order after a reorder', async () => {
		const { ctx } = member('operate');
		await addEquipment(ctx, TASKING, { id: LITTERS, draft: littersDraft });
		await addEquipment(ctx, TASKING, { id: RADIOS, draft: { ...littersDraft, name: 'Radios' } });

		const lists = await reorderTaskingList(ctx, TASKING, 'equipment', { ids: [RADIOS, LITTERS] });

		expect(lists.equipment.map((item) => item.name)).toEqual(['Radios', 'Litters']);
	});
});
