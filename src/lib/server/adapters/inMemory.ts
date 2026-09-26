/**
 * In-memory implementations of all port interfaces, used in unit and integration tests.
 *
 * Key exports:
 * - `createTestContext()` — full UseCaseContext wired to in-memory adapters.
 *   Use this as the starting point for most use-case tests.
 * - `createInMemoryDataStore()` — DataStore with a `.seed(table, rows)` method for
 *   pre-populating test data. Supports filters, sorting, pagination, and range filters.
 * - Individual port builders (`createTestAuthContext`, `createTestAuditPort`, etc.) for
 *   tests that only need specific ports.
 * - Port bundle builders (`createWritePortsContext`, `createQueryPortsContext`, etc.)
 *   matching the narrower port subsets accepted by individual use cases.
 *
 * Group scoping works automatically from `auth.scopeSet`.
 */
import type {
	CriticalTasksReadModelPort,
	DataStore,
	FindOptions,
	FindResult,
	AuthContext,
	AuditPort,
	ScopeEnforcementPort,
	NotificationPort,
	NotificationPayload,
	StoragePort,
	UseCaseContext,
	WritePorts,
	WriteWithNotificationsPorts,
	UserWritePorts,
	QueryPorts,
	QueryWithRawStorePorts
} from '../core/ports';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import { createScopedDataStore } from './scopedDataStore';
import { defaultScopeRules } from './scopeRules';
import { createInMemoryCriticalTasksReadModelAdapter } from './inMemoryCriticalTasksReadModel';

type Row = Record<string, unknown>;
type TableStore = Map<string, Row[]>;
type InMemoryDataStore = ReturnType<typeof createInMemoryDataStore>;
type SensitiveActionAuthorizer = UseCaseContext['sensitiveActionAuthorizer'];
type SensitiveActionAuthorizeInput = Parameters<SensitiveActionAuthorizer['authorize']>[0];
type SensitiveActionDecision = Awaited<ReturnType<SensitiveActionAuthorizer['authorize']>>;

function createInMemoryPersonnelOrganizationExportPort(
	rawStore: DataStore
): NonNullable<UseCaseContext['personnelOrganizationExport']> {
	return {
		listRows(actor, table) {
			return rawStore.findMany<Record<string, unknown>>(table, actor.orgId);
		}
	};
}

const FULL_CAPABILITY_MAP: CapabilityMap = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
};

type TestAuthContextOverrides = Partial<AuthContext> & Record<string, unknown>;

function getOrgColumn(table: string): string {
	switch (table) {
		case 'audit_logs':
		case 'data_exports':
		case 'dashboard_configs':
			return 'org_id';
		case 'organizations':
			return 'id';
		default:
			return 'organization_id';
	}
}

export function createInMemoryDataStore(): DataStore & { seed(table: string, rows: Row[]): void } {
	const tables: TableStore = new Map();

	function getRows(table: string): Row[] {
		if (!tables.has(table)) {
			tables.set(table, []);
		}
		return tables.get(table)!;
	}

	function matchesFilters(table: string, row: Row, orgId: string, filters?: Record<string, unknown>): boolean {
		const orgColumn = getOrgColumn(table);
		if (row[orgColumn] !== orgId) return false;
		if (!filters) return true;
		return Object.entries(filters).every(([key, value]) => row[key] === value);
	}

	function applyFilters(
		table: string,
		rows: Row[],
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FindOptions
	): Row[] {
		const allFilters = { ...filters, ...options?.filters };
		let results = rows.filter((row) =>
			matchesFilters(table, row, orgId, Object.keys(allFilters).length > 0 ? allFilters : undefined)
		);

		if (options?.inFilters) {
			for (const [key, values] of Object.entries(options.inFilters)) {
				results = results.filter((row) => values.includes(row[key]));
			}
		}

		if (options?.notInFilters) {
			for (const [key, values] of Object.entries(options.notInFilters)) {
				results = results.filter((row) => !values.includes(row[key]));
			}
		}

		if (options?.arrayContainedByFilters) {
			for (const [key, values] of Object.entries(options.arrayContainedByFilters)) {
				const allowedValues = new Set(values);
				results = results.filter((row) => {
					const rowValues = row[key];
					return Array.isArray(rowValues) && rowValues.every((value) => allowedValues.has(value));
				});
			}
		}

		if (options?.nonEmptyArrayFilters) {
			for (const key of options.nonEmptyArrayFilters) {
				results = results.filter((row) => {
					const rowValues = row[key];
					return Array.isArray(rowValues) && rowValues.length > 0;
				});
			}
		}

		if (options?.isNull) {
			for (const [key, shouldBeNull] of Object.entries(options.isNull)) {
				results = results.filter((row) => (shouldBeNull ? row[key] == null : row[key] != null));
			}
		}

		if (options?.ilikeFilters) {
			for (const [key, pattern] of Object.entries(options.ilikeFilters)) {
				// Convert SQL LIKE pattern to regex: % = .*, _ = .
				const regex = new RegExp('^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
				results = results.filter((row) => typeof row[key] === 'string' && regex.test(row[key] as string));
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

	function applyQuery<T>(
		table: string,
		rows: Row[],
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FindOptions
	): T[] {
		const filtered = applyFilters(table, rows, orgId, filters, options);
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
			const match = rows.find((row) => matchesFilters(table, row, orgId, filters));
			return (match as T) ?? null;
		},

		async findMany<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<T[]> {
			return applyQuery<T>(table, getRows(table), orgId, filters, options);
		},

		async findManyWithCount<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FindOptions
		): Promise<FindResult<T>> {
			const filtered = applyFilters(table, getRows(table), orgId, filters, options);
			const count = filtered.length;
			const data = applyPagination<T>(applySorting(filtered, options), options);
			return { data, count };
		},

		async listDistinctAuditActions(orgId: string, excludedActions: string[] = []): Promise<string[]> {
			const filtered = applyFilters('audit_logs', getRows('audit_logs'), orgId, undefined, {
				notInFilters: { action: excludedActions }
			});
			return [
				...new Set(filtered.map((row) => row.action).filter((value): value is string => typeof value === 'string'))
			].sort();
		},

		async insert<T>(table: string, orgId: string, data: Record<string, unknown>): Promise<T> {
			const row: Row = { id: crypto.randomUUID(), ...data, [getOrgColumn(table)]: orgId };
			getRows(table).push(row);
			return row as T;
		},

		async update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>): Promise<T> {
			const orgColumn = getOrgColumn(table);
			const rows = getRows(table);
			const index = rows.findIndex((row) => row.id === id && row[orgColumn] === orgId);
			if (index === -1) {
				throw new Error(`Record not found: ${table}/${id}`);
			}
			Object.assign(rows[index], data);
			return rows[index] as T;
		},

		async updateById<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
			const rows = getRows(table);
			const index = rows.findIndex((row) => row.id === id);
			if (index === -1) {
				throw new Error(`Record not found: ${table}/${id}`);
			}
			Object.assign(rows[index], data);
			return rows[index] as T;
		},

		async delete(table: string, orgId: string, id: string): Promise<void> {
			const orgColumn = getOrgColumn(table);
			const rows = getRows(table);
			const index = rows.findIndex((row) => row.id === id && row[orgColumn] === orgId);
			if (index === -1) {
				throw new Error(`Record not found: ${table}/${id}`);
			}
			rows.splice(index, 1);
		},

		async deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number> {
			const orgColumn = getOrgColumn(table);
			const rows = getRows(table);
			const idSet = new Set(ids);
			let deleted = 0;
			for (let i = rows.length - 1; i >= 0; i--) {
				if (rows[i][orgColumn] === orgId && idSet.has(rows[i].id as string)) {
					rows.splice(i, 1);
					deleted++;
				}
			}
			return deleted;
		},

		async deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void> {
			const rows = getRows(table);
			for (let i = rows.length - 1; i >= 0; i--) {
				if (matchesFilters(table, rows[i], orgId, filters)) {
					rows.splice(i, 1);
				}
			}
		},

		async deleteWhereAny(table: string, orgId: string, filterGroups: Array<Record<string, unknown>>): Promise<void> {
			if (filterGroups.length === 0) return;
			const rows = getRows(table);
			for (let i = rows.length - 1; i >= 0; i--) {
				if (filterGroups.some((filters) => matchesFilters(table, rows[i], orgId, filters))) {
					rows.splice(i, 1);
				}
			}
		},

		async insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[]): Promise<T[]> {
			const tableRows = getRows(table);
			const inserted: Row[] = [];
			for (const data of rows) {
				const row: Row = { id: crypto.randomUUID(), ...data, [getOrgColumn(table)]: orgId };
				tableRows.push(row);
				inserted.push(row);
			}
			return inserted as T[];
		},

		async upsertMany<T>(
			table: string,
			orgId: string,
			rows: Record<string, unknown>[],
			options: { onConflict: string }
		): Promise<T[]> {
			if (rows.length === 0) return [];

			const conflictColumns = options.onConflict
				.split(',')
				.map((column) => column.trim())
				.filter(Boolean);
			if (conflictColumns.length === 0) {
				throw new Error('upsertMany requires at least one conflict column');
			}

			const orgColumn = getOrgColumn(table);
			const tableRows = getRows(table);
			const upserted: Row[] = [];

			for (const data of rows) {
				const withOrg: Row = { ...data, [orgColumn]: orgId };
				const existing = tableRows.find(
					(row) => row[orgColumn] === orgId && conflictColumns.every((column) => row[column] === withOrg[column])
				);

				if (existing) {
					Object.assign(existing, withOrg, { id: existing.id });
					upserted.push(existing);
					continue;
				}

				const inserted: Row = { id: crypto.randomUUID(), ...withOrg };
				tableRows.push(inserted);
				upserted.push(inserted);
			}

			return upserted as T[];
		}
	};
}

export function createTestAuthContext(overrides?: TestAuthContextOverrides): AuthContext {
	const defaults: AuthContext = {
		userId: 'test-user',
		orgId: 'test-org',
		role: 'owner',
		isPrivileged: true,
		canManageMembers: true,
		capabilityMap: FULL_CAPABILITY_MAP,
		scopeSet: { kind: 'organization' } satisfies ScopeSet
	};

	return { ...defaults, ...overrides };
}

export function createTestScopeEnforcementPort(overrides?: Partial<ScopeEnforcementPort>): ScopeEnforcementPort {
	const defaults: ScopeEnforcementPort = {
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
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
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

function createScopedTestStores(auth: AuthContext): { store: InMemoryDataStore; rawStore: InMemoryDataStore } {
	const rawStore = createInMemoryDataStore();
	if (auth.scopeSet.kind === 'organization') {
		return { store: rawStore, rawStore };
	}

	const scopedStore = Object.assign(createScopedDataStore(rawStore, auth.scopeSet, defaultScopeRules), {
		seed: rawStore.seed
	}) as InMemoryDataStore;

	return {
		store: scopedStore,
		rawStore
	};
}

async function inMemoryPersonnelRows(
	rawStore: DataStore,
	actor: AuthContext,
	status: 'active' | 'all',
	ids?: string[]
) {
	if (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0) return [];
	if (ids && ids.length === 0) return [];
	return rawStore.findMany<Row>('personnel', actor.orgId, undefined, {
		select: '*, groups(name)',
		...(status === 'active' ? { isNull: { archived_at: true } } : {}),
		inFilters: {
			...(actor.scopeSet.kind === 'groups' ? { group_id: actor.scopeSet.groupIds } : {}),
			...(ids ? { id: ids } : {})
		},
		orderBy: [
			{ column: 'last_name', ascending: true },
			{ column: 'first_name', ascending: true },
			{ column: 'id', ascending: true }
		]
	});
}

function createInMemoryPersonnelAwardAcknowledgementPort(
	rawStore: DataStore
): NonNullable<UseCaseContext['personnelAwardAcknowledgement']> {
	return {
		async listAcknowledgedPersonnelIds(actor) {
			if (!actor.isPrivileged && actor.capabilityMap.personnel === 'none') return [];

			const [people, acknowledgements] = await Promise.all([
				inMemoryPersonnelRows(rawStore, actor, 'all'),
				rawStore.findMany<Row>('personnel_extended_info', actor.orgId, undefined, {
					isNull: { award_tracking_acknowledged_at: false }
				})
			]);
			const visibleIds = new Set(people.map((person) => person.id));
			return acknowledgements
				.map((row) => row.personnel_id as string)
				.filter((id) => visibleIds.has(id))
				.sort();
		}
	};
}

function createInMemoryPersonnelArtifactWritePort(
	rawStore: DataStore,
	storage: StoragePort
): NonNullable<UseCaseContext['personnelArtifactWrites']> {
	return {
		async forPerson(actor, personnelId) {
			const person = await rawStore.findOne<{ group_id: string | null }>('personnel', actor.orgId, {
				id: personnelId
			});
			if (!person) throw Object.assign(new Error('Personnel record not found'), { status: 404 });
			if (
				!actor.isPrivileged &&
				(actor.capabilityMap.personnel === 'none' || actor.capabilityMap.personnel === 'view')
			) {
				throw Object.assign(new Error('You do not have permission to use personnel data'), { status: 403 });
			}
			if (
				!actor.isPrivileged &&
				actor.scopeSet.kind === 'groups' &&
				(!person.group_id || !actor.scopeSet.groupIds.includes(person.group_id))
			) {
				throw Object.assign(new Error('You do not have access to records outside your assigned scope'), {
					status: 403
				});
			}
			return {
				find<T>(table: string, id: string) {
					return rawStore.findOne<T>(table, actor.orgId, { id, personnel_id: personnelId });
				},
				insert<T>(table: string, data: Record<string, unknown>) {
					if ('organization_id' in data || 'personnel_id' in data) {
						throw Object.assign(new Error('Artifact Person is bound by the write session'), { status: 400 });
					}
					return rawStore.insert<T>(table, actor.orgId, { ...data, personnel_id: personnelId });
				},
				async update<T>(table: string, id: string, patch: Record<string, unknown>) {
					if ('id' in patch || 'organization_id' in patch || 'personnel_id' in patch) {
						throw Object.assign(new Error('Artifact identity cannot be changed'), { status: 400 });
					}
					const row = await rawStore.findOne(table, actor.orgId, { id, personnel_id: personnelId });
					if (!row) throw new Error('Artifact not found');
					return rawStore.update<T>(table, actor.orgId, id, patch);
				},
				async delete(table: string, id: string) {
					const row = await rawStore.findOne(table, actor.orgId, { id, personnel_id: personnelId });
					if (!row) return;
					await rawStore.delete(table, actor.orgId, id);
				},
				async sumActiveDocumentBytes() {
					const rows = await rawStore.findMany<{ file_size_bytes: number }>(
						'personnel_documents',
						actor.orgId,
						{ personnel_id: personnelId },
						{ isNull: { archived_at: true } }
					);
					return rows.reduce((sum, row) => sum + (row.file_size_bytes ?? 0), 0);
				},
				async uploadFile(kind: 'counseling' | 'document', path: string, file: unknown) {
					if (!(file instanceof File)) throw Object.assign(new Error('An artifact file is required'), { status: 400 });
					const prefix =
						kind === 'counseling'
							? `${actor.orgId}/counseling-records/${personnelId}/`
							: `${actor.orgId}/personnel/${personnelId}/documents/`;
					if (!path.startsWith(prefix) || path.length === prefix.length) {
						throw Object.assign(new Error('Artifact file path is outside the authorized Person'), { status: 400 });
					}
					await storage.upload(kind === 'counseling' ? 'counseling-files' : 'personnel-documents', path, file);
				},
				async removeFile(kind: 'counseling' | 'document', path: string) {
					const prefix =
						kind === 'counseling'
							? `${actor.orgId}/counseling-records/${personnelId}/`
							: `${actor.orgId}/personnel/${personnelId}/documents/`;
					if (!path.startsWith(prefix) || path.length === prefix.length) {
						throw Object.assign(new Error('Artifact file path is outside the authorized Person'), { status: 400 });
					}
					await storage.remove(kind === 'counseling' ? 'counseling-files' : 'personnel-documents', [path]);
				}
			};
		},
		async forPeople(actor, personnelIds) {
			const ids = [...new Set(personnelIds)];
			if (ids.length === 0) throw Object.assign(new Error('At least one Person is required'), { status: 400 });
			const people = await rawStore.findMany<{ id: string; group_id: string | null }>(
				'personnel',
				actor.orgId,
				undefined,
				{
					inFilters: { id: ids }
				}
			);
			if (people.length !== ids.length) throw Object.assign(new Error('Personnel record not found'), { status: 404 });
			if (!actor.isPrivileged && actor.capabilityMap.personnel !== 'configure') {
				throw Object.assign(new Error('You do not have permission to use personnel data'), { status: 403 });
			}
			const groupIds = actor.scopeSet.kind === 'groups' ? actor.scopeSet.groupIds : null;
			if (
				!actor.isPrivileged &&
				groupIds &&
				people.some((person) => !person.group_id || !groupIds.includes(person.group_id))
			) {
				throw Object.assign(new Error('You do not have access to records outside your assigned scope'), {
					status: 403
				});
			}
			const allowed = new Set(ids);
			return {
				async listCandidates(table, options) {
					const rows = await rawStore.findMany<{ id: string; personnel_id: string }>(
						table,
						actor.orgId,
						{
							...(options.archivedAt === null ? {} : { archived_at: options.archivedAt }),
							...(options.status ? { status: options.status } : {})
						},
						{
							inFilters: { personnel_id: ids },
							...(options.archivedAt === null ? { isNull: { archived_at: true } } : {})
						}
					);
					return rows.map((row) => ({ id: row.id, personnelId: row.personnel_id }));
				},
				async update(table, row, patch) {
					if (!allowed.has(row.personnelId)) {
						throw Object.assign(new Error('Artifact Person is outside the authorized batch'), { status: 403 });
					}
					if ('id' in patch || 'organization_id' in patch || 'personnel_id' in patch) {
						throw Object.assign(new Error('Artifact identity cannot be changed'), { status: 400 });
					}
					const existing = await rawStore.findOne(table, actor.orgId, {
						id: row.id,
						personnel_id: row.personnelId
					});
					if (!existing) return;
					await rawStore.update(table, actor.orgId, row.id, patch);
				}
			};
		}
	};
}

function inMemoryPersonnelFromRow(row: Row) {
	return {
		id: row.id as string,
		slug: row.slug as string,
		rank: row.rank as string,
		lastName: row.last_name as string,
		firstName: row.first_name as string,
		mos: (row.mos as string) ?? '',
		clinicRole: (row.clinic_role as string) ?? '',
		ets: (row.ets as string | null) ?? null,
		deros: (row.deros as string | null) ?? null,
		groupId: (row.group_id as string | null) ?? null,
		groupName: ((row.groups as { name?: string } | null)?.name as string) ?? '',
		archivedAt: (row.archived_at as string | null) ?? null
	};
}

function createInMemoryPersonnelCalendarRosterPort(
	rawStore: DataStore
): NonNullable<UseCaseContext['personnelCalendarRoster']> {
	return {
		async listActive(actor) {
			return (await inMemoryPersonnelRows(rawStore, actor, 'active')).map(inMemoryPersonnelFromRow);
		},
		async listAssigneeIds(actor) {
			return (await inMemoryPersonnelRows(rawStore, actor, 'all')).map((row) => row.id as string);
		},
		async findGroupIds(actor, ids) {
			return new Map(
				(await inMemoryPersonnelRows(rawStore, actor, 'all', ids)).map((row) => [
					row.id as string,
					(row.group_id as string) ?? null
				])
			);
		}
	};
}

function createInMemoryPersonnelOnboardingRosterPort(rawStore: DataStore): UseCaseContext['personnelOnboardingRoster'] {
	return {
		async listRoster(actor, status) {
			return (await inMemoryPersonnelRows(rawStore, actor, status)).map(inMemoryPersonnelFromRow);
		},
		async findGroupIds(actor, ids) {
			return new Map(
				(await inMemoryPersonnelRows(rawStore, actor, 'all', ids)).map((row) => [
					row.id as string,
					(row.group_id as string | null) ?? null
				])
			);
		}
	};
}

function createInMemoryPersonnelTrainingRosterPort(rawStore: DataStore): UseCaseContext['personnelTrainingRoster'] {
	const listActive = async (actor: AuthContext) =>
		(await inMemoryPersonnelRows(rawStore, actor, 'active')).map(inMemoryPersonnelFromRow);
	return {
		listActiveForWorkspace: listActive,
		listActiveForReports: listActive,
		async findGroupIdsForWrites(actor, ids) {
			return new Map(
				(await inMemoryPersonnelRows(rawStore, actor, 'all', ids)).map((row) => [
					row.id as string,
					(row.group_id as string | null) ?? null
				])
			);
		}
	};
}

function createInMemoryPersonnelCriticalTasksRosterPort(
	rawStore: DataStore
): UseCaseContext['personnelCriticalTasksRoster'] {
	return {
		async listActiveForReadiness(actor) {
			return (await inMemoryPersonnelRows(rawStore, actor, 'active')).map(inMemoryPersonnelFromRow);
		},
		async findForHistory(actor, personnelId) {
			const rows = await inMemoryPersonnelRows(rawStore, actor, 'all', [personnelId]);
			return rows[0] ? inMemoryPersonnelFromRow(rows[0]) : null;
		},
		async listForBatchImport(actor) {
			return (await inMemoryPersonnelRows(rawStore, actor, 'all')).map(inMemoryPersonnelFromRow);
		},
		async findForCompletionWrite(actor, personnelId) {
			const rows = await inMemoryPersonnelRows(rawStore, actor, 'all', [personnelId]);
			const row = rows[0];
			return row
				? {
						groupId: (row.group_id as string | null) ?? null,
						archivedAt: (row.archived_at as string | null) ?? null
					}
				: null;
		}
	};
}

function createInMemoryTrainingOnboardingReferencesPort(
	rawStore: DataStore
): UseCaseContext['trainingOnboardingReferences'] {
	return {
		async listTypes(actor) {
			const rows = await rawStore.findMany<Row>('training_types', actor.orgId, undefined, {
				orderBy: [
					{ column: 'sort_order', ascending: true },
					{ column: 'id', ascending: true }
				]
			});
			return rows.map((row) => ({
				id: row.id as string,
				name: row.name as string,
				description: (row.description as string | null) ?? null,
				expirationMonths: (row.expiration_months as number | null) ?? null,
				warningDaysYellow: (row.warning_days_yellow as number) ?? 60,
				warningDaysOrange: (row.warning_days_orange as number) ?? 30,
				appliesToRoles: (row.applies_to_roles as string[]) ?? [],
				appliesToMos: (row.applies_to_mos as string[]) ?? [],
				appliesToRanks: (row.applies_to_ranks as string[]) ?? [],
				excludedRoles: (row.excluded_roles as string[]) ?? [],
				excludedMos: (row.excluded_mos as string[]) ?? [],
				excludedRanks: (row.excluded_ranks as string[]) ?? [],
				color: (row.color as string) ?? '#6b7280',
				sortOrder: (row.sort_order as number) ?? 0,
				expirationDateOnly: (row.expiration_date_only as boolean) ?? false,
				canBeExempted: (row.can_be_exempted as boolean) ?? false,
				exemptPersonnelIds: (row.exempt_personnel_ids as string[]) ?? [],
				isOptional: (row.is_optional as boolean) ?? false
			}));
		},
		async completedTypeIds(actor, personnelIds, trainingTypeIds) {
			if (
				personnelIds.length === 0 ||
				trainingTypeIds.length === 0 ||
				(actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)
			) {
				return new Map();
			}
			const [personnel, types] = await Promise.all([
				inMemoryPersonnelRows(rawStore, actor, 'all', personnelIds),
				rawStore.findMany<{ id: string }>('training_types', actor.orgId, undefined, {
					inFilters: { id: trainingTypeIds }
				})
			]);
			const inScopeIds = new Set(personnel.map((person) => person.id as string));
			const inScopeTypeIds = types.map((type) => type.id);
			if (inScopeIds.size === 0 || inScopeTypeIds.length === 0) return new Map();
			const records = await rawStore.findMany<{ personnel_id: string; training_type_id: string }>(
				'personnel_trainings',
				actor.orgId,
				undefined,
				{ inFilters: { personnel_id: [...inScopeIds], training_type_id: inScopeTypeIds } }
			);
			const completed = new Map<string, Set<string>>();
			for (const record of records) {
				const types = completed.get(record.personnel_id) ?? new Set<string>();
				types.add(record.training_type_id);
				completed.set(record.personnel_id, types);
			}
			return completed;
		}
	};
}

function createInMemoryOnboardingCalendarMarkersPort(
	rawStore: DataStore,
	auth: AuthContext
): UseCaseContext['onboardingCalendarMarkers'] {
	return {
		async listActivePersonnelIds(orgId) {
			const organizationWide = auth.scopeSet.kind === 'organization' || auth.role === 'owner' || auth.role === 'admin';
			if (
				orgId !== auth.orgId ||
				(!organizationWide && auth.scopeSet.kind === 'groups' && auth.scopeSet.groupIds.length === 0)
			) {
				return [];
			}
			const [onboardings, personnel] = await Promise.all([
				rawStore.findMany<{ personnel_id: string }>('personnel_onboardings', orgId, { status: 'in_progress' }),
				rawStore.findMany<{ id: string; group_id: string | null }>('personnel', orgId)
			]);
			const visibleIds = new Set(
				personnel
					.filter((person) =>
						organizationWide
							? true
							: person.group_id !== null &&
								auth.scopeSet.kind === 'groups' &&
								auth.scopeSet.groupIds.includes(person.group_id)
					)
					.map((person) => person.id)
			);
			return [...new Set(onboardings.map((row) => row.personnel_id).filter((id) => visibleIds.has(id)))].sort();
		}
	};
}

/** Convenience: build a full UseCaseContext for tests. rawStore defaults to store (unscoped). */
export function createTestContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	scope?: Partial<ScopeEnforcementPort>;

	sensitiveActionDecision?: Partial<SensitiveActionDecision>;
}): UseCaseContext & {
	store: ReturnType<typeof createInMemoryDataStore>;
	rawStore: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	notificationPort: ReturnType<typeof createTestNotificationPort>;
	storagePort: ReturnType<typeof createTestStoragePort>;
	sensitiveActionAuthorizer: ReturnType<typeof createTestSensitiveActionAuthorizer>;
} {
	const auth = createTestAuthContext(overrides?.auth);
	const scope = createTestScopeEnforcementPort(overrides?.scope);
	const { store, rawStore } = createScopedTestStores(auth);
	const auditPort = createTestAuditPort();
	const notificationPort = createTestNotificationPort();
	const storagePort = createTestStoragePort();
	const sensitiveActionAuthorizer = createTestSensitiveActionAuthorizer(overrides?.sensitiveActionDecision);
	const criticalTasksReadModel = createInMemoryCriticalTasksReadModelAdapter(rawStore);
	return {
		store,
		rawStore,
		auth,
		scope,
		audit: auditPort,
		auditPort,

		notifications: notificationPort,
		notificationPort,
		storage: storagePort,
		storagePort,
		sensitiveActionAuthorizer,
		criticalTasksReadModel,
		personnelAwardAcknowledgement: createInMemoryPersonnelAwardAcknowledgementPort(rawStore),
		personnelArtifactWrites: createInMemoryPersonnelArtifactWritePort(rawStore, storagePort),
		personnelOrganizationExport: createInMemoryPersonnelOrganizationExportPort(rawStore),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore),
		onboardingCalendarMarkers: createInMemoryOnboardingCalendarMarkersPort(rawStore, auth)
	};
}

export function createTestSensitiveActionAuthorizer(
	decisionOverrides: Partial<SensitiveActionDecision> = {}
): SensitiveActionAuthorizer & { requests: SensitiveActionAuthorizeInput[] } {
	const requests: SensitiveActionAuthorizeInput[] = [];
	return {
		requests,
		async authorize(input) {
			requests.push(input);
			return {
				allowed: true,
				action: input.action,
				reason: 'allowed.recentSession',
				actorUserId: input.actorUserId,
				target: input.target,
				currentAssuranceLevel: 'aal1',
				nextAssuranceLevel: 'aal1',
				sessionAgeMs: 60_000,
				recentSessionWindowMs: 15 * 60 * 1000,
				requiresStepUp: false,
				...decisionOverrides
			};
		}
	};
}

interface StoredFile {
	bucket: string;
	path: string;
	data: File | Blob | ArrayBuffer;
}

export function createTestStoragePort(): StoragePort & { files: StoredFile[] } {
	const files: StoredFile[] = [];
	return {
		files,
		async upload(bucket: string, path: string, data: File | Blob | ArrayBuffer): Promise<void> {
			// Remove existing file at same path (upsert behavior)
			const idx = files.findIndex((f) => f.bucket === bucket && f.path === path);
			if (idx >= 0) files.splice(idx, 1);
			files.push({ bucket, path, data });
		},
		async remove(bucket: string, paths: string[]): Promise<void> {
			for (const p of paths) {
				const idx = files.findIndex((f) => f.bucket === bucket && f.path === p);
				if (idx >= 0) files.splice(idx, 1);
			}
		},
		async createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string> {
			const exists = files.some((f) => f.bucket === bucket && f.path === path);
			if (!exists) throw new Error(`File not found: ${bucket}/${path}`);
			return `https://storage.test/${bucket}/${path}?expires=${expiresInSeconds}`;
		}
	};
}

// ---------------------------------------------------------------------------
// Port bundle context builders — return exactly the ports in each bundle
// ---------------------------------------------------------------------------

export function createWritePortsContext(options?: { auth?: Parameters<typeof createTestAuthContext>[0] }): WritePorts &
	Pick<
		UseCaseContext,
		| 'personnelTrainingRoster'
		| 'personnelCriticalTasksRoster'
		| 'personnelCalendarRoster'
		| 'personnelOnboardingRoster'
		| 'trainingOnboardingReferences'
	> & {
		store: ReturnType<typeof createInMemoryDataStore>;
		audit: ReturnType<typeof createTestAuditPort>;
		criticalTasksReadModel: CriticalTasksReadModelPort;
	} {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTasksReadModel = createInMemoryCriticalTasksReadModelAdapter(rawStore);
	return {
		store,
		rawStore,
		auth,
		audit: createTestAuditPort(),

		criticalTasksReadModel,
		personnelArtifactWrites: createInMemoryPersonnelArtifactWritePort(rawStore, createTestStoragePort()),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore)
	};
}

export function createWriteWithNotificationsPortsContext(options?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
}): WriteWithNotificationsPorts &
	Pick<
		UseCaseContext,
		| 'personnelTrainingRoster'
		| 'personnelCriticalTasksRoster'
		| 'personnelCalendarRoster'
		| 'personnelOnboardingRoster'
		| 'trainingOnboardingReferences'
	> & {
		store: ReturnType<typeof createInMemoryDataStore>;
		audit: ReturnType<typeof createTestAuditPort>;
		notifications: ReturnType<typeof createTestNotificationPort>;
		criticalTasksReadModel: CriticalTasksReadModelPort;
	} {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTasksReadModel = createInMemoryCriticalTasksReadModelAdapter(rawStore);
	return {
		store,
		rawStore,
		auth,
		audit: createTestAuditPort(),

		notifications: createTestNotificationPort(),
		criticalTasksReadModel,
		personnelArtifactWrites: createInMemoryPersonnelArtifactWritePort(rawStore, createTestStoragePort()),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore)
	};
}

export function createUserWritePortsContext(options?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
}): UserWritePorts & {
	store: ReturnType<typeof createInMemoryDataStore>;
	audit: ReturnType<typeof createTestAuditPort>;
} {
	const auth = createTestAuthContext(options?.auth);
	const { store } = createScopedTestStores(auth);
	return {
		store,
		auth,
		audit: createTestAuditPort()
	};
}

export function createQueryPortsContext(options?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
}): QueryPorts & {
	store: ReturnType<typeof createInMemoryDataStore>;
	criticalTasksReadModel: CriticalTasksReadModelPort;
} {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTasksReadModel = createInMemoryCriticalTasksReadModelAdapter(rawStore);
	return {
		store,
		auth,
		criticalTasksReadModel,
		personnelAwardAcknowledgement: createInMemoryPersonnelAwardAcknowledgementPort(rawStore),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore),
		onboardingCalendarMarkers: createInMemoryOnboardingCalendarMarkersPort(rawStore, auth)
	};
}

export function createQueryWithRawStorePortsContext(options?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
}): QueryWithRawStorePorts & {
	store: ReturnType<typeof createInMemoryDataStore>;
	rawStore: ReturnType<typeof createInMemoryDataStore>;
	criticalTasksReadModel: CriticalTasksReadModelPort;
} {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTasksReadModel = createInMemoryCriticalTasksReadModelAdapter(rawStore);
	return {
		store,
		auth,
		rawStore,
		criticalTasksReadModel,
		personnelAwardAcknowledgement: createInMemoryPersonnelAwardAcknowledgementPort(rawStore),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore)
	};
}
