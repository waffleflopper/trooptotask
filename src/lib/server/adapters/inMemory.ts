import type { DataStore, FindOptions, AuthContext, AuditPort, ReadOnlyGuard, SubscriptionPort } from '../core/ports';

type Row = Record<string, unknown>;
type TableStore = Map<string, Row[]>;

export function createInMemoryDataStore(): DataStore & { seed(table: string, rows: Row[]): void } {
	const tables: TableStore = new Map();

	function getRows(table: string): Row[] {
		if (!tables.has(table)) {
			tables.set(table, []);
		}
		return tables.get(table)!;
	}

	function matchesFilters(row: Row, orgId: string, filters?: Record<string, unknown>): boolean {
		if (row.organization_id !== orgId) return false;
		if (!filters) return true;
		return Object.entries(filters).every(([key, value]) => row[key] === value);
	}

	return {
		seed(table: string, rows: Row[]): void {
			const existing = getRows(table);
			existing.push(...rows);
		},

		async findOne<T>(table: string, orgId: string, filters: Record<string, unknown>): Promise<T | null> {
			const rows = getRows(table);
			const match = rows.find((row) => matchesFilters(row, orgId, filters));
			return (match as T) ?? null;
		},

		async findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<T[]> {
			const rows = getRows(table);
			const allFilters = { ...filters, ...options?.filters };
			let results = rows.filter((row) =>
				matchesFilters(row, orgId, Object.keys(allFilters).length > 0 ? allFilters : undefined)
			);

			if (options?.inFilters) {
				for (const [key, values] of Object.entries(options.inFilters)) {
					results = results.filter((row) => values.includes(row[key]));
				}
			}

			if (options?.orderBy && options.orderBy.length > 0) {
				results.sort((a, b) => {
					for (const { column, ascending } of options.orderBy!) {
						const aVal = a[column];
						const bVal = b[column];
						if (aVal === bVal) continue;
						if (aVal == null) return ascending ? -1 : 1;
						if (bVal == null) return ascending ? 1 : -1;
						const cmp = aVal < bVal ? -1 : 1;
						return ascending ? cmp : -cmp;
					}
					return 0;
				});
			}

			if (options?.limit !== undefined) {
				results = results.slice(0, options.limit);
			}

			return results as T[];
		},

		async insert<T>(table: string, orgId: string, data: Record<string, unknown>): Promise<T> {
			const row: Row = { ...data, organization_id: orgId };
			getRows(table).push(row);
			return row as T;
		},

		async update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>): Promise<T> {
			const rows = getRows(table);
			const index = rows.findIndex((row) => row.id === id && row.organization_id === orgId);
			if (index === -1) {
				throw new Error(`Record not found: ${table}/${id}`);
			}
			Object.assign(rows[index], data);
			return rows[index] as T;
		},

		async delete(table: string, orgId: string, id: string): Promise<void> {
			const rows = getRows(table);
			const index = rows.findIndex((row) => row.id === id && row.organization_id === orgId);
			if (index === -1) {
				throw new Error(`Record not found: ${table}/${id}`);
			}
			rows.splice(index, 1);
		},

		async deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void> {
			const rows = getRows(table);
			for (let i = rows.length - 1; i >= 0; i--) {
				if (matchesFilters(rows[i], orgId, filters)) {
					rows.splice(i, 1);
				}
			}
		},

		async insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[]): Promise<T[]> {
			const tableRows = getRows(table);
			const inserted: Row[] = [];
			for (const data of rows) {
				const row: Row = { ...data, organization_id: orgId };
				tableRows.push(row);
				inserted.push(row);
			}
			return inserted as T[];
		}
	};
}

export function createTestAuthContext(overrides?: Partial<AuthContext>): AuthContext {
	const defaults: AuthContext = {
		userId: 'test-user',
		orgId: 'test-org',
		role: 'owner',
		isPrivileged: true,
		isFullEditor: true,
		scopedGroupId: null,
		requireEdit() {},
		requireView() {},
		requirePrivileged() {},
		requireOwner() {},
		requireFullEditor() {},
		async requireGroupAccess() {},
		async requireGroupAccessBatch() {},
		async requireGroupAccessByRecord() {}
	};

	return { ...defaults, ...overrides };
}

interface AuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	details?: Record<string, unknown>;
}

export function createTestAuditPort(): AuditPort & { events: AuditEvent[] } {
	const events: AuditEvent[] = [];
	return {
		events,
		log(event: AuditEvent): void {
			events.push(event);
		}
	};
}

export function createTestReadOnlyGuard(isReadOnly = false): ReadOnlyGuard {
	return {
		async check(): Promise<boolean> {
			return isReadOnly;
		}
	};
}

export function createTestSubscriptionPort(
	allowed = true,
	message?: string
): SubscriptionPort & { tierCacheInvalidated: boolean } {
	return {
		tierCacheInvalidated: false,
		async canAddPersonnel() {
			return allowed ? { allowed: true } : { allowed: false, message: message ?? 'Personnel limit reached' };
		},
		invalidateTierCache() {
			this.tierCacheInvalidated = true;
		}
	};
}
