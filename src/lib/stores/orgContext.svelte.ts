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
