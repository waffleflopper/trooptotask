import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260613000200_lock_down_privileged_state_rpcs.sql'),
	'utf8'
).toLowerCase();

const aggregateRpcSignatures = ['count_platform_users()', 'daily_signups_last_30_days()', 'count_org_personnel(uuid)'];

describe('privileged state RPC privileges migration', () => {
	it('limits aggregate state RPCs to service role callers', () => {
		for (const signature of aggregateRpcSignatures) {
			expect(migration).toContain(`revoke all on function public.${signature} from public`);
			expect(migration).toContain(`revoke all on function public.${signature} from anon`);
			expect(migration).toContain(`revoke all on function public.${signature} from authenticated`);
			expect(migration).toContain(`grant execute on function public.${signature} to service_role`);
		}
	});

	it('keeps suspension checks executable for authenticated self-checks and service role paths', () => {
		expect(migration).toContain('revoke all on function public.is_user_suspended(uuid) from public');
		expect(migration).toContain('revoke all on function public.is_user_suspended(uuid) from anon');
		expect(migration).toContain('grant execute on function public.is_user_suspended(uuid) to authenticated');
		expect(migration).toContain('grant execute on function public.is_user_suspended(uuid) to service_role');
		expect(migration).not.toContain('grant execute on function public.is_user_suspended(uuid) to anon');
	});

	it('guards suspension state by service role, platform admin, or caller self-check', () => {
		expect(migration).toContain("current_setting('role', true) = 'service_role'");
		expect(migration).toContain('or public.is_platform_admin()');
		expect(migration).toContain('(select auth.uid()) = check_user_id');
		expect(migration).toContain('from public.user_suspensions where user_id = check_user_id');
	});

	it('does not alter or delete user suspension records', () => {
		expect(migration).not.toMatch(/\balter\s+table\s+(only\s+)?("?public"?\.)?"?user_suspensions"?/);
		expect(migration).not.toMatch(/\bdrop\s+table\s+(if\s+exists\s+)?("?public"?\.)?"?user_suspensions"?/);
		expect(migration).not.toMatch(/\bdelete\s+from\s+("?public"?\.)?"?user_suspensions"?/);
	});
});
