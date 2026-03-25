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

	/** Strip pagination from options so the inner query fetches all rows for in-memory filtering */
	function stripPagination(options?: FindOptions): FindOptions | undefined {
		if (!options) return undefined;
		const { range, limit, ...rest } = options;
		return Object.keys(rest).length > 0 ? rest : undefined;
	}

	/** Apply pagination (range/limit) to an already-filtered result set */
	function applyPagination<T>(results: T[], options?: FindOptions): T[] {
		let sliced = results;
		if (options?.range) {
			sliced = sliced.slice(options.range.from, options.range.to + 1);
		}
		if (options?.limit !== undefined) {
			sliced = sliced.slice(0, options.limit);
		}
		return sliced;
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
				// Fetch all rows (no pagination) so in-memory personnel filter sees everything
				const unpaginated = stripPagination(scoped.options);
				const results = await inner.findMany<T & Record<string, unknown>>(table, orgId, scoped.filters, unpaginated);
				const filtered = await filterByPersonnel(results, orgId, scoped.needsPersonnelFilter);
				return applyPagination(filtered, scoped.options) as T[];
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
				// Fetch all rows (no pagination) so in-memory personnel filter sees everything
				const unpaginated = stripPagination(scoped.options);
				const results = await inner.findMany<T & Record<string, unknown>>(table, orgId, scoped.filters, unpaginated);
				const filtered = await filterByPersonnel(results, orgId, scoped.needsPersonnelFilter);
				return { data: applyPagination(filtered, scoped.options) as T[], count: filtered.length };
			}

			return inner.findManyWithCount<T>(table, orgId, scoped.filters, scoped.options);
		},

		// Write operations pass through unchanged
		insert: inner.insert.bind(inner),
		update: inner.update.bind(inner),
		updateById: inner.updateById.bind(inner),
		delete: inner.delete.bind(inner),
		deleteWhere: inner.deleteWhere.bind(inner),
		deleteManyByIds: inner.deleteManyByIds.bind(inner),
		insertMany: inner.insertMany.bind(inner)
	};
}
