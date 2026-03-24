import type {
	DataStore,
	FindOptions,
	FindResult,
	AuthContext,
	AuditPort,
	ReadOnlyGuard,
	SubscriptionPort,
	NotificationPort,
	NotificationPayload,
	BillingPort,
	UseCaseContext
} from '../core/ports';
import type { EffectiveTier } from '$lib/types/subscription';

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

	function applyFilters(rows: Row[], orgId: string, filters?: Record<string, unknown>, options?: FindOptions): Row[] {
		const allFilters = { ...filters, ...options?.filters };
		let results = rows.filter((row) =>
			matchesFilters(row, orgId, Object.keys(allFilters).length > 0 ? allFilters : undefined)
		);

		if (options?.inFilters) {
			for (const [key, values] of Object.entries(options.inFilters)) {
				results = results.filter((row) => values.includes(row[key]));
			}
		}

		if (options?.isNull) {
			for (const [key, shouldBeNull] of Object.entries(options.isNull)) {
				results = results.filter((row) => (shouldBeNull ? row[key] == null : row[key] != null));
			}
		}

		if (options?.rangeFilters) {
			for (const { column, op, value } of options.rangeFilters) {
				results = results.filter((row) => {
					const rowVal = row[column];
					if (rowVal == null) return false;
					switch (op) {
						case 'gte':
							return rowVal >= value;
						case 'lte':
							return rowVal <= value;
						case 'gt':
							return rowVal > value;
						case 'lt':
							return rowVal < value;
					}
				});
			}
		}

		return results;
	}

	function applySorting(results: Row[], options?: FindOptions): Row[] {
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
		return results;
	}

	function applyPagination<T>(results: Row[], options?: FindOptions): T[] {
		let sliced = results;
		if (options?.range) {
			sliced = sliced.slice(options.range.from, options.range.to + 1);
		}
		if (options?.limit !== undefined) {
			sliced = sliced.slice(0, options.limit);
		}
		return sliced as T[];
	}

	function applyQuery<T>(rows: Row[], orgId: string, filters?: Record<string, unknown>, options?: FindOptions): T[] {
		const filtered = applyFilters(rows, orgId, filters, options);
		const sorted = applySorting(filtered, options);
		return applyPagination<T>(sorted, options);
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
			return applyQuery<T>(getRows(table), orgId, filters, options);
		},

		async findManyWithCount<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<FindResult<T>> {
			const filtered = applyFilters(getRows(table), orgId, filters, options);
			const count = filtered.length;
			const data = applyPagination<T>(applySorting(filtered, options), options);
			return { data, count };
		},

		async insert<T>(table: string, orgId: string, data: Record<string, unknown>): Promise<T> {
			const row: Row = { id: crypto.randomUUID(), ...data, organization_id: orgId };
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

		async deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number> {
			const rows = getRows(table);
			const idSet = new Set(ids);
			let deleted = 0;
			for (let i = rows.length - 1; i >= 0; i--) {
				if (rows[i].organization_id === orgId && idSet.has(rows[i].id as string)) {
					rows.splice(i, 1);
					deleted++;
				}
			}
			return deleted;
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
				const row: Row = { id: crypto.randomUUID(), ...data, organization_id: orgId };
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
		requireManageMembers() {},
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

interface RecordedNotification {
	target: 'user' | 'admins';
	orgId: string;
	userId?: string;
	excludeUserId?: string | null;
	notification: NotificationPayload;
}

export function createTestNotificationPort(): NotificationPort & { notifications: RecordedNotification[] } {
	const notifications: RecordedNotification[] = [];
	return {
		notifications,
		async notifyUser(orgId: string, userId: string, notification: NotificationPayload): Promise<void> {
			notifications.push({ target: 'user', orgId, userId, notification });
		},
		async notifyAdmins(orgId: string, excludeUserId: string | null, notification: NotificationPayload): Promise<void> {
			notifications.push({ target: 'admins', orgId, excludeUserId, notification });
		}
	};
}

/** Convenience: build a full UseCaseContext for tests. rawStore defaults to store (unscoped). */
export function createTestContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
	subscriptionAllowed?: boolean;
}): UseCaseContext & {
	store: ReturnType<typeof createInMemoryDataStore>;
	rawStore: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	subscription: ReturnType<typeof createTestSubscriptionPort>;
	notificationPort: ReturnType<typeof createTestNotificationPort>;
	billingPort: ReturnType<typeof createTestBillingPort>;
} {
	const store = createInMemoryDataStore();
	const auditPort = createTestAuditPort();
	const subscription = createTestSubscriptionPort(overrides?.subscriptionAllowed ?? true);
	const notificationPort = createTestNotificationPort();
	const billingPort = createTestBillingPort();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(overrides?.auth),
		audit: auditPort,
		auditPort,
		readOnlyGuard: createTestReadOnlyGuard(overrides?.readOnly ?? false),
		subscription,
		notifications: notificationPort,
		notificationPort,
		billing: billingPort,
		billingPort
	};
}

export function createTestSubscriptionPort(
	allowed = true,
	message?: string,
	availableSlots: number | null = null
): SubscriptionPort & { tierCacheInvalidated: boolean } {
	return {
		tierCacheInvalidated: false,
		async canAddPersonnel() {
			return allowed ? { allowed: true } : { allowed: false, message: message ?? 'Personnel limit reached' };
		},
		async getAvailablePersonnelSlots() {
			return availableSlots;
		},
		invalidateTierCache() {
			this.tierCacheInvalidated = true;
		},
		async getEffectiveTier(): Promise<EffectiveTier> {
			return {
				tier: 'unit',
				source: 'default',
				personnelCount: 0,
				personnelCap: Infinity,
				isReadOnly: false,
				giftExpiresAt: null,
				giftTier: null
			};
		},
		async getMonthlyExportCount() {
			return 0;
		}
	};
}

interface RecordedBillingCall {
	method: string;
	args: unknown[];
}

export function createTestBillingPort(): BillingPort & { calls: RecordedBillingCall[] } {
	const calls: RecordedBillingCall[] = [];
	return {
		calls,
		async createCheckoutSession(options) {
			calls.push({ method: 'createCheckoutSession', args: [options] });
			return { url: 'https://checkout.test/session', customerId: 'cus_test_123' };
		},
		async createPortalSession(customerId, returnUrl) {
			calls.push({ method: 'createPortalSession', args: [customerId, returnUrl] });
			return { url: 'https://portal.test/session' };
		},
		async cancelSubscription(subscriptionId) {
			calls.push({ method: 'cancelSubscription', args: [subscriptionId] });
		},
		async pauseSubscription(subscriptionId) {
			calls.push({ method: 'pauseSubscription', args: [subscriptionId] });
		},
		async resumeSubscription(subscriptionId) {
			calls.push({ method: 'resumeSubscription', args: [subscriptionId] });
		}
	};
}
