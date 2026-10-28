import { describe, expect, it, vi } from 'vitest';
import { RequestFailure } from '$lib/errors';
import { requireCalendarPolicy } from './calendarPolicy.server';
import { createWritePortsContext } from './calendarPersistence.test-support.server';
import type { CalendarSuggestionsInput } from './calendarSuggestions';
import { applyCalendarSuggestions } from './calendarSuggestions.server';

vi.mock('./calendarPolicy.server', async (original) => {
	const policy = await original<typeof import('./calendarPolicy.server')>();
	return { ...policy, requireCalendarPolicy: vi.fn(policy.requireCalendarPolicy) };
});

describe('apply Calendar suggestions', () => {
	it('creates the picked presets in catalog order after existing rows and preserves them on retry', async () => {
		const ctx = createWritePortsContext();
		const status = await ctx.calendarCatalogs.createStatusType({ name: 'Custom' });
		await ctx.store.update('status_types', ctx.auth.orgId, status.id, { sort_order: 7 });
		const assignment = await ctx.calendarCatalogs.createAssignmentType({
			name: 'Existing',
			shortName: 'E',
			assignTo: 'group'
		});
		await ctx.store.update('assignment_types', ctx.auth.orgId, assignment.id, { sort_order: 9 });
		const input = {
			statusIds: ['cq-sd', 'other-duty-detail', 'sick', 'appointment', 'training-tdy', 'school', 'leave'],
			assignmentIds: ['staff-duty']
		} satisfies CalendarSuggestionsInput;
		const first = await applyCalendarSuggestions(ctx, input);
		expect(
			first.statusTypes.map(({ name, color, textColor, sortOrder }) => ({ name, color, textColor, sortOrder }))
		).toEqual([
			{ name: 'Custom', color: '#6b7280', textColor: '#ffffff', sortOrder: 7 },
			{ name: 'Leave', color: '#48bb78', textColor: '#ffffff', sortOrder: 8 },
			{ name: 'School', color: '#4299e1', textColor: '#ffffff', sortOrder: 9 },
			{ name: 'Training / TDY', color: '#9f7aea', textColor: '#ffffff', sortOrder: 10 },
			{ name: 'Appointment', color: '#ed8936', textColor: '#ffffff', sortOrder: 11 },
			{ name: 'Sick', color: '#e53e3e', textColor: '#ffffff', sortOrder: 12 },
			{ name: 'Other Duty / Detail', color: '#a0522d', textColor: '#ffffff', sortOrder: 13 },
			{ name: 'CQ/SD', color: '#dc2626', textColor: '#ffffff', sortOrder: 14 }
		]);
		expect(first.assignmentTypes).toMatchObject([
			{ name: 'Existing', sortOrder: 9 },
			{ name: 'Staff Duty', shortName: 'SD', assignTo: 'personnel', color: '#dc2626', sortOrder: 10 }
		]);
		expect(first.created.map(({ id }) => id)).toEqual([
			'leave',
			'school',
			'training-tdy',
			'appointment',
			'sick',
			'other-duty-detail',
			'cq-sd',
			'staff-duty'
		]);
		expect(first.failed).toEqual([]);
		const second = await applyCalendarSuggestions(ctx, input);
		expect(second.created).toEqual([]);
		expect(second.skipped.map(({ id }) => id)).toEqual([
			'leave',
			'school',
			'training-tdy',
			'appointment',
			'sick',
			'other-duty-detail',
			'cq-sd',
			'staff-duty'
		]);
		expect(second.statusTypes).toEqual(first.statusTypes);
		expect(second.assignmentTypes).toEqual(first.assignmentTypes);
		expect(ctx.audit.events.map(({ action }) => action).sort()).toEqual([
			'assignment_type.created',
			'status_type.created',
			'status_type.created',
			'status_type.created',
			'status_type.created',
			'status_type.created',
			'status_type.created',
			'status_type.created'
		]);
	});

	it('skips trimmed case-insensitive names while leaving their saved fields intact', async () => {
		const ctx = createWritePortsContext();
		await ctx.calendarCatalogs.createStatusType({ name: '  lEaVe ', color: '#123456' });
		await ctx.calendarCatalogs.createAssignmentType({ name: ' staff DUTY  ', shortName: 'X', assignTo: 'group' });
		const result = await applyCalendarSuggestions(ctx, { statusIds: ['leave', 'sick'], assignmentIds: ['staff-duty'] });
		expect(result.skipped.map(({ id }) => id)).toEqual(['leave', 'staff-duty']);
		expect(result.created.map(({ id }) => id)).toEqual(['sick']);
		expect(result.statusTypes).toMatchObject([{ name: '  lEaVe ', color: '#123456' }, { name: 'Sick' }]);
		expect(result.assignmentTypes).toMatchObject([{ name: ' staff DUTY  ', shortName: 'X', assignTo: 'group' }]);
	});

	it('reports a failed create while retaining successful picks and lets a retry finish the selection', async () => {
		const ctx = createWritePortsContext();
		const create = ctx.calendarCatalogs.createStatusType.bind(ctx.calendarCatalogs);
		const fault = vi.spyOn(ctx.calendarCatalogs, 'createStatusType').mockImplementation(async (input) => {
			if (input.name === 'School') throw new Error('sensitive provider detail');
			return create(input);
		});
		const input = {
			statusIds: ['leave', 'school', 'sick'],
			assignmentIds: ['staff-duty']
		} satisfies CalendarSuggestionsInput;
		const first = await applyCalendarSuggestions(ctx, input);
		expect(first.created.map(({ id }) => id)).toEqual(['leave', 'sick', 'staff-duty']);
		expect(first.failed.map(({ id }) => id)).toEqual(['school']);
		expect(first.statusTypes.map(({ name }) => name)).toEqual(['Leave', 'Sick']);
		expect(first.assignmentTypes.map(({ name }) => name)).toEqual(['Staff Duty']);
		expect(JSON.stringify(first)).not.toContain('sensitive provider detail');
		fault.mockRestore();
		const second = await applyCalendarSuggestions(ctx, input);
		expect(second.created.map(({ id }) => id)).toEqual(['school']);
		expect(second.skipped.map(({ id }) => id)).toEqual(['leave', 'sick', 'staff-duty']);
		expect(second.failed).toEqual([]);
	});

	it.each(['status', 'assignment'] as const)(
		'adopts a concurrent %s create after re-reading the conflict',
		async (kind) => {
			const ctx = createWritePortsContext();
			if (kind === 'status') {
				const create = ctx.calendarCatalogs.createStatusType.bind(ctx.calendarCatalogs);
				vi.spyOn(ctx.calendarCatalogs, 'createStatusType').mockImplementationOnce(async (input) => {
					await create(input);
					throw new RequestFailure(409, 'Concurrent create');
				});
			} else {
				const create = ctx.calendarCatalogs.createAssignmentType.bind(ctx.calendarCatalogs);
				vi.spyOn(ctx.calendarCatalogs, 'createAssignmentType').mockImplementationOnce(async (input) => {
					await create(input);
					throw new RequestFailure(409, 'Concurrent create');
				});
			}
			const result = await applyCalendarSuggestions(ctx, {
				statusIds: kind === 'status' ? ['leave'] : [],
				assignmentIds: kind === 'assignment' ? ['staff-duty'] : []
			});
			expect(result.skipped.map(({ id }) => id)).toEqual([kind === 'status' ? 'leave' : 'staff-duty']);
			expect(result.created).toEqual([]);
			expect(result.failed).toEqual([]);
			expect([...result.statusTypes, ...result.assignmentTypes].map(({ name }) => name)).toEqual([
				kind === 'status' ? 'Leave' : 'Staff Duty'
			]);
		}
	);

	it.each(['status', 'assignment'] as const)('requires only the picked %s policy', async (kind) => {
		vi.mocked(requireCalendarPolicy).mockClear();
		const ctx = createWritePortsContext();
		const result = await applyCalendarSuggestions(ctx, {
			statusIds: kind === 'status' ? ['leave'] : [],
			assignmentIds: kind === 'assignment' ? ['staff-duty'] : []
		});
		expect(result.created.map(({ id }) => id)).toEqual([kind === 'status' ? 'leave' : 'staff-duty']);
		expect(vi.mocked(requireCalendarPolicy).mock.calls.map(([, action]) => action.id)).not.toContain(
			kind === 'status' ? 'calendar.configureAssignmentTypes' : 'calendar.configureStatusTypes'
		);
	});

	it('waits for the owning create audit before acknowledging success', async () => {
		const ctx = createWritePortsContext();
		let release!: () => void;
		const pendingAudit = new Promise<void>((resolve) => {
			release = resolve;
		});
		vi.spyOn(ctx.audit, 'log').mockReturnValue(pendingAudit);
		let settled = false;
		const saving = applyCalendarSuggestions(ctx, { statusIds: ['leave'], assignmentIds: [] }).then((result) => {
			settled = true;
			return result;
		});
		await vi.waitFor(async () =>
			expect(await ctx.calendarCatalogs.listStatusTypes()).toMatchObject([{ name: 'Leave' }])
		);
		expect(settled).toBe(false);
		release();
		expect((await saving).created.map(({ id }) => id)).toEqual(['leave']);
	});

	it.each([401, 403])('rethrows a %s from a create rather than reporting a failed pick', async (status) => {
		const ctx = createWritePortsContext();
		vi.spyOn(ctx.calendarCatalogs, 'createStatusType').mockRejectedValueOnce(new RequestFailure(status, 'Denied'));
		await expect(applyCalendarSuggestions(ctx, { statusIds: ['leave'], assignmentIds: [] })).rejects.toMatchObject({
			status
		});
	});
});
