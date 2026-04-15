import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

function createSupabaseStub() {
	return {
		from(table: string) {
			expect(table).toBe('data_exports');

			return {
				insert() {
					return {
						select() {
							return {
								async single() {
									return { data: { id: 'export-1' }, error: null };
								}
							};
						}
					};
				},
				update() {
					return {
						async eq() {
							return { data: null, error: null };
						}
					};
				}
			};
		}
	};
}

describe('POST /api/export', () => {
	it('includes ETS and DEROS in the organization personnel export payload', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: '2026-11-30',
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com',
			_supabase: createSupabaseStub()
		});

		const payload = JSON.parse(result._json as string) as {
			personnel: Array<Record<string, unknown>>;
		};

		expect(payload.personnel).toEqual([
			expect.objectContaining({
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);
	});
});
