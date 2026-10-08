import type { ScopeSet } from '$lib/access/memberAccessShape';
import type {
	FixtureRowStore,
	FixtureFindOptions,
	FixtureFindResult,
	FixtureGroupScopeRule
} from './inMemoryRows.types';

export function createScopedFixtureRows(
	inner: FixtureRowStore,
	scope: ScopeSet | string[] | string | null,
	scopeRules: Map<string, FixtureGroupScopeRule>
): FixtureRowStore {
	const groupScopeIds = normalizeScopedGroupIds(scope);
	if (groupScopeIds === null) return inner;
	const groupIds = groupScopeIds;

	let cachedPersonnelIds: string[] | null = null;

	async function getInScopePersonnelIds(orgId: string): Promise<string[]> {
		if (cachedPersonnelIds) return cachedPersonnelIds;

		const personnelRule = scopeRules.get('personnel');
		if (!personnelRule || personnelRule.type !== 'group') {
			cachedPersonnelIds = [];
			return cachedPersonnelIds;
		}

		const personnel = await inner.findMany<{ id: string }>(
			'personnel',
			orgId,
			groupIds.length === 1 ? { [personnelRule.groupColumn]: groupIds[0] } : undefined,
			groupIds.length > 1 ? { inFilters: { [personnelRule.groupColumn]: groupIds } } : undefined
		);
		cachedPersonnelIds = personnel.map((p) => p.id);
		return cachedPersonnelIds;
	}

	function addScopeFilters(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FixtureFindOptions
	): { filters?: Record<string, unknown>; options?: FixtureFindOptions; needsPersonnelFilter?: string } {
		const rule = scopeRules.get(table);
		if (!rule) return { filters, options };

		if (rule.type === 'group') {
			if (groupIds.length > 1) {
				return {
					filters,
					options: mergeInFilter(options, rule.groupColumn, groupIds)
				};
			}

			return {
				filters: { ...filters, [rule.groupColumn]: groupIds[0] },
				options
			};
		}

		return { filters, options, needsPersonnelFilter: rule.personnelColumn };
	}

	async function addPersonnelScopeOptions(
		orgId: string,
		personnelColumn: string,
		options?: FixtureFindOptions
	): Promise<FixtureFindOptions | null> {
		const ids = await getInScopePersonnelIds(orgId);
		const scopedIds = intersectInFilterValues(options?.inFilters?.[personnelColumn], ids);
		if (scopedIds.length === 0) return null;
		return mergeInFilter(options, personnelColumn, scopedIds);
	}

	return {
		async findOne<T>(
			table: string,
			orgId: string,
			filters: Record<string, unknown>,
			select?: string
		): Promise<T | null> {
			if (groupIds.length === 0 && scopeRules.has(table)) return null;
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

			if (scoped.options) {
				const results = await inner.findMany<T>(table, orgId, scoped.filters ?? filters, {
					...scoped.options,
					...(select ? { select } : {}),
					limit: 1
				});
				return results[0] ?? null;
			}

			return inner.findOne<T>(table, orgId, scoped.filters ?? filters, select);
		},

		async findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FixtureFindOptions
		): Promise<T[]> {
			if (groupIds.length === 0 && scopeRules.has(table)) return [];
			const scoped = addScopeFilters(table, orgId, filters, options);

			if (scoped.needsPersonnelFilter) {
				const scopedOptions = await addPersonnelScopeOptions(orgId, scoped.needsPersonnelFilter, scoped.options);
				if (!scopedOptions) return [];
				return inner.findMany<T>(table, orgId, scoped.filters, scopedOptions);
			}

			return inner.findMany<T>(table, orgId, scoped.filters, scoped.options);
		},

		async findManyWithCount<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FixtureFindOptions
		): Promise<FixtureFindResult<T>> {
			if (groupIds.length === 0 && scopeRules.has(table)) return { data: [], count: 0 };
			const scoped = addScopeFilters(table, orgId, filters, options);

			if (scoped.needsPersonnelFilter) {
				const scopedOptions = await addPersonnelScopeOptions(orgId, scoped.needsPersonnelFilter, scoped.options);
				if (!scopedOptions) return { data: [], count: 0 };
				return inner.findManyWithCount<T>(table, orgId, scoped.filters, scopedOptions);
			}

			return inner.findManyWithCount<T>(table, orgId, scoped.filters, scoped.options);
		},

		insert: inner.insert.bind(inner),
		update: inner.update.bind(inner),
		updateById: inner.updateById.bind(inner),
		delete: inner.delete.bind(inner),
		deleteWhere: inner.deleteWhere.bind(inner),
		deleteWhereAny: inner.deleteWhereAny.bind(inner),
		deleteManyByIds: inner.deleteManyByIds.bind(inner),
		insertMany: inner.insertMany.bind(inner),
		upsertMany: inner.upsertMany.bind(inner)
	};
}

function normalizeScopedGroupIds(scope: ScopeSet | string[] | string | null): string[] | null {
	if (!scope) return null;
	if (Array.isArray(scope)) {
		const groupIds = Array.from(new Set(scope.filter(Boolean)));
		return groupIds;
	}
	if (typeof scope === 'string') return scope ? [scope] : null;
	if (scope.kind !== 'groups') return null;

	const groupIds = Array.from(new Set(scope.groupIds.filter(Boolean)));
	return groupIds;
}

function mergeInFilter(options: FixtureFindOptions | undefined, column: string, values: unknown[]): FixtureFindOptions {
	return {
		...(options ?? {}),
		inFilters: {
			...(options?.inFilters ?? {}),
			[column]: values
		}
	};
}

function intersectInFilterValues(existingValues: unknown[] | undefined, scopedValues: string[]): unknown[] {
	if (!existingValues) return scopedValues;
	const scopedSet = new Set<unknown>(scopedValues);
	return existingValues.filter((value) => scopedSet.has(value));
}
