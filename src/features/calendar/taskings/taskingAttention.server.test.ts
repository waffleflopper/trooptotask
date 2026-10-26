import { describe, expect, it, vi } from 'vitest';
import type { CapabilityLevel } from '$lib/access/memberAccessShape';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import {
	createSupabaseCalendarTaskingAttentionReader,
	loadTaskingAttention,
	type CalendarTaskingAttentionPorts
} from './taskingAttention.server';
import type { TaskingAttentionProjection } from './taskingAttentionModel';

const ORG = '00000000-0000-4000-8000-000000000001';
const TASKING = '00000000-0000-4000-8000-000000000101';
const ALPHA = '00000000-0000-4000-8000-000000000201';

function ports(calendar: CapabilityLevel, projection: TaskingAttentionProjection): CalendarTaskingAttentionPorts {
	return {
		auth: createTestAuthContext({
			userId: ORG,
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
			scopeSet: { kind: 'organization' }
		}),
		taskingAttention: { read: vi.fn(async () => projection) }
	};
}

const projection: TaskingAttentionProjection = { rows: [], total: 0 };

describe('loadTaskingAttention', () => {
	it('reads the viewer day for a member who can see Events', async () => {
		const ctx = ports('view', projection);

		await expect(loadTaskingAttention(ctx, '2026-10-26')).resolves.toBe(projection);
		expect(ctx.taskingAttention.read).toHaveBeenCalledWith('2026-10-26');
	});

	it('refuses a member without the Calendar lane before reading', async () => {
		const ctx = ports('none', projection);

		await expect(loadTaskingAttention(ctx, '2026-10-26')).rejects.toMatchObject({ status: 403 });
		expect(ctx.taskingAttention.read).not.toHaveBeenCalled();
	});
});

describe('createSupabaseCalendarTaskingAttentionReader', () => {
	const row = {
		tasking_id: TASKING,
		kind: 'short',
		title: 'Provide four medics',
		responsible_group_id: ALPHA,
		event_title: 'Range week',
		suspense_on: '2026-10-30',
		execution_starts_on: '2026-10-28',
		staffing_required: 4,
		staffing_picked: 2,
		equipment_not_ready: 1,
		attention_total: '7'
	};

	function client(result: { data: unknown; error: { message: string } | null }) {
		const rpc = vi.fn(async () => result);
		return { rpc, reader: createSupabaseCalendarTaskingAttentionReader({ rpc } as never, ORG) };
	}

	it('maps the rows and carries the full count beside the bounded rows', async () => {
		const { rpc, reader } = client({ data: [row], error: null });

		await expect(reader.read('2026-10-26')).resolves.toEqual({
			total: 7,
			rows: [
				{
					taskingId: TASKING,
					kind: 'short',
					title: 'Provide four medics',
					responsibility: { kind: 'group', groupId: ALPHA },
					eventTitle: 'Range week',
					suspenseOn: '2026-10-30',
					executionStartsOn: '2026-10-28',
					required: 4,
					picked: 2,
					equipmentNotReady: 1
				}
			]
		});
		expect(rpc).toHaveBeenCalledWith(
			'calendar_tasking_attention',
			expect.objectContaining({ p_organization_id: ORG, p_today: '2026-10-26' })
		);
	});

	it('maps a Tasking with no Group to Organization responsibility', async () => {
		const { reader } = client({ data: [{ ...row, responsible_group_id: null }], error: null });

		const { rows } = await reader.read('2026-10-26');

		expect(rows[0]?.responsibility).toEqual({ kind: 'organization' });
	});

	it('returns an empty projection when nothing needs attention', async () => {
		const { reader } = client({ data: [], error: null });

		await expect(reader.read('2026-10-26')).resolves.toEqual({ rows: [], total: 0 });
	});

	it('throws the database message on a failed read', async () => {
		const { reader } = client({ data: null, error: { message: 'permission denied' } });

		await expect(reader.read('2026-10-26')).rejects.toThrow('permission denied');
	});
});
