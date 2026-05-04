import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditPort, AuthContext, DataStore, ReadOnlyGuard } from '$lib/server/core/ports';
import { createDutyRosterTemplate, findDutyRosterTemplateBySlug, listDutyRosterTemplates } from './dutyRosterTemplates';

const rows: Record<string, unknown>[] = [];
const auditEvents: Array<{ action: string; resourceType: string; resourceId?: string }> = [];

function createAuth(overrides: Partial<AuthContext> = {}): AuthContext {
	return {
		userId: 'user-1',
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		capabilityMap: {
			calendar: 'operate',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		},
		compatibilityLanes: { leadersBook: 'none' },
		scopeSet: { kind: 'groups', groupIds: ['group-1'] },
		requireView: vi.fn(),
		requirePrivileged: vi.fn(),
		requireOwner: vi.fn(),
		requireManageMembers: vi.fn(),
		requireGroupAccess: vi.fn(),
		requireGroupAccessBatch: vi.fn(),
		requireGroupAccessByRecord: vi.fn(),
		...overrides
	};
}

const store: DataStore = {
	async findOne(_table, orgId, filters) {
		return (
			rows.find((row) =>
				Object.entries({ organization_id: orgId, ...filters }).every(([key, value]) => row[key] === value)
			) ?? null
		);
	},
	async findMany(_table, orgId, filters = {}, options) {
		let result = rows.filter((row) =>
			Object.entries({ organization_id: orgId, ...filters }).every(([key, value]) => row[key] === value)
		);

		if (options?.select === 'slug') {
			return result.map((row) => ({ slug: row.slug }));
		}

		if (options?.orderBy?.some((order) => order.column === 'name')) {
			result = [...result].sort((a, b) => String(a.name).localeCompare(String(b.name)));
		}

		return result;
	},
	async insert(_table, orgId, data) {
		if (rows.some((row) => row.organization_id === orgId && row.slug === data.slug)) {
			throw new Error('duplicate key value violates unique constraint "duty_roster_templates_org_slug_key"');
		}

		const row = {
			id: `template-${rows.length + 1}`,
			organization_id: orgId,
			...data
		};
		rows.push(row);
		return row;
	},
	update: vi.fn(),
	updateById: vi.fn(),
	delete: vi.fn(),
	deleteWhere: vi.fn(),
	deleteWhereAny: vi.fn(),
	deleteManyByIds: vi.fn(),
	insertMany: vi.fn(),
	findManyWithCount: vi.fn()
} as DataStore;

const audit: AuditPort = {
	log: (event) => {
		auditEvents.push(event);
	}
};

const criticalTasksReadModel = {
	findLatestCompletions: vi.fn(),
	findCompletionTrend: vi.fn()
};

const readOnlyGuard: ReadOnlyGuard = {
	check: vi.fn(async () => false)
};

function createCtx(auth = createAuth()) {
	return { auth, store, rawStore: store, audit, readOnlyGuard, criticalTasksReadModel };
}

describe('Duty Roster Template use cases', () => {
	beforeEach(() => {
		rows.length = 0;
		auditEvents.length = 0;
		vi.mocked(readOnlyGuard.check).mockResolvedValue(false);
	});

	it('allows a scoped Calendar operator to create one-duty templates', async () => {
		const template = await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'cq' });

		expect(template).toMatchObject({
			id: 'template-1',
			name: 'CQ NCO',
			slug: 'cq-nco',
			shortCode: 'CQ',
			status: 'active'
		});
		expect(auditEvents).toContainEqual({
			action: 'duty_roster_template.created',
			resourceType: 'duty_roster_template',
			resourceId: 'template-1'
		});
	});

	it('handles slug collisions inside the Organization', async () => {
		await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'CQ' });
		const second = await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'CQ' });

		expect(second.slug).toBe('cq-nco-2');
	});

	it('lists and opens active templates by slug for scoped Calendar viewers', async () => {
		await createDutyRosterTemplate(createCtx(), { name: 'Staff Duty NCO', shortCode: 'SD' });
		await createDutyRosterTemplate(createCtx(), { name: 'CQ Runner', shortCode: 'CQ' });

		const viewCtx = createCtx(
			createAuth({
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			})
		);

		await expect(listDutyRosterTemplates(viewCtx)).resolves.toEqual([
			expect.objectContaining({ name: 'CQ Runner' }),
			expect.objectContaining({ name: 'Staff Duty NCO' })
		]);
		await expect(findDutyRosterTemplateBySlug(viewCtx, 'staff-duty-nco')).resolves.toEqual(
			expect.objectContaining({ name: 'Staff Duty NCO' })
		);
	});

	it('blocks writes without Calendar operate capability', async () => {
		const ctx = createCtx(
			createAuth({
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			})
		);

		await expect(createDutyRosterTemplate(ctx, { name: 'CQ NCO' })).rejects.toMatchObject({
			status: 403
		});
	});
});
