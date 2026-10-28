import { z } from 'zod';
import type { Database, SupabaseClient } from '$lib/server/database';
import type {
	RankCatalogPersistence,
	RankCatalogSave,
	RankCatalogValues,
	SavedRankCatalogEntry
} from './rankCatalogPersistence';
const SELECT = 'id,organization_id,code,label,service,category,pay_grade,state,source,sort_order,created_at,updated_at';
function values(row: RankCatalogValues): RankCatalogValues;
function values(
	row: Omit<RankCatalogValues, 'state'> & { state?: RankCatalogValues['state'] }
): Omit<RankCatalogValues, 'state'> & { state?: RankCatalogValues['state'] };
function values(row: Omit<RankCatalogValues, 'state'> & { state?: RankCatalogValues['state'] }) {
	return {
		code: row.code,
		label: row.label,
		service: row.service,
		category: row.category,
		pay_grade: row.pay_grade,
		...(row.state !== undefined ? { state: row.state } : {}),
		source: row.source,
		sort_order: row.sort_order
	};
}
const rankColumns = {
	service: z.enum(['army', 'navy', 'air-force', 'marine-corps', 'coast-guard', 'space-force', 'civilian', 'custom']),
	category: z.enum(['officer', 'warrant', 'enlisted', 'civilian', 'custom']),
	pay_grade: z.enum([
		'O-1',
		'O-2',
		'O-3',
		'O-4',
		'O-5',
		'O-6',
		'O-7',
		'O-8',
		'O-9',
		'O-10',
		'W-1',
		'W-2',
		'W-3',
		'W-4',
		'W-5',
		'E-1',
		'E-2',
		'E-3',
		'E-4',
		'E-5',
		'E-6',
		'E-7',
		'E-8',
		'E-9',
		'ungraded'
	]),
	state: z.enum(['active', 'retired']),
	source: z.enum(['built-in', 'discovered', 'custom'])
};
function saved(raw: Database['public']['Tables']['organization_rank_catalog']['Row']): SavedRankCatalogEntry {
	const row = {
		...raw,
		service: rankColumns.service.parse(raw.service),
		category: rankColumns.category.parse(raw.category),
		pay_grade: rankColumns.pay_grade.parse(raw.pay_grade),
		state: rankColumns.state.parse(raw.state),
		source: rankColumns.source.parse(raw.source)
	};
	return {
		...values(row),
		id: row.id,
		organization_id: row.organization_id,
		...(row.created_at !== undefined ? { created_at: row.created_at } : {}),
		...(row.updated_at !== undefined ? { updated_at: row.updated_at } : {})
	};
}
export function createSupabaseRankCatalogPersistence(client: SupabaseClient, orgId: string): RankCatalogPersistence {
	return {
		async listEntries() {
			const rows: SavedRankCatalogEntry[] = [];
			for (let offset = 0; ; offset += 1000) {
				const { data, error } = await client
					.from('organization_rank_catalog')
					.select(SELECT)
					.eq('organization_id', orgId)
					.order('id', { ascending: true })
					.range(offset, offset + 999);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				rows.push(...page.map(saved));
				if (page.length < 1000) return rows;
			}
		},
		async findEntryByCode(code) {
			const { data, error } = await client
				.from('organization_rank_catalog')
				.select(SELECT)
				.eq('organization_id', orgId)
				.eq('code', code)
				.single();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? saved(data) : null;
		},
		async saveEntries(entries: RankCatalogSave[]) {
			if (!entries.length) return [];
			const payload = entries.map((row) => ({
				...values(row),
				organization_id: orgId,
				...(row.id !== undefined ? { id: row.id } : {}),
				...(row.created_at !== undefined ? { created_at: row.created_at as string } : {}),
				...(row.updated_at !== undefined ? { updated_at: row.updated_at as string } : {})
			}));
			const { data, error } = await client
				.from('organization_rank_catalog')
				.upsert(payload, { onConflict: 'organization_id,code' })
				.select(SELECT);
			if (error) throw new Error(error.message);
			return (data ?? []).map(saved);
		},
		async setStatesByCodes(codes, state) {
			if (!codes.length) return [];
			const { data, error } = await client
				.from('organization_rank_catalog')
				.update({ state })
				.eq('organization_id', orgId)
				.in('code', [...codes])
				.neq('state', state)
				.select(SELECT);
			if (error) throw new Error(error.message);
			return (data ?? []).map(saved);
		},
		async patchEntryById(id, input) {
			const { data, error } = await client
				.from('organization_rank_catalog')
				.update(values(input))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(SELECT)
				.single();
			if (error) throw new Error(error.message);
			return saved(data);
		}
	};
}
