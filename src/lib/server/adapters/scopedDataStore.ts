import type { DataStore, FindOptions, FindResult, GroupScopeRule } from '$lib/server/core/ports';

/**
 * Decorator that wraps any DataStore and auto-filters reads by group scope.
 * Returns the inner store unchanged when scopedGroupId is null (zero overhead for admins/owners).
 */
export function createScopedDataStore(
	inner: DataStore,
	scopedGroupId: string | null,
	scopeRules: Map<string, GroupScopeRule>
): DataStore {
	if (!scopedGroupId) return inner;

	let cachedPersonnelIds: string[] | null = null;

	async function getInScopePersonnelIds(orgId: string): Promise<string[]> {
		if (cachedPersonnelIds) return cachedPersonnelIds;

		const personnelRule = scopeRules.get('personnel');
		if (!personnelRule || personnelRule.type !== 'group') {
			cachedPersonnelIds = [];
			return cachedPersonnelIds;
		}

		const personnel = await inner.findMany<{ id: string }>('personnel', orgId, {
			[personnelRule.groupColumn]: scopedGroupId
		});
		cachedPersonnelIds = personnel.map((p) => p.id);
		return cachedPersonnelIds;
	}

	function addScopeFilters(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FindOptions
	): { filters?: Record<string, unknown>; options?: FindOptions; needsPersonnelFilter?: string } {
		const rule = scopeRules.get(table);
		if (!rule) return { filters, options };

		if (rule.type === 'group') {
			return {
				filters: { ...filters, [rule.groupColumn]: scopedGroupId },
				options
			};
		}

		// Personnel-scoped — need to filter by in-scope personnel IDs
		return { filters, options, needsPersonnelFilter: rule.personnelColumn };
	}

	async function filterByPersonnel<T extends Record<string, unknown>>(
		results: T[],
		orgId: string,
		personnelColumn: string
	): Promise<T[]> {
		const ids = await getInScopePersonnelIds(orgId);
		const idSet = new Set(ids);
		return results.filter((row) => idSet.has(row[personnelColumn] as string));
	}

	return {
		async findOne<T>(
			table: string,
			orgId: string,
			filters: Record<string, unknown>,
			select?: string
		): Promise<T | null> {
			const scoped = addScopeFilters(table, orgId, filters);

			if (scoped.needsPersonnelFilter) {
				const result = await inner.findOne<T & Record<string, unknown>>(
					table,
					orgId,
					scoped.filters ?? filters,
					select
				);
				if (!result) return null;
				const ids = await getInScopePersonnelIds(orgId);
				const idSet = new Set(ids);
				return idSet.has(result[scoped.needsPersonnelFilter] as string) ? result : null;
			}

			return inner.findOne<T>(table, orgId, scoped.filters ?? filters, select);
		},

		async findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<T[]> {
			const scoped = addScopeFilters(table, orgId, filters, options);

			if (scoped.needsPersonnelFilter) {
				const results = await inner.findMany<T & Record<string, unknown>>(table, orgId, scoped.filters, scoped.options);
				return filterByPersonnel(results, orgId, scoped.needsPersonnelFilter) as Promise<T[]>;
			}

			return inner.findMany<T>(table, orgId, scoped.filters, scoped.options);
		},

		async findManyWithCount<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<FindResult<T>> {
			const scoped = addScopeFilters(table, orgId, filters, options);

			if (scoped.needsPersonnelFilter) {
				const results = await inner.findMany<T & Record<string, unknown>>(table, orgId, scoped.filters, scoped.options);
				const filtered = await filterByPersonnel(results, orgId, scoped.needsPersonnelFilter);
				return { data: filtered as T[], count: filtered.length };
			}

			return inner.findManyWithCount<T>(table, orgId, scoped.filters, scoped.options);
		},

		// Write operations pass through unchanged
		insert: inner.insert.bind(inner),
		update: inner.update.bind(inner),
		delete: inner.delete.bind(inner),
		deleteWhere: inner.deleteWhere.bind(inner),
		deleteManyByIds: inner.deleteManyByIds.bind(inner),
		insertMany: inner.insertMany.bind(inner)
	};
}
