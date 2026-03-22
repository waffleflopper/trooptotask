import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/supabase', () => ({
	getApiContext: vi.fn()
}));
vi.mock('$lib/server/permissionContext', () => ({
	createPermissionContext: vi.fn()
}));
vi.mock('$lib/server/read-only-guard', () => ({
	checkReadOnly: vi.fn()
}));
vi.mock('$lib/server/validation', () => ({
	validateUUID: vi.fn()
}));
vi.mock('$lib/server/auditLog', () => ({
	auditLog: vi.fn(),
	getRequestInfo: vi.fn().mockReturnValue({ userId: null, ip: '127.0.0.1', userAgent: 'test' })
}));

import { PUT } from './+server';
import { getApiContext } from '$lib/server/supabase';
import { createPermissionContext } from '$lib/server/permissionContext';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { validateUUID } from '$lib/server/validation';

const VALID_ORG_ID = '00000000-0000-0000-0000-000000000001';

function mockPermissionContext() {
	return {
		role: 'admin' as const,
		isOwner: false,
		isAdmin: true,
		isPrivileged: true,
		isFullEditor: false,
		scopedGroupId: null,
		canView: { calendar: true, personnel: true, training: true, onboarding: true, 'leaders-book': true },
		canEdit: { calendar: true, personnel: true, training: true, onboarding: true, 'leaders-book': true },
		canManageMembers: true,
		requireEdit: vi.fn(),
		requireView: vi.fn(),
		requirePrivileged: vi.fn(),
		requireOwner: vi.fn(),
		requireFullEditor: vi.fn(),
		requireManageMembers: vi.fn(),
		requireGroupAccess: vi.fn(),
		requireGroupAccessBatch: vi.fn(),
		requireGroupAccessByRecord: vi.fn()
	};
}

function mockEvent(body: unknown) {
	return {
		params: { orgId: VALID_ORG_ID },
		locals: {} as App.Locals,
		cookies: {} as never,
		request: new Request('http://localhost/test', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof PUT>[0];
}

let mockSupabaseUpdate: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockSupabase: any;

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(validateUUID).mockReturnValue(true);
	vi.mocked(checkReadOnly).mockResolvedValue(null);

	mockSupabaseUpdate = vi.fn().mockReturnValue({
		eq: vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					single: vi.fn().mockResolvedValue({
						data: { exempt_personnel_ids: ['p1', 'p2'] },
						error: null
					})
				})
			})
		})
	});

	mockSupabase = {
		from: vi.fn().mockReturnValue({
			update: mockSupabaseUpdate
		})
	};

	vi.mocked(getApiContext).mockReturnValue({
		supabase: mockSupabase,
		userId: 'user-1',
		isSandbox: false
	});
	vi.mocked(createPermissionContext).mockResolvedValue(mockPermissionContext());
});

describe('PUT /api/duty-roster-exemptions', () => {
	it('updates exempt personnel and returns the result', async () => {
		const response = await PUT(mockEvent({ assignmentTypeId: 'at-1', personnelIds: ['p1', 'p2'] }));

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.exemptPersonnelIds).toEqual(['p1', 'p2']);

		expect(mockSupabase.from).toHaveBeenCalledWith('assignment_types');
		expect(mockSupabaseUpdate).toHaveBeenCalledWith({ exempt_personnel_ids: ['p1', 'p2'] });
	});

	it('requires edit calendar permission', async () => {
		const ctx = mockPermissionContext();
		vi.mocked(createPermissionContext).mockResolvedValue(ctx);

		await PUT(mockEvent({ assignmentTypeId: 'at-1', personnelIds: [] }));

		expect(ctx.requireEdit).toHaveBeenCalledWith('calendar');
	});
});
