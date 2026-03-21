import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/transforms', () => ({
	transformGroups: vi.fn((rows: Record<string, unknown>[]) =>
		rows.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sort_order }))
	)
}));

import { groupRepo } from './repositories';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function createMockSupabase(responseData: Record<string, unknown>[]) {
	const calls: Record<string, unknown[][]> = {};

	function record(method: string) {
		return (...args: unknown[]) => {
			calls[method] = calls[method] ?? [];
			calls[method].push(args);
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: record('select'),
		eq: record('eq'),
		order: record('order'),
		in: record('in'),
		gte: record('gte'),
		lte: record('lte'),
		ilike: record('ilike')
	};

	Object.defineProperty(builder, 'then', {
		value: (resolve: (val: unknown) => void) => {
			resolve({ data: responseData, error: null, count: responseData.length });
		}
	});

	return {
		from: (table: string) => {
			calls['from'] = [[table]];
			return builder;
		},
		_calls: calls
	};
}

describe('groupRepo', () => {
	it('queries groups table with sort_order and returns transformed groups', async () => {
		const rows = [
			{ id: 'g1', name: 'Alpha', sort_order: 0 },
			{ id: 'g2', name: 'Bravo', sort_order: 1 }
		];
		const supabase = createMockSupabase(rows);

		const result = await groupRepo.list(supabase, ORG_ID);

		expect(supabase._calls['from']![0]).toEqual(['groups']);
		expect(supabase._calls['order']![0]).toEqual(['sort_order', { ascending: true }]);
		expect(result).toEqual([
			{ id: 'g1', name: 'Alpha', sortOrder: 0 },
			{ id: 'g2', name: 'Bravo', sortOrder: 1 }
		]);
	});
});
