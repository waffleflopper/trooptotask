/**
 * OrgContext — per-org runtime identity and permission state for the current user.
 *
 * Passed through Svelte's component context tree (not a global singleton) so that
 * multiple orgs can render independently. Set once in the org layout component via
 * `setOrgContext(createOrgContext(layoutData))` and retrieved anywhere below via
 * `getOrgContext()`.
 *
 * OrgContext is the client-side complement to UseCaseContext on the server. It drives
 * UI permission checks (show/hide buttons, enable/disable forms). For actual data-access
 * enforcement, always rely on the server-side AuthContext.
 *
 * Key flags:
 * - `isPrivileged`: owner or admin (full data access)
 * - `isFullEditor`: non-privileged member with all edit permissions and no group scope
 * - `scopedGroupId`: non-null means this member can only see their own group's data
 * - `readOnly`: org subscription has lapsed; all write actions should be blocked
 */
import { setContext, getContext } from 'svelte';
import { isFullEditor as checkFullEditor, type OrganizationMemberPermissions } from '$lib/types';

const ORG_CONTEXT_KEY = Symbol('org-context');

export interface OrgContext {
	readonly orgId: string;
	readonly orgName: string;
	readonly userId: string | null;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isOwner: boolean;
	readonly isAdmin: boolean;
	readonly isPrivileged: boolean;
	readonly isFullEditor: boolean;
	readonly permissions: OrganizationMemberPermissions;
	readonly scopedGroupId: string | null;
	readonly readOnly: boolean;
}

export interface CreateOrgContextInput {
	orgId: string;
	orgName: string;
	userId: string | null;
	userRole: 'owner' | 'admin' | 'member';
	permissions: OrganizationMemberPermissions;
	scopedGroupId: string | null;
	isReadOnly: boolean;
}

/**
 * Builds an OrgContext from layout data, deriving computed fields
 * (isOwner, isAdmin, isPrivileged, isFullEditor, readOnly).
 */
export function createOrgContext(input: CreateOrgContextInput): OrgContext {
	const isOwner = input.userRole === 'owner';
	const isAdmin = input.userRole === 'admin';
	const isPrivileged = isOwner || isAdmin;

	// Full editor: non-privileged, non-scoped member with all edit permissions
	const fullEditor = !isPrivileged && !input.scopedGroupId && checkFullEditor(input.permissions);

	return {
		orgId: input.orgId,
		orgName: input.orgName,
		userId: input.userId,
		role: input.userRole,
		isOwner,
		isAdmin,
		isPrivileged,
		isFullEditor: fullEditor,
		permissions: input.permissions,
		scopedGroupId: input.scopedGroupId,
		readOnly: input.isReadOnly
	};
}

/**
 * Stores the OrgContext in Svelte's component context.
 * Must be called during component initialization.
 */
export function setOrgContext(ctx: OrgContext): void {
	setContext(ORG_CONTEXT_KEY, ctx);
}

/**
 * Retrieves the OrgContext from Svelte's component context.
 * Must be called during component initialization.
 * Throws if context has not been set.
 */
export function getOrgContext(): OrgContext {
	const ctx = getContext<OrgContext | undefined>(ORG_CONTEXT_KEY);
	if (!ctx) {
		throw new Error(
			'OrgContext not found. Ensure setOrgContext() is called in a parent layout or component before using getOrgContext().'
		);
	}
	return ctx;
}
