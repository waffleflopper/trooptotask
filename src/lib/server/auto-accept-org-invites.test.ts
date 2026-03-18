/* eslint-disable @typescript-eslint/no-explicit-any -- mock Supabase clients need any casts */
import { describe, it, expect, vi } from 'vitest';
import { autoAcceptOrgInvites } from './auto-accept-org-invites';

function createMockSupabase(invitations: Record<string, unknown>[] = []) {
	const insertedRows: Record<string, unknown>[] = [];
	const updatedInvitations = { called: false };

	const mock = {
		from: vi.fn((table: string) => {
			if (table === 'organization_invitations') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockResolvedValue({ data: invitations, error: null })
						})
					}),
					update: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							in: vi.fn().mockImplementation(() => {
								updatedInvitations.called = true;
								return Promise.resolve({ error: null });
							})
						})
					})
				};
			}
			if (table === 'organization_memberships') {
				return {
					insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
						insertedRows.push(row);
						return Promise.resolve({ error: null });
					})
				};
			}
			return {};
		}),
		_insertedRows: insertedRows,
		_updatedInvitations: updatedInvitations
	};

	return mock;
}

describe('autoAcceptOrgInvites', () => {
	it('returns accepted: 0 when no pending invitations exist', async () => {
		const supabase = createMockSupabase([]);

		const result = await autoAcceptOrgInvites(supabase as any, 'user-123', 'test@example.com');

		expect(result).toEqual({ accepted: 0 });
		expect(supabase._insertedRows).toHaveLength(0);
		expect(supabase._updatedInvitations.called).toBe(false);
	});

	it('creates member membership for invitation with partial permissions', async () => {
		const invitation = {
			organization_id: 'org-1',
			can_view_calendar: true,
			can_edit_calendar: false,
			can_view_personnel: true,
			can_edit_personnel: false,
			can_view_training: true,
			can_edit_training: false,
			can_view_onboarding: false,
			can_edit_onboarding: false,
			can_view_leaders_book: false,
			can_edit_leaders_book: false,
			can_manage_members: false,
			scoped_group_id: null
		};
		const supabase = createMockSupabase([invitation]);

		const result = await autoAcceptOrgInvites(supabase as any, 'user-123', 'test@example.com');

		expect(result).toEqual({ accepted: 1 });
		expect(supabase._insertedRows).toHaveLength(1);
		expect(supabase._insertedRows[0]).toMatchObject({
			organization_id: 'org-1',
			user_id: 'user-123',
			email: 'test@example.com',
			role: 'member',
			can_view_calendar: true,
			can_edit_calendar: false,
			can_manage_members: false
		});
		expect(supabase._updatedInvitations.called).toBe(true);
	});

	it('creates admin membership when all 11 permissions are true', async () => {
		const invitation = {
			organization_id: 'org-1',
			can_view_calendar: true,
			can_edit_calendar: true,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_view_training: true,
			can_edit_training: true,
			can_view_onboarding: true,
			can_edit_onboarding: true,
			can_view_leaders_book: true,
			can_edit_leaders_book: true,
			can_manage_members: true,
			scoped_group_id: null
		};
		const supabase = createMockSupabase([invitation]);

		await autoAcceptOrgInvites(supabase as any, 'user-123', 'test@example.com');

		expect(supabase._insertedRows[0]).toMatchObject({
			role: 'admin'
		});
	});

	it('handles multiple org invitations', async () => {
		const invitations = [
			{
				organization_id: 'org-1',
				can_view_calendar: true,
				can_edit_calendar: false,
				can_view_personnel: true,
				can_edit_personnel: false,
				can_view_training: false,
				can_edit_training: false,
				can_view_onboarding: false,
				can_edit_onboarding: false,
				can_view_leaders_book: false,
				can_edit_leaders_book: false,
				can_manage_members: false,
				scoped_group_id: 'group-1'
			},
			{
				organization_id: 'org-2',
				can_view_calendar: true,
				can_edit_calendar: true,
				can_view_personnel: true,
				can_edit_personnel: true,
				can_view_training: true,
				can_edit_training: true,
				can_view_onboarding: true,
				can_edit_onboarding: true,
				can_view_leaders_book: true,
				can_edit_leaders_book: true,
				can_manage_members: true,
				scoped_group_id: null
			}
		];
		const supabase = createMockSupabase(invitations);

		const result = await autoAcceptOrgInvites(supabase as any, 'user-123', 'test@example.com');

		expect(result).toEqual({ accepted: 2 });
		expect(supabase._insertedRows).toHaveLength(2);
		expect(supabase._insertedRows[0]).toMatchObject({
			organization_id: 'org-1',
			role: 'member',
			scoped_group_id: 'group-1'
		});
		expect(supabase._insertedRows[1]).toMatchObject({ organization_id: 'org-2', role: 'admin', scoped_group_id: null });
		expect(supabase._updatedInvitations.called).toBe(true);
	});

	it('does not count failed inserts as accepted', async () => {
		const invitations = [
			{
				organization_id: 'org-1',
				can_view_calendar: true,
				can_edit_calendar: false,
				can_view_personnel: false,
				can_edit_personnel: false,
				can_view_training: false,
				can_edit_training: false,
				can_view_onboarding: false,
				can_edit_onboarding: false,
				can_view_leaders_book: false,
				can_edit_leaders_book: false,
				can_manage_members: false,
				scoped_group_id: null
			},
			{
				organization_id: 'org-2',
				can_view_calendar: true,
				can_edit_calendar: true,
				can_view_personnel: true,
				can_edit_personnel: true,
				can_view_training: true,
				can_edit_training: true,
				can_view_onboarding: true,
				can_edit_onboarding: true,
				can_view_leaders_book: true,
				can_edit_leaders_book: true,
				can_manage_members: true,
				scoped_group_id: null
			}
		];

		let insertCount = 0;
		const acceptedOrgIds: string[] = [];
		const mock = {
			from: vi.fn((table: string) => {
				if (table === 'organization_invitations') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockResolvedValue({ data: invitations, error: null })
							})
						}),
						update: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
									acceptedOrgIds.push(...ids);
									return Promise.resolve({ error: null });
								})
							})
						})
					};
				}
				if (table === 'organization_memberships') {
					return {
						insert: vi.fn().mockImplementation(() => {
							insertCount++;
							// Fail the first insert
							if (insertCount === 1) {
								return Promise.resolve({ error: { message: 'duplicate' } });
							}
							return Promise.resolve({ error: null });
						})
					};
				}
				return {};
			})
		};

		const result = await autoAcceptOrgInvites(mock as any, 'user-123', 'test@example.com');

		expect(result).toEqual({ accepted: 1 });
	});

	it('defaults null permission flags correctly', async () => {
		const invitation = {
			organization_id: 'org-1',
			can_view_calendar: null,
			can_edit_calendar: null,
			can_view_personnel: null,
			can_edit_personnel: null,
			can_view_training: null,
			can_edit_training: null,
			can_view_onboarding: null,
			can_edit_onboarding: null,
			can_view_leaders_book: null,
			can_edit_leaders_book: null,
			can_manage_members: null,
			scoped_group_id: null
		};
		const supabase = createMockSupabase([invitation]);

		await autoAcceptOrgInvites(supabase as any, 'user-123', 'test@example.com');

		expect(supabase._insertedRows[0]).toMatchObject({
			role: 'member',
			can_view_calendar: true,
			can_edit_calendar: true,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_manage_members: false
		});
	});
});
