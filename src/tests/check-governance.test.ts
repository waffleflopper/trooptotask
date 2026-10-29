import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const governance = require('../../scripts/check-governance.mjs') as {
	collectFeaturePermissionCouplingIssues(sourceFiles: Array<{ path: string; content: string }>): string[];
	collectGroupScopeMigrationIssues(sourceFiles: Array<{ path: string; content: string }>): string[];
	collectPermissionPatterns(content: string): string[];
	hasRouteAdminProviderUsage(content: string): boolean;
	hasRouteSupabaseUsage(content: string): boolean;
};

describe('governance route admin-provider detection', () => {
	it('detects a lazily passed admin client import', () => {
		expect(
			governance.hasRouteAdminProviderUsage(`
				import { getAdminClient } from '$lib/server/supabase';
				export const POST = () => createPort(getAdminClient);
			`)
		).toBe(true);
	});
});

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

	it('flags foreign permission lanes for configured feature families', () => {
		expect(
			governance.collectFeaturePermissionCouplingIssues([
				{
					path: 'src/features/critical-tasks/example.ts',
					content: `
							const ownAction = POLICY_ACTION_CATALOG.criticalTasks.viewReadiness;
							const borrowedAction = POLICY_ACTION_CATALOG.training.viewRecords;
						`
				}
			])
		).toEqual([
			'critical-tasks permission coupling: src/features/critical-tasks/example.ts -> POLICY_ACTION_CATALOG.training.viewRecords. Use the owning feature permission lane.'
		]);
	});

	it('does not flag same-family policy references', () => {
		expect(
			governance.collectFeaturePermissionCouplingIssues([
				{
					path: 'src/features/critical-tasks/example.ts',
					content: 'const action = POLICY_ACTION_CATALOG.criticalTasks.configureLibrary;'
				},
				{
					path: 'src/features/rating-scheme/example.ts',
					content: 'const action = POLICY_ACTION_CATALOG.ratingScheme.viewEntries;'
				}
			])
		).toEqual([]);
	});
});

describe('nested Group migration governance', () => {
	const path = 'supabase/migrations/20261028110000_future_scope.sql';
	it.each([
		'person.group_id = ANY(m.access_scope_group_ids)',
		'"g"."id" = ANY(\n"membership"."access_scope_group_ids"\n)',
		'person.group_id = ANY(NEW.access_scope_group_ids)',
		'person.group_id = ANY(OLD.access_scope_group_ids)',
		'm.access_scope_group_ids @> ARRAY[p.group_id]',
		'ARRAY[p.group_id] <@ m.access_scope_group_ids',
		'ARRAY[p.group_id] && m.access_scope_group_ids',
		'p.group_id IN (SELECT unnest(m.access_scope_group_ids))',
		'm.access_scope_group_ids = ARRAY[p.group_id]',
		'access_scope_group_ids = ARRAY[p.group_id]',
		'cardinality(m.access_scope_group_ids) > 0'
	])('rejects exact grant membership in a future migration %s', (comparison) => {
		expect(governance.collectGroupScopeMigrationIssues([{ path, content: `SELECT ${comparison};` }])).toEqual([
			expect.stringContaining('Use groups.path && access_scope_group_ids')
		]);
	});
	it.each([
		'person.group_id = tasking.responsible_group_id',
		'tasking.responsible_group_id = person.group_id',
		'person.group_id IS DISTINCT FROM tasking.responsible_group_id',
		'NEW.responsible_group_id IS DISTINCT FROM person.group_id'
	])('rejects exact Tasking candidacy in a future migration %s', (comparison) => {
		expect(governance.collectGroupScopeMigrationIssues([{ path, content: `SELECT ${comparison};` }])).toEqual([
			expect.stringContaining('Use organization_private.group_within')
		]);
	});
	it.each([
		'SELECT 1 FROM public.groups WHERE id = ANY(NEW.access_scope_group_ids) AND organization_id <> NEW.organization_id;',
		'SELECT NEW.responsible_group_id IS DISTINCT FROM OLD.responsible_group_id;',
		'SELECT g.path && m.access_scope_group_ids;',
		'UPDATE public.organization_memberships SET access_scope_group_ids = ARRAY[]::uuid[];',
		"UPDATE public.organization_memberships SET access_scope_kind = 'organization', access_scope_group_ids = ARRAY[]::uuid[] WHERE id = p_id;",
		'NEW.access_scope_group_ids := ARRAY[]::uuid[];',
		'NEW.access_scope_group_ids := OLD.access_scope_group_ids;',
		'UPDATE public.organization_memberships SET access_scope_group_ids = m.access_scope_group_ids;',
		'INSERT INTO public.organization_memberships (organization_id, access_scope_group_ids) VALUES (p_id, p_groups);',
		'SELECT m.id, m.access_scope_group_ids FROM public.organization_memberships m;',
		'RETURNS TABLE (id uuid, access_scope_group_ids uuid[])',
		'-- person.group_id = ANY(m.access_scope_group_ids)\nSELECT true;'
	])('accepts storage validation, change detection and subtree rules %s', (content) => {
		expect(governance.collectGroupScopeMigrationIssues([{ path, content }])).toEqual([]);
	});
	it('keeps historical migrations outside the new rule', () => {
		expect(
			governance.collectGroupScopeMigrationIssues([
				{
					path: 'supabase/migrations/20261028090000_group_pins_by_id.sql',
					content: 'SELECT person.group_id = ANY(m.access_scope_group_ids);'
				}
			])
		).toEqual([]);
	});
});
