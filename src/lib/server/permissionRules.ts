import type { PermissionContext, FeatureArea } from './permissionContext';

export type PermissionRule = (ctx: PermissionContext) => void;

export const Rules = {
	view: (area: FeatureArea): PermissionRule => (ctx) => ctx.requireView(area),
	edit: (area: FeatureArea): PermissionRule => (ctx) => ctx.requireEdit(area),
	privileged: (): PermissionRule => (ctx) => ctx.requirePrivileged(),
	owner: (): PermissionRule => (ctx) => ctx.requireOwner(),
	fullEditor: (): PermissionRule => (ctx) => ctx.requireFullEditor(),
	manageMembers: (): PermissionRule => (ctx) => ctx.requireManageMembers(),

	any:
		(...rules: PermissionRule[]): PermissionRule =>
		(ctx) => {
			if (rules.length === 0) return;
			let lastError: unknown;
			for (const rule of rules) {
				try {
					rule(ctx);
					return;
				} catch (e) {
					lastError = e;
				}
			}
			throw lastError;
		},

	all:
		(...rules: PermissionRule[]): PermissionRule =>
		(ctx) => {
			for (const rule of rules) {
				rule(ctx);
			}
		}
};
