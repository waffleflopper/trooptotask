import { getContext, setContext } from 'svelte';
import { createClientAccess, type ClientAccess } from '$lib/access/clientAccess';
import type { ReadyAppShell } from './contracts';

const APP_SHELL_CONTEXT = Symbol('app-shell');

/** Delivery projects these current values into each feature's own narrow inputs. */
export interface AppShellContext extends ClientAccess {
	readonly orgId: string;
	readonly orgUrlSegment: string;
	readonly orgName: string;
	readonly userId: string;
	autoShowWhatsNew(): void;
}

export function createAppShellContext(getShell: () => ReadyAppShell, autoShowWhatsNew: () => void): AppShellContext {
	const access = createClientAccess(() => ({
		membershipRole: getShell().member.role,
		capabilityMap: getShell().member.capabilityMap,
		scopeSet: getShell().member.scopeSet
	}));
	return {
		get orgId() {
			return getShell().org.id;
		},
		get orgUrlSegment() {
			return getShell().org.urlSegment;
		},
		get orgName() {
			return getShell().org.name;
		},
		get userId() {
			return getShell().user.id;
		},
		get role() {
			return access.role;
		},
		get isOwner() {
			return access.isOwner;
		},
		get isAdmin() {
			return access.isAdmin;
		},
		get isPrivileged() {
			return access.isPrivileged;
		},
		get capabilityMap() {
			return access.capabilityMap;
		},
		get scopeSet() {
			return access.scopeSet;
		},
		affordanceForFeatureAction: access.affordanceForFeatureAction,
		affordanceForGovernanceAction: access.affordanceForGovernanceAction,
		hasCapability: access.hasCapability,
		isResourceInScope: access.isResourceInScope,
		autoShowWhatsNew
	};
}

export function setAppShellContext(context: AppShellContext): void {
	setContext(APP_SHELL_CONTEXT, context);
}

export function getAppShellContext(): AppShellContext {
	const context = getContext<AppShellContext | undefined>(APP_SHELL_CONTEXT);
	if (!context) throw new Error('AppShell context requires an admitted workspace shell.');
	return context;
}
