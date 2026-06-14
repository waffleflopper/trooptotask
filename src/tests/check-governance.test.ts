import { describe, expect, it } from 'vitest';

const governanceModuleUrl = new URL('../../scripts/check-governance.mjs', import.meta.url).href;
const governance = (await import(/* @vite-ignore */ governanceModuleUrl)) as {
	collectDestructuredLocalSupabaseBindings(content: string): Set<string>;
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
