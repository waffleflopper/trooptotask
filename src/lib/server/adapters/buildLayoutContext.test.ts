import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MembershipRow } from '$lib/server/permissionContext';
import { cacheRequestMembership, getCachedRequestMembership } from '$lib/server/membershipContextCache';

const { getApiContextMock } = vi.hoisted(() => ({
	getApiContextMock: vi.fn()
}));

vi.mock('$lib/server/supabase', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/supabase')>('$lib/server/supabase');
	return {
		...actual,
		getApiContext: getApiContextMock
	};
});

import { buildLayoutContext, buildLayoutContextFromMembership } from './httpAdapter';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

function createMembershipSupabase(membership: MembershipRow) {
	const query = {
		eq: vi.fn(),
		single: vi.fn().mockResolvedValue({ data: membership })
	};
	query.eq.mockReturnValue(query);

	const select = vi.fn().mockReturnValue(query);
	const builder = { select };
	const supabase = {
		from: vi.fn().mockReturnValue(builder)
	};

	return { supabase, query };
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

describe('buildLayoutContext', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{
			label: 'owner membership',
			membership: {
				role: 'owner',
				scoped_group_id: 'group-ignored',
				can_view_calendar: false,
				can_edit_calendar: false,
				can_view_personnel: false,
				can_edit_personnel: false,
				can_view_training: false,
				can_edit_training: false,
				can_view_onboarding: false,
				can_edit_onboarding: false,
				can_view_leaders_book: false,
				can_edit_leaders_book: false,
				can_manage_members: false
			} satisfies MembershipRow,
			assertAuth: (ctx: Awaited<ReturnType<typeof buildLayoutContext>>) => {
				expect(ctx.auth.role).toBe('owner');
				expect(ctx.auth.isPrivileged).toBe(true);
				expect(ctx.auth.scopedGroupId).toBeNull();
				expect(() => ctx.auth.requireOwner()).not.toThrow();
				expect(() => ctx.auth.requireEdit('training')).not.toThrow();
				expect(() => ctx.auth.requireManageMembers()).not.toThrow();
			}
		},
		{
			label: 'admin membership',
			membership: {
				role: 'admin',
				scoped_group_id: 'group-ignored',
				can_view_calendar: false,
				can_edit_calendar: false,
				can_view_personnel: false,
				can_edit_personnel: false,
				can_view_training: false,
				can_edit_training: false,
				can_view_onboarding: false,
				can_edit_onboarding: false,
				can_view_leaders_book: false,
				can_edit_leaders_book: false,
				can_manage_members: false
			} satisfies MembershipRow,
			assertAuth: (ctx: Awaited<ReturnType<typeof buildLayoutContext>>) => {
				expect(ctx.auth.role).toBe('admin');
				expect(ctx.auth.isPrivileged).toBe(true);
				expect(ctx.auth.scopedGroupId).toBeNull();
				expect(() => ctx.auth.requirePrivileged()).not.toThrow();
				expect(() => ctx.auth.requireOwner()).toThrow();
				expect(() => ctx.auth.requireEdit('calendar')).not.toThrow();
			}
		},
		{
			label: 'member membership',
			membership: {
				role: 'member',
				scoped_group_id: null,
				can_view_calendar: true,
				can_edit_calendar: false,
				can_view_personnel: true,
				can_edit_personnel: true,
				can_view_training: false,
				can_edit_training: false,
				can_view_onboarding: true,
				can_edit_onboarding: false,
				can_view_leaders_book: false,
				can_edit_leaders_book: false,
				can_manage_members: false
			} satisfies MembershipRow,
			assertAuth: (ctx: Awaited<ReturnType<typeof buildLayoutContext>>) => {
				expect(ctx.auth.role).toBe('member');
				expect(ctx.auth.isPrivileged).toBe(false);
				expect(ctx.auth.isFullEditor).toBe(false);
				expect(ctx.auth.scopedGroupId).toBeNull();
				expect(() => ctx.auth.requireView('calendar')).not.toThrow();
				expect(() => ctx.auth.requireEdit('personnel')).not.toThrow();
				expect(() => ctx.auth.requireEdit('training')).toThrow();
			}
		},
		{
			label: 'scoped member membership',
			membership: {
				role: 'member',
				scoped_group_id: 'group-123',
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
				can_manage_members: false
			} satisfies MembershipRow,
			assertAuth: (ctx: Awaited<ReturnType<typeof buildLayoutContext>>) => {
				expect(ctx.auth.role).toBe('member');
				expect(ctx.auth.isPrivileged).toBe(false);
				expect(ctx.auth.isFullEditor).toBe(false);
				expect(ctx.auth.scopedGroupId).toBe('group-123');
				expect(() => ctx.auth.requireView('training')).not.toThrow();
				expect(() => ctx.auth.requirePrivileged()).toThrow();
			}
		}
	])('builds auth from cached $label without querying organization memberships', async ({ membership, assertAuth }) => {
		const { supabase } = createMembershipSupabase(membership);
		getApiContextMock.mockReturnValue({
			supabase,
			userId: USER_ID,
			isSandbox: false
		});

		const locals = {} as App.Locals;
		cacheRequestMembership(locals, USER_ID, ORG_ID, membership);

		const ctx = await buildLayoutContext(locals, {} as never, ORG_ID);

		expect(supabase.from).not.toHaveBeenCalled();
		assertAuth(ctx);
	});

	it('reuses a pre-fetched membership when buildLayoutContextFromMembership seeds the request cache', async () => {
		const membership = {
			role: 'member',
			scoped_group_id: 'group-123',
			can_view_calendar: true,
			can_edit_calendar: false,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_view_training: true,
			can_edit_training: false,
			can_view_onboarding: false,
			can_edit_onboarding: false,
			can_view_leaders_book: false,
			can_edit_leaders_book: false,
			can_manage_members: false
		} satisfies MembershipRow;
		const { supabase } = createMembershipSupabase(membership);
		getApiContextMock.mockReturnValue({
			supabase,
			userId: USER_ID,
			isSandbox: false
		});

		const locals = {} as App.Locals;

		const seeded = await buildLayoutContextFromMembership(locals, {} as never, ORG_ID, membership);
		const reused = await buildLayoutContext(locals, {} as never, ORG_ID);

		expect(supabase.from).not.toHaveBeenCalled();
		expect(seeded.auth.scopedGroupId).toBe('group-123');
		expect(reused.auth.scopedGroupId).toBe('group-123');
		expect(() => reused.auth.requireEdit('personnel')).not.toThrow();
		await expect(getCachedRequestMembership(locals, USER_ID, ORG_ID)!).resolves.toEqual(membership);
	});

	it('skips request-cache seeding when buildLayoutContextFromMembership runs in sandbox mode', async () => {
		const membership = {
			role: 'member',
			scoped_group_id: 'group-123',
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
			can_manage_members: false
		} satisfies MembershipRow;
		const { supabase } = createMembershipSupabase(membership);
		getApiContextMock.mockReturnValue({
			supabase,
			userId: USER_ID,
			isSandbox: true
		});

		const locals = {} as App.Locals;
		const ctx = await buildLayoutContextFromMembership(locals, {} as never, ORG_ID, membership);

		expect(supabase.from).not.toHaveBeenCalled();
		expect(ctx.auth.role).toBe('owner');
		expect(ctx.auth.userId).toBeNull();
		expect(locals.membershipContextCache).toBeUndefined();
		expect(getCachedRequestMembership(locals, USER_ID, ORG_ID)).toBeNull();
	});

	it('stores a fetched membership row and reuses it on the next layout context build for the same request', async () => {
		const membership = {
			role: 'member',
			scoped_group_id: 'group-123',
			can_view_calendar: true,
			can_edit_calendar: false,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_view_training: true,
			can_edit_training: false,
			can_view_onboarding: false,
			can_edit_onboarding: false,
			can_view_leaders_book: false,
			can_edit_leaders_book: false,
			can_manage_members: false
		} satisfies MembershipRow;
		const { supabase, query } = createMembershipSupabase(membership);
		getApiContextMock.mockReturnValue({
			supabase,
			userId: USER_ID,
			isSandbox: false
		});

		const locals = {} as App.Locals;

		const first = await buildLayoutContext(locals, {} as never, ORG_ID);
		const second = await buildLayoutContext(locals, {} as never, ORG_ID);

		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(query.single).toHaveBeenCalledTimes(1);
		expect(first.auth.scopedGroupId).toBe('group-123');
		expect(second.auth.scopedGroupId).toBe('group-123');
		expect(() => second.auth.requireEdit('personnel')).not.toThrow();
	});

	it('deduplicates concurrent membership queries within the same request', async () => {
		const membership = {
			role: 'member',
			scoped_group_id: 'group-123',
			can_view_calendar: true,
			can_edit_calendar: false,
			can_view_personnel: true,
			can_edit_personnel: true,
			can_view_training: true,
			can_edit_training: false,
			can_view_onboarding: false,
			can_edit_onboarding: false,
			can_view_leaders_book: false,
			can_edit_leaders_book: false,
			can_manage_members: false
		} satisfies MembershipRow;
		const deferred = createDeferred<{ data: MembershipRow }>();
		const query = {
			eq: vi.fn(),
			single: vi.fn().mockReturnValue(deferred.promise)
		};
		query.eq.mockReturnValue(query);
		const select = vi.fn().mockReturnValue(query);
		const supabase = {
			from: vi.fn().mockReturnValue({ select })
		};
		getApiContextMock.mockReturnValue({
			supabase,
			userId: USER_ID,
			isSandbox: false
		});

		const locals = {} as App.Locals;
		const first = buildLayoutContext(locals, {} as never, ORG_ID);
		const second = buildLayoutContext(locals, {} as never, ORG_ID);

		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(query.single).toHaveBeenCalledTimes(1);

		deferred.resolve({ data: membership });

		const [firstCtx, secondCtx] = await Promise.all([first, second]);
		expect(firstCtx.auth.scopedGroupId).toBe('group-123');
		expect(secondCtx.auth.scopedGroupId).toBe('group-123');
	});

	it('clears a failed in-flight membership query so a later attempt can retry', async () => {
		const membership = {
			role: 'member',
			scoped_group_id: null,
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
			can_manage_members: false
		} satisfies MembershipRow;
		const query = {
			eq: vi.fn(),
			single: vi
				.fn()
				.mockRejectedValueOnce(new Error('membership query failed'))
				.mockResolvedValueOnce({ data: membership })
		};
		query.eq.mockReturnValue(query);
		const select = vi.fn().mockReturnValue(query);
		const supabase = {
			from: vi.fn().mockReturnValue({ select })
		};
		getApiContextMock.mockReturnValue({
			supabase,
			userId: USER_ID,
			isSandbox: false
		});

		const locals = {} as App.Locals;

		await expect(buildLayoutContext(locals, {} as never, ORG_ID)).rejects.toThrow('membership query failed');
		const ctx = await buildLayoutContext(locals, {} as never, ORG_ID);

		expect(supabase.from).toHaveBeenCalledTimes(2);
		expect(query.single).toHaveBeenCalledTimes(2);
		expect(ctx.auth.role).toBe('member');
	});

	it.each([
		{
			label: 'a different organization',
			cache: { userId: USER_ID, orgId: OTHER_ORG_ID }
		},
		{
			label: 'a different user',
			cache: { userId: OTHER_USER_ID, orgId: ORG_ID }
		}
	])('ignores cached membership rows for $label', async ({ cache }) => {
		const cachedMembership = {
			role: 'owner',
			scoped_group_id: null,
			can_view_calendar: false,
			can_edit_calendar: false,
			can_view_personnel: false,
			can_edit_personnel: false,
			can_view_training: false,
			can_edit_training: false,
			can_view_onboarding: false,
			can_edit_onboarding: false,
			can_view_leaders_book: false,
			can_edit_leaders_book: false,
			can_manage_members: false
		} satisfies MembershipRow;
		const queriedMembership = {
			role: 'member',
			scoped_group_id: 'group-live',
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
			can_manage_members: false
		} satisfies MembershipRow;
		const { supabase } = createMembershipSupabase(queriedMembership);
		getApiContextMock.mockReturnValue({
			supabase,
			userId: USER_ID,
			isSandbox: false
		});

		const locals = {} as App.Locals;
		cacheRequestMembership(locals, cache.userId, cache.orgId, cachedMembership);

		const ctx = await buildLayoutContext(locals, {} as never, ORG_ID);

		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(ctx.auth.role).toBe('member');
		expect(ctx.auth.scopedGroupId).toBe('group-live');
		expect(() => ctx.auth.requireOwner()).toThrow();
		expect(() => ctx.auth.requireView('calendar')).not.toThrow();
	});
});
