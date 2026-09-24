import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const governance = require('../../scripts/check-governance.mjs') as {
	collectFeaturePermissionCouplingIssues(
		sourceFiles: Array<{ path: string; content: string }>,
		baselineEntries: Array<{ feature: string; path: string; pattern: string }>
	): string[];
	collectPermissionPatterns(content: string): string[];
	hasRouteAdminProviderUsage(content: string): boolean;
	hasRouteSupabaseUsage(content: string): boolean;
};

describe('governance route Supabase usage detection', () => {
	it('detects Supabase calls through locals destructuring', () => {
		expect(
			governance.hasRouteSupabaseUsage(`
				export async function GET({ locals }) {
					const { supabase } = locals;
					await supabase.from('profiles').select('*');
				}
			`)
		).toBe(true);
	});

	it('detects Supabase calls through event.locals destructuring', () => {
		expect(
			governance.hasRouteSupabaseUsage(`
				export async function GET(event) {
					const { supabase } = event.locals;
					await supabase.from('profiles').select('*');
				}
			`)
		).toBe(true);
	});

	it('detects Supabase calls through aliased event.locals destructuring', () => {
		expect(
			governance.hasRouteSupabaseUsage(`
				export async function GET(event) {
					const { supabase: routeSupabase } = event.locals;
					await routeSupabase.rpc('sync_profile');
				}
			`)
		).toBe(true);
	});

	it('detects Supabase calls through RequestEvent parameter destructuring', () => {
		expect(
			governance.hasRouteSupabaseUsage(`
				export const POST = async ({ locals: { supabase } }) => {
					await supabase.from('assignments').insert({});
				};
			`)
		).toBe(true);
	});

	it('detects Supabase calls through aliased RequestEvent parameter destructuring', () => {
		expect(
			governance.hasRouteSupabaseUsage(`
				export const POST = async ({ locals: { supabase: routeSupabase } }) => {
					await routeSupabase.storage.from('avatars').list();
				};
			`)
		).toBe(true);
	});

	it('accepts route orchestration without provider access', () => {
		expect(
			governance.hasRouteSupabaseUsage(`
				export const POST = async ({ request }) => {
					return handleUseCaseRequest(useCase, await request.json());
				};
			`)
		).toBe(false);
	});
});

describe('governance route admin-provider usage detection', () => {
	it('detects direct getAdminClient calls', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				export async function GET() {
					const admin = getAdminClient();
					await admin.from('organizations').select('*');
				}
			`)
		).toBe(true);
	});

	it('detects Supabase adapter creation from getAdminClient', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				export async function load() {
					const store = createSupabaseDataStore(getAdminClient());
					return store.findMany('organizations');
				}
			`)
		).toBe(true);
	});

	it('detects admin context client casts', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				export const actions = {
					retry: adminAction({
						fn: async (ctx, event) => {
							await retryWebhook(ctx.adminClient as SupabaseClient, event);
						}
					})
				};
			`)
		).toBe(true);
	});

	it('detects admin context client destructuring', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				export const actions = {
					resetPassword: adminAction({
						fn: async (ctx, event) => {
							const { adminClient } = ctx;
							await adminClient.auth.admin.getUserById(event.params.userId);
						}
					})
				};
			`)
		).toBe(true);
	});

	it('detects admin context adapter factory seams', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				export const load = loadWithAdminContext({
					fn: async (adminContext) => createSupabasePlatformUserIdentityCommands(adminContext).sendPasswordReset()
				});
			`)
		).toBe(true);
	});

	it('detects admin API handler adapter factory seams', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				export const _getConfig = {
					fn: async (ctx, rawQuery) => {
						return createSupabasePlatformAdministration(ctx).search({ query: rawQuery });
					}
				};

				export const GET = adminHandle(_getConfig);
			`)
		).toBe(true);
	});

	it('does not flag route orchestration without admin-provider wiring', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				export const POST = async ({ request }) => {
					const input = await request.json();
					return handleUseCaseRequest(useCase, input);
				};
			`)
		).toBe(false);
	});
});

describe('governance feature permission coupling detection', () => {
	it('collects policy-catalog and legacy permission patterns', () => {
		expect(
			governance.collectPermissionPatterns(`
				const canViewTraining = org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.viewRecords);
				const canManagePersonnel = org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.manageRecords);
				const canSeeCalendar = org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.viewAvailability);
				const canUseOnboarding = org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.onboarding.manageWorkflows);
				const legacyTraining = { permission: 'training' };
				requireEdit('personnel');
				requireView('calendar');
			`)
		).toEqual([
			'POLICY_ACTION_CATALOG.calendar.viewAvailability',
			'POLICY_ACTION_CATALOG.onboarding.manageWorkflows',
			'POLICY_ACTION_CATALOG.personnel.manageRecords',
			'POLICY_ACTION_CATALOG.training.viewRecords',
			"permission: 'training'",
			"requireEdit('personnel')",
			"requireView('calendar')"
		]);
	});

	it('flags foreign permission lanes for configured feature families when the baseline is empty', () => {
		expect(
			governance.collectFeaturePermissionCouplingIssues(
				[
					{
						path: 'src/features/critical-tasks/example.ts',
						content: `
							const ownAction = POLICY_ACTION_CATALOG.criticalTasks.viewReadiness;
							const borrowedAction = POLICY_ACTION_CATALOG.training.viewRecords;
						`
					}
				],
				[]
			)
		).toEqual([
			'Undocumented critical-tasks permission coupling: src/features/critical-tasks/example.ts -> POLICY_ACTION_CATALOG.training.viewRecords. Use the owning feature permission lane.'
		]);
	});

	it('does not flag same-family policy references', () => {
		expect(
			governance.collectFeaturePermissionCouplingIssues(
				[
					{
						path: 'src/features/critical-tasks/example.ts',
						content: 'const action = POLICY_ACTION_CATALOG.criticalTasks.configureLibrary;'
					},
					{
						path: 'src/features/rating-scheme/example.ts',
						content: 'const action = POLICY_ACTION_CATALOG.ratingScheme.viewEntries;'
					}
				],
				[]
			)
		).toEqual([]);
	});
});
