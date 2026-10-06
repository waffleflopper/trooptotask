import { describe, expect, it } from 'vitest';
import { createTestContext } from './calendarPersistence.test-support.server';
import { createStatusType, updateStatusType } from './statusTypeOperations.server';
import { createAssignmentType } from './assignmentTypeOperations.server';
import { createSpecialDay } from './specialDayOperations.server';
import { createAvailability, updateAvailability } from './availabilityOperations.server';

describe('Calendar mutation input boundaries', () => {
	it.each([
		{ name: '' },
		{ name: 'x'.repeat(101) },
		{ name: 'Leave', sortOrder: 0.5 },
		{ name: 'Leave', sortOrder: null }
	])('rejects invalid status input before any saved effect', async (input) => {
		const ctx = createTestContext();
		await expect(createStatusType(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('status_types', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([
		{ name: 'Duty', shortName: 'D', assignTo: 'invalid' },
		{ name: 'Duty', assignTo: 'group' }
	])('rejects an invalid assignment target or missing required short name', async (input) => {
		const ctx = createTestContext();
		await expect(createAssignmentType(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);
	});

	it('rejects an invalid closure type without saving it', async () => {
		const ctx = createTestContext();
		await expect(createSpecialDay(ctx, { date: '2026-10-06', name: 'Closure', type: 'invalid' })).rejects.toMatchObject(
			{ status: 400 }
		);
		expect(await ctx.store.findMany('special_days', ctx.auth.orgId)).toEqual([]);
	});

	it.each([
		{ personnelId: 'person-a' },
		{ personnelId: 'person-a', statusTypeId: 'status-a', startDate: '2026-10-06', endDate: '2026-10-06', note: 17 }
	])('rejects incomplete availability or a non-text note before lookup and effects', async (input) => {
		const ctx = createTestContext();
		await expect(createAvailability(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});

	it('requires saved identity for patches and rejects unknown availability fields', async () => {
		const ctx = createTestContext();
		await expect(updateStatusType(ctx, { name: 'Renamed' })).rejects.toMatchObject({ status: 400 });
		await expect(updateAvailability(ctx, { id: 'entry-a', unexpected: true })).rejects.toMatchObject({ status: 400 });
		expect(ctx.audit.events).toEqual([]);
	});

	it('keeps server-selected identity and readonly archival metadata out of mutation input', async () => {
		const ctx = createTestContext();
		const created = await createAssignmentType(ctx, {
			id: 'injected',
			organization_id: 'foreign',
			created_at: 'injected',
			archivedAt: 'injected',
			name: 'Duty',
			shortName: 'D',
			assignTo: 'group'
		});
		expect(created.id).not.toBe('injected');
		expect(created.organization_id).toBe(ctx.auth.orgId);
		expect(created.archivedAt).toBeUndefined();
		expect(await ctx.store.findMany('assignment_types', 'foreign')).toEqual([]);
	});
});
