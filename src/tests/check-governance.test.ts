import { describe, expect, it } from 'vitest';

const governanceModuleUrl = new URL('../../scripts/check-governance.mjs', import.meta.url).href;
const governance = (await import(/* @vite-ignore */ governanceModuleUrl)) as {
	collectDestructuredLocalSupabaseBindings(content: string): Set<string>;
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
