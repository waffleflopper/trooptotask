import type { PersonnelArtifactReadPersistence } from '$features/personnel/contracts';
import type {
	CounselingRecordRow,
	PersonnelDocumentRow,
	FollowUpRow,
	LeaderNoteRow
} from '$features/personnel/contracts';
import type { PersonnelArtifactRef } from '$features/personnel/contracts';
import type { PersonnelSheetPersistence, PersonnelWorkbookHistoryReader } from '$features/personnel/contracts';
import type { RankCatalogPersistence } from '$features/personnel/contracts';
import type {
	OrganizationSettingsMembershipRow,
	OrganizationSettingsInvitationRow,
	OrganizationSettingsInvitationDeliveryRow,
	OrganizationOwnershipCandidateMembershipRow
} from '$features/organization/contracts';
import type { OnboardingCatalogPersistence, OnboardingWorkflowPersistence } from '$features/onboarding/contracts';
import type { TrainingCatalogPersistence, TrainingCompletionPersistence } from '$features/training/contracts';
import { loadOrganizationMemberLabels, type OrganizationMemberLabelRow } from '$features/organization/index.server';
import {
	createInMemoryPersonnelRecordPersistence,
	createInMemoryPersonnelRosterReader,
	createInMemoryGroupPersistence,
	createInMemorySelfPinPersistence
} from '$features/personnel/inMemoryPersonnelPersistence.server';
import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { createRequestOrganizationExportContext } from './requestContexts.server';

import type { FixtureRowStore, FixtureFindOptions, FixtureFindResult } from './test-support/inMemoryRows.types';
import type { PersonnelScopeEnforcement } from '$features/personnel/contracts';
import type { StoragePort } from '$lib/storage/contracts';
import type { AuditEvent, AuditPort } from '$lib/audit/contracts';
import type { CapabilityMap, OrganizationAccessGrant, ScopeSet } from '$lib/access/memberAccessShape';
import type {
	AssignmentSlotChange,
	CalendarAssignmentReader,
	CalendarAssignmentReplacementPort,
	CalendarAvailabilityRemovalPort,
	CalendarAvailabilityPersistence,
	CalendarCatalogPersistence,
	SavedAssignment
} from '$features/calendar/contracts';
import type {
	CriticalTaskCompletionPersistence,
	CriticalTaskLibraryPersistence,
	CriticalTasksReadModelPort
} from '$features/critical-tasks/contracts';
import type { DataExportLifecycleWriter } from '$features/data-export/index.server';
import type { FeedbackExportRow } from '$features/feedback/index.server';
import type {
	SensitiveActionAuthorizeInput,
	SensitiveActionAuthorizer,
	SensitiveActionDecision
} from '$features/identity/contracts';
import type { NotificationDeliveryPort, NotificationPayload } from '$features/notifications/contracts';
import type { NotificationStore } from '$features/notifications/contracts.server';
import type {
	OnboardingCalendarMarkersPort,
	OnboardingInactiveStepRemovalPort,
	OnboardingLifecycleTransitionPort,
	OnboardingNoteAppendPort,
	OnboardingPacketCreationPort,
	OnboardingReconciliationPort
} from '$features/onboarding/contracts';
import type {
	OrganizationPolicyWritePort,
	OrganizationRawExportReader,
	OrganizationSettingsReader
} from '$features/organization/contracts';
import type {
	PersonnelArtifactWritePort,
	PersonnelAwardAcknowledgementPort,
	PersonnelCalendarRosterPort,
	PersonnelCriticalTasksRosterPort,
	PersonnelOnboardingRosterPort,
	PersonnelOrganizationExportPort,
	PersonnelRatingSchemeRosterPort,
	PersonnelTrainingRosterPort
} from '$features/personnel/contracts';
import type { RatingSchemeDuePort, RatingSchemePersistence } from '$features/rating-scheme/contracts';
import type { SignInRosterFileWritePort } from '$features/sign-in-rosters/contracts';
import type { TrainingOnboardingReferencesPort } from '$features/training/contracts';
import { createScopedFixtureRows } from './test-support/scopedFixtureRows';
import { fixtureScopeRules } from './test-support/fixtureScopeRules';
import { RequestFailure } from '$lib/errors';

type Row = Record<string, unknown>;
type TableStore = Map<string, Row[]>;
type InMemoryDataStore = ReturnType<typeof createInMemoryDataStore>;

function createInMemorySignInRosterFileWritePort(storage: StoragePort): SignInRosterFileWritePort {
	return {
		async forRoster(actor, rosterId) {
			function assertPath(path: string) {
				const prefix = `${actor.orgId}/sign-in-rosters/${rosterId}/`;
				if (
					!path.startsWith(prefix) ||
					path.length === prefix.length ||
					path.split('/').some((part) => part === '.' || part === '..')
				)
					throw new RequestFailure(400, 'Scan path is outside the authorized roster');
			}
			return {
				async upload(path, file) {
					if (!(file instanceof File)) throw new RequestFailure(400, 'A scan file is required');
					assertPath(path);
					await storage.upload('counseling-files', path, file, { upsert: false });
					return { async complete() {} };
				},
				async remove(path) {
					assertPath(path);
					await storage.remove('counseling-files', [path]);
				},
				async removePrevious(path) {
					assertPath(path);
					await storage.remove('counseling-files', [path]);
				}
			};
		}
	};
}

function createInMemoryPersonnelOrganizationExportPort(rawStore: FixtureRowStore): PersonnelOrganizationExportPort {
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

type TestAuthContextOverrides = Partial<OrganizationAccessGrant> & Record<string, unknown>;

type TestContextOptions = {
	onboardingCatalogFactory?: (store: FixtureRowStore, orgId: string) => OnboardingCatalogPersistence;
	onboardingWorkflowFactory?: (store: FixtureRowStore, orgId: string) => OnboardingWorkflowPersistence;
	trainingCatalogFactory?: (store: FixtureRowStore, orgId: string) => TrainingCatalogPersistence;
	trainingCompletionsFactory?: (store: FixtureRowStore, orgId: string) => TrainingCompletionPersistence;
	auth?: Parameters<typeof createTestAuthContext>[0];
	calendarCatalogsFactory?: (rawStore: FixtureRowStore, orgId: string) => CalendarCatalogPersistence;
	calendarAvailabilityFactory?: (
		rawStore: FixtureRowStore,
		auth: OrganizationAccessGrant,
		removal: CalendarAvailabilityRemovalPort
	) => CalendarAvailabilityPersistence;
	calendarAssignmentsFactory?: (rawStore: FixtureRowStore, orgId: string) => CalendarAssignmentReader;
	ratingSchemeFactory?: (rawStore: FixtureRowStore, orgId: string) => RatingSchemePersistence;
	criticalTaskLibraryFactory?: (rawStore: FixtureRowStore, orgId: string) => CriticalTaskLibraryPersistence;
	criticalTaskCompletionsFactory?: (rawStore: FixtureRowStore, orgId: string) => CriticalTaskCompletionPersistence;
	criticalTasksReadModelFactory?: (
		rawStore: FixtureRowStore,
		criticalTaskLibrary: CriticalTaskLibraryPersistence,
		criticalTaskCompletions: CriticalTaskCompletionPersistence
	) => CriticalTasksReadModelPort;
	onboardingReconciliation?: OnboardingReconciliationPort;
	onboardingNoteAppend?: OnboardingNoteAppendPort;
	onboardingLifecycleTransition?: OnboardingLifecycleTransitionPort;
	onboardingInactiveStepRemoval?: OnboardingInactiveStepRemovalPort;
	onboardingPacketCreation?: OnboardingPacketCreationPort;
};

function createTestOnboardingPersistence(store: FixtureRowStore, orgId: string, options?: TestContextOptions) {
	async function unavailable(): Promise<never> {
		throw new Error('Bind the owned Onboarding persistence provider in this test context');
	}
	return {
		onboardingCatalog:
			options?.onboardingCatalogFactory?.(store, orgId) ??
			({
				listTemplates: unavailable,
				listSteps: unavailable,
				findTemplate: unavailable,
				findTemplateByName: unavailable,
				findStep: unavailable,
				findStepByTemplateAndName: unavailable,
				readStarterReadiness: unavailable,
				countEstimatedSteps: unavailable,
				createTemplate: unavailable,
				updateTemplate: unavailable,
				deleteTemplate: unavailable,
				createStep: unavailable,
				createSteps: unavailable,
				updateStep: unavailable,
				deleteStep: unavailable,
				deleteStepsForTemplate: unavailable
			} satisfies OnboardingCatalogPersistence),
		onboardingWorkflow:
			options?.onboardingWorkflowFactory?.(store, orgId) ??
			({
				listPackets: unavailable,
				listSavedActivePackets: unavailable,
				findPacketReference: unavailable,
				findStepReference: unavailable,
				listActivePacketIdsForPersonnel: unavailable,
				listIncompleteActiveStepIds: unavailable,
				saveCheckboxCompletion: unavailable,
				savePaperworkProgress: unavailable,
				listPacketIdsUsingTemplate: unavailable,
				clearPacketTemplate: unavailable
			} satisfies OnboardingWorkflowPersistence)
	};
}

function createTestTrainingPersistence(store: FixtureRowStore, orgId: string, options?: TestContextOptions) {
	async function unavailable(): Promise<never> {
		throw new Error('Bind the owned Training persistence provider in this test context');
	}
	return {
		trainingCatalog:
			options?.trainingCatalogFactory?.(store, orgId) ??
			({
				listTypes: unavailable,
				listViews: unavailable,
				listTypeLabels: unavailable,
				listRankApplicabilityReferences: unavailable,
				countTypesEstimated: unavailable,
				findTypeByName: unavailable,
				listExistingTypeNames: unavailable,
				hasTypes: unavailable,
				findTypeTiming: unavailable,
				listTypeImportReferences: unavailable,
				findTypeId: unavailable,
				createType: unavailable,
				patchType: unavailable,
				deleteType: unavailable,
				createView: unavailable,
				patchView: unavailable,
				deleteView: unavailable
			} satisfies TrainingCatalogPersistence),
		trainingCompletions:
			options?.trainingCompletionsFactory?.(store, orgId) ??
			({
				listCompletions: unavailable,
				findResource: unavailable,
				findPair: unavailable,
				listPairReferences: unavailable,
				listPersonReadinessFacts: unavailable,
				listPersonExportFacts: unavailable,
				createRecord: unavailable,
				patchRecord: unavailable,
				deleteRecord: unavailable,
				upsertCompleted: unavailable
			} satisfies TrainingCompletionPersistence)
	};
}

function unavailableCalendarPersistence(): never {
	throw new Error('Bind the owned Calendar persistence provider in this test context');
}

function createTestCalendarPersistence(
	rawStore: FixtureRowStore,
	store: FixtureRowStore,
	auth: OrganizationAccessGrant,
	options?: TestContextOptions
): {
	calendarCatalogs: CalendarCatalogPersistence;
	calendarAvailability: CalendarAvailabilityPersistence;
	calendarAssignments: CalendarAssignmentReader;
} {
	return {
		calendarCatalogs:
			options?.calendarCatalogsFactory?.(rawStore, auth.orgId) ??
			({
				listStatusTypes: unavailableCalendarPersistence,
				listStatusTypeLabels: unavailableCalendarPersistence,
				createStatusType: unavailableCalendarPersistence,
				updateStatusType: unavailableCalendarPersistence,
				deleteStatusType: unavailableCalendarPersistence,
				listAssignmentTypes: unavailableCalendarPersistence,
				listAssignmentTypeTargets: unavailableCalendarPersistence,
				createAssignmentType: unavailableCalendarPersistence,
				updateAssignmentType: unavailableCalendarPersistence,
				deleteAssignmentType: unavailableCalendarPersistence,
				listSpecialDays: unavailableCalendarPersistence,
				createSpecialDay: unavailableCalendarPersistence,
				updateSpecialDay: unavailableCalendarPersistence,
				deleteSpecialDay: unavailableCalendarPersistence,
				deleteFederalHolidays: unavailableCalendarPersistence,
				createFederalHolidays: unavailableCalendarPersistence
			} satisfies CalendarCatalogPersistence),
		calendarAvailability:
			options?.calendarAvailabilityFactory?.(
				rawStore,
				auth,
				createInMemoryCalendarAvailabilityRemovalPort(rawStore, store, auth.orgId)
			) ??
			({
				listOverlapping: unavailableCalendarPersistence,
				listPersonnelHistory: unavailableCalendarPersistence,
				findReference: unavailableCalendarPersistence,
				create: unavailableCalendarPersistence,
				update: unavailableCalendarPersistence,
				delete: unavailableCalendarPersistence,
				createMany: unavailableCalendarPersistence,
				findPersonnelIds: unavailableCalendarPersistence,
				deleteIds: unavailableCalendarPersistence
			} satisfies CalendarAvailabilityPersistence),
		calendarAssignments:
			options?.calendarAssignmentsFactory?.(rawStore, auth.orgId) ??
			({
				listRange: unavailableCalendarPersistence,
				listDayReferences: unavailableCalendarPersistence,
				listSlotReferences: unavailableCalendarPersistence
			} satisfies CalendarAssignmentReader)
	};
}

function unavailableOnboardingPacketCreation(): OnboardingPacketCreationPort {
	return {
		async create() {
			throw new Error('Bind the owned Onboarding packet creation provider');
		}
	};
}

function unavailableOnboardingInactiveStepRemoval(): OnboardingInactiveStepRemovalPort {
	return {
		async remove() {
			throw new Error('Bind the owned Onboarding inactive step removal provider');
		}
	};
}

function unavailableOnboardingLifecycleTransition(): OnboardingLifecycleTransitionPort {
	return {
		async transition() {
			throw new Error('Bind the owned Onboarding lifecycle transition provider');
		}
	};
}

function unavailableOnboardingNoteAppend(): OnboardingNoteAppendPort {
	return {
		async append() {
			throw new Error('Bind the owned Onboarding note append provider');
		}
	};
}

function unavailableOnboardingReconciliation(): OnboardingReconciliationPort {
	return {
		async reconcile() {
			throw new Error('Bind the owned Onboarding reconciliation provider');
		}
	};
}

function unavailableCriticalTaskLibrary(): CriticalTaskLibraryPersistence {
	async function unavailable(): Promise<never> {
		throw new Error('Bind the owned Critical Tasks library in this test context');
	}
	return {
		listCatalog: unavailable,
		listImportCandidates: unavailable,
		listReferenced: unavailable,
		findReference: unavailable,
		create: unavailable,
		createMany: unavailable,
		update: unavailable
	};
}

function unavailableRatingScheme(): RatingSchemePersistence {
	async function unavailable(): Promise<never> {
		throw new Error('Bind the owned Rating Scheme persistence in this test context');
	}
	return {
		listWorkspace: unavailable,
		findWriteReference: unavailable,
		listPersonReadiness: unavailable,
		countEntries: unavailable,
		create: unavailable,
		update: unavailable,
		delete: unavailable
	};
}

function unavailableCriticalTaskCompletions(): CriticalTaskCompletionPersistence {
	async function unavailable(): Promise<never> {
		throw new Error('Bind the owned Critical Tasks completions in this test context');
	}
	return {
		listHistory: unavailable,
		listReadinessHistory: unavailable,
		listReportHistory: unavailable,
		listImportHistory: unavailable,
		findReference: unavailable,
		create: unavailable,
		createMany: unavailable,
		update: unavailable,
		delete: unavailable
	};
}

function unavailableCriticalTasksReadModel(): CriticalTasksReadModelPort {
	return {
		async findLatestCompletions() {
			throw new Error('Bind the owned Critical Tasks read model in this test context');
		}
	};
}

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

export function createInMemoryDataStore(): FixtureRowStore & {
	seed(table: string, rows: Row[]): void;
	replaceDailyAssignmentSlots(
		orgId: string,
		replaceDays: string[],
		slots: AssignmentSlotChange[]
	): Promise<SavedAssignment[]>;
} {
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
		options?: FixtureFindOptions
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

	function applySorting(results: Row[], options?: FixtureFindOptions): Row[] {
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

	function applyPagination<T>(results: Row[], options?: FixtureFindOptions): T[] {
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
		options?: FixtureFindOptions
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

		async replaceDailyAssignmentSlots(orgId, replaceDays, slots) {
			const rows = getRows('daily_assignments');
			const days = new Set(replaceDays);
			const slotKeys = new Set(slots.map((slot) => `${slot.date}::${slot.assignmentTypeId}`));
			const retained = rows.filter(
				(row) =>
					row.organization_id !== orgId ||
					(!days.has(String(row.date)) && !slotKeys.has(`${row.date}::${row.assignment_type_id}`))
			);
			const inserted = slots
				.filter((slot) => slot.assigneeId)
				.map((slot) => ({
					id: crypto.randomUUID(),
					organization_id: orgId,
					date: slot.date,
					assignment_type_id: slot.assignmentTypeId,
					assignee_id: slot.assigneeId
				}));
			rows.splice(0, rows.length, ...retained, ...inserted);
			return inserted.map((row) => ({
				id: row.id,
				date: row.date,
				assignmentTypeId: row.assignment_type_id,
				assigneeId: row.assignee_id,
				organization_id: row.organization_id
			}));
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
			options?: FixtureFindOptions
		): Promise<T[]> {
			return applyQuery<T>(table, getRows(table), orgId, filters, options);
		},

		async findManyWithCount<T>(
			table: string,
			orgId: string,
			filters?: Record<string, unknown>,
			options?: FixtureFindOptions
		): Promise<FixtureFindResult<T>> {
			const filtered = applyFilters(table, getRows(table), orgId, filters, options);
			const count = filtered.length;
			const data = applyPagination<T>(applySorting(filtered, options), options);
			return { data, count };
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

export function createTestAuthContext(overrides?: TestAuthContextOverrides): OrganizationAccessGrant {
	const defaults: OrganizationAccessGrant = {
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

export function createTestScopeEnforcementPort(
	overrides?: Partial<PersonnelScopeEnforcement>
): PersonnelScopeEnforcement {
	const defaults: PersonnelScopeEnforcement = {
		async requireGroupAccess() {},
		async requireGroupAccessBatch() {}
	};

	return { ...defaults, ...overrides };
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

export function createTestNotificationPort(): NotificationDeliveryPort & {
	notifications: RecordedNotification[];
} {
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

function createScopedTestStores(auth: OrganizationAccessGrant): {
	store: InMemoryDataStore;
	rawStore: InMemoryDataStore;
} {
	const rawStore = createInMemoryDataStore();
	if (auth.scopeSet.kind === 'organization') {
		return { store: rawStore, rawStore };
	}

	const scopedStore = Object.assign(createScopedFixtureRows(rawStore, auth.scopeSet, fixtureScopeRules), {
		seed: rawStore.seed
	}) as InMemoryDataStore;

	return {
		store: scopedStore,
		rawStore
	};
}

function createInMemoryCalendarAssignmentReplacementPort(
	rawStore: InMemoryDataStore
): CalendarAssignmentReplacementPort {
	return { replace: rawStore.replaceDailyAssignmentSlots.bind(rawStore) };
}

function createInMemoryCalendarAvailabilityRemovalPort(
	rawStore: FixtureRowStore,
	store: FixtureRowStore,
	orgId: string
): CalendarAvailabilityRemovalPort {
	return {
		async findPersonnelIds(ids) {
			const rows = await rawStore.findMany<{ personnel_id: string }>('availability_entries', orgId, undefined, {
				inFilters: { id: ids },
				select: 'personnel_id'
			});
			return [...new Set(rows.map((row) => row.personnel_id))];
		},
		deleteIds: (ids) => store.deleteManyByIds('availability_entries', orgId, ids)
	};
}

async function inMemoryPersonnelRows(
	rawStore: FixtureRowStore,
	actor: OrganizationAccessGrant,
	status: 'active' | 'all',
	ids?: string[]
) {
	if (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0) return [];
	if (ids && ids.length === 0) return [];
	return rawStore.findMany<Row>('personnel', actor.orgId, undefined, {
		select: '*, groups:groups!personnel_organization_group_fkey(name)',
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

function createInMemoryPersonnelAwardAcknowledgementPort(rawStore: FixtureRowStore): PersonnelAwardAcknowledgementPort {
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
	rawStore: FixtureRowStore,
	storage: StoragePort
): PersonnelArtifactWritePort {
	return {
		async forPerson(actor, personnelId) {
			const person = await rawStore.findOne<{ group_id: string | null }>('personnel', actor.orgId, {
				id: personnelId
			});
			if (!person) throw new RequestFailure(404, 'Personnel record not found');
			if (
				!actor.isPrivileged &&
				(actor.capabilityMap.personnel === 'none' || actor.capabilityMap.personnel === 'view')
			) {
				throw new RequestFailure(403, 'You do not have permission to use personnel data');
			}
			if (
				!actor.isPrivileged &&
				actor.scopeSet.kind === 'groups' &&
				(!person.group_id || !actor.scopeSet.groupIds.includes(person.group_id))
			) {
				throw new RequestFailure(403, 'You do not have access to records outside your assigned scope');
			}
			const rows = {
				find<T>(table: string, id: string) {
					return rawStore.findOne<T>(table, actor.orgId, { id, personnel_id: personnelId });
				},
				insert<T>(table: string, data: Record<string, unknown>) {
					if ('organization_id' in data || 'personnel_id' in data) {
						throw new RequestFailure(400, 'Artifact Person is bound by the write session');
					}
					return rawStore.insert<T>(table, actor.orgId, { ...data, personnel_id: personnelId });
				},
				async update<T>(table: string, id: string, patch: Record<string, unknown>) {
					if ('id' in patch || 'organization_id' in patch || 'personnel_id' in patch) {
						throw new RequestFailure(400, 'Artifact identity cannot be changed');
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
					if (!(file instanceof File)) throw new RequestFailure(400, 'An artifact file is required');
					const prefix =
						kind === 'counseling'
							? `${actor.orgId}/counseling-records/${personnelId}/`
							: `${actor.orgId}/personnel/${personnelId}/documents/`;
					if (!path.startsWith(prefix) || path.length === prefix.length) {
						throw new RequestFailure(400, 'Artifact file path is outside the authorized Person');
					}
					await storage.upload(kind === 'counseling' ? 'counseling-files' : 'personnel-documents', path, file);
					return { async complete() {} };
				},
				async removeFile(kind: 'counseling' | 'document', path: string) {
					const prefix =
						kind === 'counseling'
							? `${actor.orgId}/counseling-records/${personnelId}/`
							: `${actor.orgId}/personnel/${personnelId}/documents/`;
					if (!path.startsWith(prefix) || path.length === prefix.length) {
						throw new RequestFailure(400, 'Artifact file path is outside the authorized Person');
					}
					await storage.remove(kind === 'counseling' ? 'counseling-files' : 'personnel-documents', [path]);
				}
			};
			return {
				findCounseling: (id) => rows.find<CounselingRecordRow>('counseling_records', id),
				createCounseling: (input) =>
					rows.insert<CounselingRecordRow>('counseling_records', {
						date_conducted: input.dateConducted,
						title: input.title,
						subject: input.title,
						summary: input.summary,
						notes: input.summary,
						uploaded_by: input.uploadedBy,
						file_path: input.filePath,
						status: 'completed',
						created_at: input.createdAt
					}),
				setCounselingArchivedAt: (id, archivedAt) =>
					rows.update<CounselingRecordRow>('counseling_records', id, { archived_at: archivedAt }),
				deleteCounseling: (id) => rows.delete('counseling_records', id),
				findDocument: (id) => rows.find<PersonnelDocumentRow>('personnel_documents', id),
				createDocument: (input) =>
					rows.insert<PersonnelDocumentRow>('personnel_documents', {
						title: input.title,
						file_path: input.filePath,
						file_size_bytes: input.fileSizeBytes,
						content_type: input.contentType,
						uploaded_by: input.uploadedBy,
						created_at: input.createdAt
					}),
				setDocumentArchivedAt: (id, archivedAt) =>
					rows.update<PersonnelDocumentRow>('personnel_documents', id, { archived_at: archivedAt }),
				deleteDocument: (id) => rows.delete('personnel_documents', id),
				findFollowUp: (id) => rows.find<FollowUpRow>('personnel_follow_ups', id),
				createFollowUp: (input) =>
					rows.insert<FollowUpRow>('personnel_follow_ups', {
						title: input.title,
						notes: input.notes,
						due_date: input.dueDate,
						status: 'open',
						created_by: input.createdBy,
						created_at: input.createdAt,
						updated_at: input.updatedAt
					}),
				patchFollowUp: (id, input) =>
					rows.update<FollowUpRow>('personnel_follow_ups', id, {
						...(input.title !== undefined ? { title: input.title } : {}),
						...(input.notes !== undefined ? { notes: input.notes } : {}),
						...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
						...(input.status !== undefined ? { status: input.status } : {}),
						...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
						...(input.archivedAt !== undefined ? { archived_at: input.archivedAt } : {}),
						updated_at: input.updatedAt
					}),
				deleteFollowUp: (id) => rows.delete('personnel_follow_ups', id),
				findLeaderNote: (id) => rows.find<LeaderNoteRow>('leader_notes', id),
				createLeaderNote: (input) =>
					rows.insert<LeaderNoteRow>('leader_notes', {
						author: input.author,
						text: input.text,
						created_at: input.createdAt
					}),
				setLeaderNoteArchivedAt: (id, archivedAt) =>
					rows.update<LeaderNoteRow>('leader_notes', id, { archived_at: archivedAt }),
				deleteLeaderNote: (id) => rows.delete('leader_notes', id),
				sumActiveDocumentBytes: rows.sumActiveDocumentBytes,
				uploadFile: rows.uploadFile,
				removeFile: rows.removeFile
			};
		},
		async forPeople(actor, personnelIds) {
			const ids = [...new Set(personnelIds)];
			if (ids.length === 0) throw new RequestFailure(400, 'At least one Person is required');
			const people = await rawStore.findMany<{ id: string; group_id: string | null }>(
				'personnel',
				actor.orgId,
				undefined,
				{
					inFilters: { id: ids }
				}
			);
			if (people.length !== ids.length) throw new RequestFailure(404, 'Personnel record not found');
			if (!actor.isPrivileged && actor.capabilityMap.personnel !== 'configure') {
				throw new RequestFailure(403, 'You do not have permission to use personnel data');
			}
			const groupIds = actor.scopeSet.kind === 'groups' ? actor.scopeSet.groupIds : null;
			if (
				!actor.isPrivileged &&
				groupIds &&
				people.some((person) => !person.group_id || !groupIds.includes(person.group_id))
			) {
				throw new RequestFailure(403, 'You do not have access to records outside your assigned scope');
			}
			const allowed = new Set(ids);
			const rows = {
				async listCandidates(table: string, options: { archivedAt: string | null; status?: 'open' }) {
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
				async update(table: string, row: PersonnelArtifactRef, patch: Record<string, unknown>) {
					if (!allowed.has(row.personnelId)) {
						throw new RequestFailure(403, 'Artifact Person is outside the authorized batch');
					}
					if ('id' in patch || 'organization_id' in patch || 'personnel_id' in patch) {
						throw new RequestFailure(400, 'Artifact identity cannot be changed');
					}
					const existing = await rawStore.findOne(table, actor.orgId, {
						id: row.id,
						personnel_id: row.personnelId
					});
					if (!existing) return;
					await rawStore.update(table, actor.orgId, row.id, patch);
				}
			};
			return {
				listFollowUpArchiveCandidates: (archivedAt) =>
					rows.listCandidates('personnel_follow_ups', {
						archivedAt,
						...(archivedAt === null ? { status: 'open' } : {})
					}),
				listCounselingArchiveCandidates: (archivedAt) => rows.listCandidates('counseling_records', { archivedAt }),
				listDocumentArchiveCandidates: (archivedAt) => rows.listCandidates('personnel_documents', { archivedAt }),
				listLeaderNoteArchiveCandidates: (archivedAt) => rows.listCandidates('leader_notes', { archivedAt }),
				setFollowUpArchivedState: (row, archivedAt) =>
					rows.update('personnel_follow_ups', row, {
						archived_at: archivedAt,
						status: archivedAt === null ? 'open' : 'archived'
					}),
				setCounselingArchivedAt: (row, archivedAt) =>
					rows.update('counseling_records', row, { archived_at: archivedAt }),
				setDocumentArchivedAt: (row, archivedAt) =>
					rows.update('personnel_documents', row, { archived_at: archivedAt }),
				setLeaderNoteArchivedAt: (row, archivedAt) => rows.update('leader_notes', row, { archived_at: archivedAt })
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

function createInMemoryPersonnelCalendarRosterPort(rawStore: FixtureRowStore): PersonnelCalendarRosterPort {
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

function createInMemoryPersonnelOnboardingRosterPort(rawStore: FixtureRowStore): PersonnelOnboardingRosterPort {
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

function createInMemoryPersonnelTrainingRosterPort(rawStore: FixtureRowStore): PersonnelTrainingRosterPort {
	const listActive = async (actor: OrganizationAccessGrant) =>
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

function createInMemoryPersonnelCriticalTasksRosterPort(rawStore: FixtureRowStore): PersonnelCriticalTasksRosterPort {
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

function createInMemoryRatingSchemeDuePort(rawStore: FixtureRowStore): RatingSchemeDuePort {
	return {
		async listDueEntries(actor) {
			if (actor.capabilityMap.ratingScheme === 'none') return [];
			const people = actor.scopeSet.kind === 'groups' ? await inMemoryPersonnelRows(rawStore, actor, 'all') : null;
			const rows = await rawStore.findMany<{
				rating_period_end: string;
				status: 'active' | 'completed' | 'change-of-rater';
			}>(
				'rating_scheme_entries',
				actor.orgId,
				undefined,
				people ? { inFilters: { rated_person_id: people.map((person) => person.id) } } : undefined
			);
			return rows.map((row) => ({ ratingPeriodEnd: row.rating_period_end, status: row.status }));
		}
	};
}

function createInMemoryPersonnelRatingSchemeRosterPort(rawStore: FixtureRowStore): PersonnelRatingSchemeRosterPort {
	return {
		async listActiveReferences(actor) {
			return (await inMemoryPersonnelRows(rawStore, actor, 'active')).map((row) => ({
				id: row.id as string,
				rank: (row.rank as string) ?? '',
				lastName: (row.last_name as string) ?? '',
				firstName: (row.first_name as string) ?? ''
			}));
		},
		async findRatedPersonGroupForWrite(actor, personnelId) {
			const rows = await inMemoryPersonnelRows(rawStore, actor, 'all', [personnelId]);
			return rows[0] ? { groupId: (rows[0].group_id as string | null) ?? null } : null;
		},
		async hasEvaluatorReferences(actor, personnelIds) {
			const ids = [...new Set(personnelIds.map((id) => id.toLowerCase()))];
			if (!ids.length) return true;
			const rows = await rawStore.findMany<Row>('personnel', actor.orgId, undefined, { inFilters: { id: ids } });
			return rows.length === ids.length;
		}
	};
}

function createInMemoryTrainingOnboardingReferencesPort(rawStore: FixtureRowStore): TrainingOnboardingReferencesPort {
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
	rawStore: FixtureRowStore,
	auth: OrganizationAccessGrant
): OnboardingCalendarMarkersPort {
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

function unavailableNotificationStore(): NotificationStore {
	const unavailable = async (): Promise<never> => {
		throw new Error('Bind the owned Notifications provider in this test context');
	};
	return {
		findNotification: unavailable,
		listOwn: unavailable,
		listOwnUnreadIds: unavailable,
		markRead: unavailable,
		deleteNotification: unavailable,
		deleteOwn: unavailable,
		countOwnUnread: unavailable,
		listOwnExportRows: unavailable
	};
}

function createInMemoryOrganizationSettingsReader(store: FixtureRowStore): OrganizationSettingsReader {
	async function findScalar(orgId: string, column: string) {
		const row = await store.findOne<Record<string, number | null>>('organizations', orgId.toLowerCase(), {}, column);
		return row?.[column];
	}
	return {
		async findCriticalTasksDefaults(orgId) {
			const row = await store.findOne<{
				critical_tasks_default_expiration_months?: number | null;
				critical_tasks_expiring_soon_warning_days?: number | null;
			}>(
				'organizations',
				orgId.toLowerCase(),
				{ id: orgId.toLowerCase() },
				'critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
			);
			return row
				? {
						defaultExpirationMonths: row.critical_tasks_default_expiration_months,
						expiringSoonWarningDays: row.critical_tasks_expiring_soon_warning_days
					}
				: null;
		},
		listMemberAccess: (orgId) =>
			store.findMany<OrganizationSettingsMembershipRow>('organization_memberships', orgId.toLowerCase(), undefined, {
				select:
					'id, organization_id, user_id, email, role, created_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids',
				orderBy: [{ column: 'id', ascending: true }]
			}),
		listInvitations: (orgId) =>
			store.findMany<OrganizationSettingsInvitationRow>('organization_invitations', orgId.toLowerCase(), undefined, {
				select:
					'id, email, role, status, created_at, expires_at, accepted_at, declined_at, revoked_at, expired_at, blocked_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids',
				orderBy: [
					{ column: 'created_at', ascending: false },
					{ column: 'id', ascending: true }
				]
			}),
		listInvitationDeliveries: (orgId) =>
			store.findMany<OrganizationSettingsInvitationDeliveryRow>(
				'organization_invitation_email_outbox',
				orgId.toLowerCase(),
				undefined,
				{
					select: 'id, invitation_id, status, attempt_count, last_error, updated_at, sent_at',
					orderBy: [
						{ column: 'created_at', ascending: false },
						{ column: 'id', ascending: true }
					]
				}
			),
		listOwnershipCandidateMemberships: (orgId) =>
			store.findMany<OrganizationOwnershipCandidateMembershipRow>(
				'organization_memberships',
				orgId.toLowerCase(),
				undefined,
				{ select: 'id, user_id, email, role', orderBy: [{ column: 'id', ascending: true }] }
			),
		findMemberLabels: (orgId, userIds) =>
			loadOrganizationMemberLabels(
				{
					findMembers: (memberOrgId, ids) =>
						store.findMany<OrganizationMemberLabelRow>('organization_memberships', memberOrgId, undefined, {
							inFilters: { user_id: ids }
						})
				},
				orgId,
				userIds
			),
		async findPolicies(orgId) {
			const row = await store.findOne<{
				archive_retention_months?: number | null;
				loss_warning_window_days?: number | null;
				training_readiness_goal_percent: number;
			}>(
				'organizations',
				orgId.toLowerCase(),
				{},
				'archive_retention_months, loss_warning_window_days, training_readiness_goal_percent'
			);
			return row
				? {
						archiveRetentionMonths: row.archive_retention_months,
						lossWarningWindowDays: row.loss_warning_window_days,
						trainingReadinessGoalPercent: row.training_readiness_goal_percent
					}
				: null;
		},
		async findTrainingBriefingContext(orgId) {
			const row = await store.findOne<{ name: string; training_readiness_goal_percent: number }>(
				'organizations',
				orgId.toLowerCase(),
				{},
				'name, training_readiness_goal_percent'
			);
			return row ? { name: row.name, trainingReadinessGoalPercent: row.training_readiness_goal_percent } : null;
		},
		findArchiveRetentionMonths: (orgId) => findScalar(orgId, 'archive_retention_months'),
		findLossWarningWindowDays: (orgId) => findScalar(orgId, 'loss_warning_window_days'),
		findStorageCapBytes: (orgId) => findScalar(orgId, 'personnel_document_storage_cap_bytes'),
		async countPendingInvitations(orgId) {
			return (
				(
					await store.findManyWithCount(
						'organization_invitations',
						orgId.toLowerCase(),
						{ status: 'pending' },
						{ select: 'id', limit: 0 }
					)
				).count ?? 0
			);
		}
	};
}

function createInMemoryOrganizationPolicyWritePort(store: FixtureRowStore): OrganizationPolicyWritePort {
	return {
		async updatePolicies(orgId, changes) {
			const updates: Record<string, number> = {};
			if (changes.archiveRetentionMonths !== undefined)
				updates.archive_retention_months = changes.archiveRetentionMonths;
			if (changes.lossWarningWindowDays !== undefined) updates.loss_warning_window_days = changes.lossWarningWindowDays;
			if (changes.trainingReadinessGoalPercent !== undefined)
				updates.training_readiness_goal_percent = changes.trainingReadinessGoalPercent;
			if (changes.personnelDocumentStorageCapBytes !== undefined)
				updates.personnel_document_storage_cap_bytes = changes.personnelDocumentStorageCapBytes;
			await store.updateById('organizations', orgId, updates);
			return null;
		}
	};
}

export function createTestOrganizationArchiveReaders(rawStore: Pick<FixtureRowStore, 'findMany'>, orgId: string) {
	return {
		calendar: {
			async listRows(table) {
				const rows = await rawStore.findMany<Record<string, unknown>>(table, orgId);
				if (table !== 'status_types') return rows;
				const fields = new Set(['id', 'organization_id', 'name', 'color', 'text_color', 'sort_order', 'created_at']);
				return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => fields.has(key))));
			}
		},
		training: { listRows: (table) => rawStore.findMany<Record<string, unknown>>(table, orgId) },
		onboarding: { listRows: (table) => rawStore.findMany<Record<string, unknown>>(table, orgId) },
		personnel: { listRows: (table) => rawStore.findMany<Record<string, unknown>>(table, orgId) },
		identity: { listRows: (table) => rawStore.findMany<Record<string, unknown>>(table, orgId) },
		criticalTasks: { listRows: (table) => rawStore.findMany<Record<string, unknown>>(table, orgId) },
		dashboard: { listRows: () => rawStore.findMany<Record<string, unknown>>('dashboard_configs', orgId) },
		ratingScheme: {
			listRows: () =>
				rawStore.findMany<Record<string, unknown>>('rating_scheme_entries', orgId, undefined, {
					orderBy: [{ column: 'id', ascending: true }]
				})
		},
		dataExport: { listRows: () => rawStore.findMany<Record<string, unknown>>('data_exports', orgId) },
		audit: { listRows: () => rawStore.findMany<Record<string, unknown>>('audit_logs', orgId) }
	} satisfies ReturnType<typeof createRequestOrganizationExportContext>['archiveReaders'];
}

export function createTestDataExportLifecycleWriter(store: FixtureRowStore, orgId: string): DataExportLifecycleWriter {
	return {
		async createProcessing(input) {
			const row = await store.insert<{ id: string }>('data_exports', orgId, {
				requested_by: input.requestedBy,
				status: 'processing',
				created_at: input.createdAt
			});
			return { exportId: row.id };
		},
		async markCompleted(input) {
			await store.update('data_exports', orgId, input.exportId, {
				status: 'completed',
				completed_at: input.completedAt,
				file_size_bytes: input.fileSizeBytes
			});
		},
		async markFailed(input) {
			await store.update('data_exports', orgId, input.exportId, {
				status: 'failed',
				completed_at: input.completedAt
			});
		}
	};
}

function createTestArtifactReadPersistence(store: FixtureRowStore, orgId: string): PersonnelArtifactReadPersistence {
	return {
		listCounselingRecords: (personnelId, { archived, limit }) =>
			store.findMany(
				'counseling_records',
				orgId,
				{ personnel_id: personnelId },
				{
					isNull: { archived_at: !archived },
					limit,
					orderBy: [
						{ column: 'date_conducted', ascending: false },
						{ column: 'created_at', ascending: false }
					]
				}
			),
		listDocuments: (personnelId, { archived, limit }) =>
			store.findMany(
				'personnel_documents',
				orgId,
				{ personnel_id: personnelId },
				{ isNull: { archived_at: !archived }, limit, orderBy: [{ column: 'created_at', ascending: false }] }
			),
		listFollowUps: (personnelId, { archived, limit }) =>
			store.findMany(
				'personnel_follow_ups',
				orgId,
				{ personnel_id: personnelId, ...(archived ? { status: 'archived' } : {}) },
				{
					...(archived ? {} : { notInFilters: { status: ['archived'] } }),
					limit,
					orderBy: [
						{ column: 'status', ascending: false },
						...(archived ? [{ column: 'archived_at', ascending: false }] : []),
						{ column: 'created_at', ascending: false }
					]
				}
			),
		findDocument: (personnelId, id) => store.findOne('personnel_documents', orgId, { id, personnel_id: personnelId }),
		async listLeaderNotePage(personnelId, { archived, limit, before }) {
			const options = {
				isNull: { archived_at: !archived },
				limit,
				orderBy: [
					{ column: 'created_at', ascending: false },
					{ column: 'id', ascending: false }
				]
			};
			if (!before) return store.findMany('leader_notes', orgId, { personnel_id: personnelId }, options);
			const tied = await store.findMany<LeaderNoteRow>(
				'leader_notes',
				orgId,
				{ personnel_id: personnelId, created_at: before.createdAt },
				{ ...options, rangeFilters: [{ column: 'id', op: 'lt', value: before.id }] }
			);
			if (tied.length === limit) return tied;
			return [
				...tied,
				...(await store.findMany<LeaderNoteRow>(
					'leader_notes',
					orgId,
					{ personnel_id: personnelId },
					{
						...options,
						limit: limit - tied.length,
						rangeFilters: [{ column: 'created_at', op: 'lt', value: before.createdAt }]
					}
				))
			];
		}
	};
}
export function createTestRankCatalogPersistence(store: FixtureRowStore, orgId: string): RankCatalogPersistence {
	return {
		listEntries: () => store.findMany('organization_rank_catalog', orgId),
		findEntryByCode: (code) => store.findOne('organization_rank_catalog', orgId, { code }),
		saveEntries: (entries) =>
			store.upsertMany(
				'organization_rank_catalog',
				orgId,
				entries.map((entry) => ({ ...entry })),
				{ onConflict: 'organization_id,code' }
			),
		patchEntryById: (id, values) => store.update('organization_rank_catalog', orgId, id, { ...values })
	};
}
function createTestPersonnelPersistence(
	rawStore: FixtureRowStore,
	store: FixtureRowStore,
	auth: OrganizationAccessGrant
) {
	const rankCatalog = createTestRankCatalogPersistence(store, auth.orgId);
	const personnelSheets: PersonnelSheetPersistence = {
		listSheetsForPerson: (personnelId) =>
			rawStore.findMany('personnel_extended_info', auth.orgId, { personnel_id: personnelId }),
		findSheetForPerson: (personnelId) =>
			rawStore.findOne('personnel_extended_info', auth.orgId, { personnel_id: personnelId }),
		createSheet: (personnelId, values) =>
			rawStore.insert('personnel_extended_info', auth.orgId, { ...values, personnel_id: personnelId }),
		replaceEditableSheetFields: (id, values) =>
			rawStore.update('personnel_extended_info', auth.orgId, id, { ...values }),
		setAwardAcknowledgedAt: async (id, value) => {
			await rawStore.update('personnel_extended_info', auth.orgId, id, { award_tracking_acknowledged_at: value });
		}
	};
	const personnelWorkbookHistory: PersonnelWorkbookHistoryReader = {
		listCounselingExportFacts: (personnelId) =>
			rawStore.findMany(
				'counseling_records',
				auth.orgId,
				{ personnel_id: personnelId },
				{ orderBy: [{ column: 'date_conducted', ascending: false }] }
			),
		listExtendedInfoExportFacts: (personnelId) =>
			rawStore.findMany('personnel_extended_info', auth.orgId, { personnel_id: personnelId })
	};
	return {
		artifactReads: createTestArtifactReadPersistence(store, auth.orgId),
		personnelSheets,
		personnelWorkbookHistory,
		personnel: createInMemoryPersonnelRecordPersistence(store, auth.orgId),
		organizationPersonnel: createInMemoryPersonnelRecordPersistence(rawStore, auth.orgId),
		roster: createInMemoryPersonnelRosterReader(store, auth.orgId),
		organizationRoster: createInMemoryPersonnelRosterReader(rawStore, auth.orgId),
		groups: createInMemoryGroupPersistence(store, auth.orgId),
		selfPins: createInMemorySelfPinPersistence(store, auth.orgId, auth.userId),
		rankCatalog,
		loadRankCatalog: () => loadOrganizationRankCatalog({ auth, rankCatalog })
	};
}

export function createTestContext(
	overrides?: TestContextOptions & {
		scope?: Partial<PersonnelScopeEnforcement>;

		sensitiveActionDecision?: Partial<SensitiveActionDecision>;
	}
) {
	const auth = createTestAuthContext(overrides?.auth);
	const scope = createTestScopeEnforcementPort(overrides?.scope);
	const { store, rawStore } = createScopedTestStores(auth);
	const auditPort = createTestAuditPort();
	const notificationPort = createTestNotificationPort();
	const storagePort = createTestStoragePort();
	const sensitiveActionAuthorizer = createTestSensitiveActionAuthorizer(overrides?.sensitiveActionDecision);
	const criticalTaskLibrary =
		overrides?.criticalTaskLibraryFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskLibrary();
	const criticalTaskCompletions =
		overrides?.criticalTaskCompletionsFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskCompletions();
	const criticalTasksReadModel =
		overrides?.criticalTasksReadModelFactory?.(rawStore, criticalTaskLibrary, criticalTaskCompletions) ??
		unavailableCriticalTasksReadModel();
	return {
		...createTestCalendarPersistence(rawStore, store, auth, overrides),
		...createTestTrainingPersistence(store, auth.orgId, overrides),
		...createTestOnboardingPersistence(rawStore, auth.orgId, overrides),
		...createTestPersonnelPersistence(rawStore, store, auth),
		store,
		rawStore,
		auth,
		scope,
		audit: auditPort,
		calendarAssignmentReplacement: createInMemoryCalendarAssignmentReplacementPort(rawStore),
		availabilityRemoval: createInMemoryCalendarAvailabilityRemovalPort(rawStore, store, auth.orgId),
		organizationSettings: createInMemoryOrganizationSettingsReader(rawStore),
		organizationPolicyWrite: createInMemoryOrganizationPolicyWritePort(rawStore),
		onboardingReconciliation: overrides?.onboardingReconciliation ?? unavailableOnboardingReconciliation(),
		onboardingNoteAppend: overrides?.onboardingNoteAppend ?? unavailableOnboardingNoteAppend(),
		onboardingLifecycleTransition:
			overrides?.onboardingLifecycleTransition ?? unavailableOnboardingLifecycleTransition(),
		onboardingInactiveStepRemoval:
			overrides?.onboardingInactiveStepRemoval ?? unavailableOnboardingInactiveStepRemoval(),
		onboardingPacketCreation: overrides?.onboardingPacketCreation ?? unavailableOnboardingPacketCreation(),
		auditPort,

		notifications: notificationPort,
		notificationSelf: { auth, audit: auditPort, store: unavailableNotificationStore() },
		feedbackExport: {
			async listRows(_orgId: string): Promise<FeedbackExportRow[]> {
				throw new Error('Bind the owned Feedback export provider in this test context');
			}
		},
		notificationPort,
		storage: storagePort,
		storagePort,
		sensitiveActionAuthorizer,
		criticalTasksReadModel,
		criticalTaskLibrary,
		criticalTaskCompletions,
		ratingScheme: overrides?.ratingSchemeFactory?.(rawStore, auth.orgId) ?? unavailableRatingScheme(),
		personnelAwardAcknowledgement: createInMemoryPersonnelAwardAcknowledgementPort(rawStore),
		ratingSchemeDue: createInMemoryRatingSchemeDuePort(rawStore),
		personnelArtifactWrites: createInMemoryPersonnelArtifactWritePort(rawStore, storagePort),
		signInRosterFileWrites: createInMemorySignInRosterFileWritePort(storagePort),
		signInRosterExport: {
			listRows: () => rawStore.findMany<Record<string, unknown>>('sign_in_rosters', auth.orgId)
		},
		archiveReaders: createTestOrganizationArchiveReaders(rawStore, auth.orgId),
		exportLifecycle: createTestDataExportLifecycleWriter(rawStore, auth.orgId),
		personnelOrganizationExport: createInMemoryPersonnelOrganizationExportPort(rawStore),
		organizationRawExport: {
			listRows: (orgId, table) => rawStore.findMany<Record<string, unknown>>(table, orgId)
		} satisfies OrganizationRawExportReader,
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelRatingSchemeRoster: createInMemoryPersonnelRatingSchemeRosterPort(rawStore),
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

export function createWritePortsContext(options?: TestContextOptions) {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTaskLibrary =
		options?.criticalTaskLibraryFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskLibrary();
	const criticalTaskCompletions =
		options?.criticalTaskCompletionsFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskCompletions();
	const criticalTasksReadModel =
		options?.criticalTasksReadModelFactory?.(rawStore, criticalTaskLibrary, criticalTaskCompletions) ??
		unavailableCriticalTasksReadModel();
	const storagePort = createTestStoragePort();
	return {
		...createTestCalendarPersistence(rawStore, store, auth, options),
		...createTestTrainingPersistence(store, auth.orgId, options),
		...createTestOnboardingPersistence(rawStore, auth.orgId, options),
		...createTestPersonnelPersistence(rawStore, store, auth),
		store,
		rawStore,
		auth,
		audit: createTestAuditPort(),
		calendarAssignmentReplacement: createInMemoryCalendarAssignmentReplacementPort(rawStore),
		availabilityRemoval: createInMemoryCalendarAvailabilityRemovalPort(rawStore, store, auth.orgId),
		onboardingReconciliation: options?.onboardingReconciliation ?? unavailableOnboardingReconciliation(),
		onboardingNoteAppend: options?.onboardingNoteAppend ?? unavailableOnboardingNoteAppend(),
		onboardingLifecycleTransition: options?.onboardingLifecycleTransition ?? unavailableOnboardingLifecycleTransition(),
		onboardingInactiveStepRemoval: options?.onboardingInactiveStepRemoval ?? unavailableOnboardingInactiveStepRemoval(),
		onboardingPacketCreation: options?.onboardingPacketCreation ?? unavailableOnboardingPacketCreation(),

		criticalTasksReadModel,
		criticalTaskLibrary,
		criticalTaskCompletions,
		ratingScheme: options?.ratingSchemeFactory?.(rawStore, auth.orgId) ?? unavailableRatingScheme(),
		personnelArtifactWrites: createInMemoryPersonnelArtifactWritePort(rawStore, storagePort),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelRatingSchemeRoster: createInMemoryPersonnelRatingSchemeRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore)
	};
}

export function createWriteWithNotificationsPortsContext(options?: TestContextOptions) {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTaskLibrary =
		options?.criticalTaskLibraryFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskLibrary();
	const criticalTaskCompletions =
		options?.criticalTaskCompletionsFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskCompletions();
	const criticalTasksReadModel =
		options?.criticalTasksReadModelFactory?.(rawStore, criticalTaskLibrary, criticalTaskCompletions) ??
		unavailableCriticalTasksReadModel();
	const storagePort = createTestStoragePort();
	return {
		...createTestCalendarPersistence(rawStore, store, auth, options),
		...createTestTrainingPersistence(store, auth.orgId, options),
		...createTestOnboardingPersistence(rawStore, auth.orgId, options),
		...createTestPersonnelPersistence(rawStore, store, auth),
		store,
		rawStore,
		auth,
		audit: createTestAuditPort(),
		calendarAssignmentReplacement: createInMemoryCalendarAssignmentReplacementPort(rawStore),
		availabilityRemoval: createInMemoryCalendarAvailabilityRemovalPort(rawStore, store, auth.orgId),
		onboardingReconciliation: options?.onboardingReconciliation ?? unavailableOnboardingReconciliation(),
		onboardingNoteAppend: options?.onboardingNoteAppend ?? unavailableOnboardingNoteAppend(),
		onboardingLifecycleTransition: options?.onboardingLifecycleTransition ?? unavailableOnboardingLifecycleTransition(),
		onboardingInactiveStepRemoval: options?.onboardingInactiveStepRemoval ?? unavailableOnboardingInactiveStepRemoval(),
		onboardingPacketCreation: options?.onboardingPacketCreation ?? unavailableOnboardingPacketCreation(),

		notifications: createTestNotificationPort(),
		criticalTasksReadModel,
		criticalTaskLibrary,
		criticalTaskCompletions,
		ratingScheme: options?.ratingSchemeFactory?.(rawStore, auth.orgId) ?? unavailableRatingScheme(),
		personnelArtifactWrites: createInMemoryPersonnelArtifactWritePort(rawStore, storagePort),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelRatingSchemeRoster: createInMemoryPersonnelRatingSchemeRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore)
	};
}

export function createUserWritePortsContext(options?: { auth?: Parameters<typeof createTestAuthContext>[0] }) {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	return {
		...createTestPersonnelPersistence(rawStore, store, auth),
		store,
		auth,
		audit: createTestAuditPort()
	};
}

export function createQueryPortsContext(options?: TestContextOptions) {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTaskLibrary =
		options?.criticalTaskLibraryFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskLibrary();
	const criticalTaskCompletions =
		options?.criticalTaskCompletionsFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskCompletions();
	const criticalTasksReadModel =
		options?.criticalTasksReadModelFactory?.(rawStore, criticalTaskLibrary, criticalTaskCompletions) ??
		unavailableCriticalTasksReadModel();
	return {
		...createTestCalendarPersistence(rawStore, store, auth, options),
		...createTestTrainingPersistence(store, auth.orgId, options),
		...createTestOnboardingPersistence(rawStore, auth.orgId, options),
		...createTestPersonnelPersistence(rawStore, store, auth),
		store,
		auth,
		organizationSettings: createInMemoryOrganizationSettingsReader(rawStore),
		criticalTasksReadModel,
		criticalTaskLibrary,
		criticalTaskCompletions,
		ratingScheme: options?.ratingSchemeFactory?.(rawStore, auth.orgId) ?? unavailableRatingScheme(),
		personnelAwardAcknowledgement: createInMemoryPersonnelAwardAcknowledgementPort(rawStore),
		ratingSchemeDue: createInMemoryRatingSchemeDuePort(rawStore),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelRatingSchemeRoster: createInMemoryPersonnelRatingSchemeRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore),
		onboardingCalendarMarkers: createInMemoryOnboardingCalendarMarkersPort(rawStore, auth)
	};
}

export function createQueryWithRawStorePortsContext(options?: TestContextOptions) {
	const auth = createTestAuthContext(options?.auth);
	const { store, rawStore } = createScopedTestStores(auth);
	const criticalTaskLibrary =
		options?.criticalTaskLibraryFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskLibrary();
	const criticalTaskCompletions =
		options?.criticalTaskCompletionsFactory?.(rawStore, auth.orgId) ?? unavailableCriticalTaskCompletions();
	const criticalTasksReadModel =
		options?.criticalTasksReadModelFactory?.(rawStore, criticalTaskLibrary, criticalTaskCompletions) ??
		unavailableCriticalTasksReadModel();
	return {
		...createTestCalendarPersistence(rawStore, store, auth, options),
		...createTestTrainingPersistence(store, auth.orgId, options),
		...createTestOnboardingPersistence(rawStore, auth.orgId, options),
		...createTestPersonnelPersistence(rawStore, store, auth),
		store,
		auth,
		rawStore,
		organizationSettings: createInMemoryOrganizationSettingsReader(rawStore),
		criticalTasksReadModel,
		criticalTaskLibrary,
		criticalTaskCompletions,
		ratingScheme: options?.ratingSchemeFactory?.(rawStore, auth.orgId) ?? unavailableRatingScheme(),
		personnelAwardAcknowledgement: createInMemoryPersonnelAwardAcknowledgementPort(rawStore),
		ratingSchemeDue: createInMemoryRatingSchemeDuePort(rawStore),
		personnelTrainingRoster: createInMemoryPersonnelTrainingRosterPort(rawStore),
		personnelCriticalTasksRoster: createInMemoryPersonnelCriticalTasksRosterPort(rawStore),
		personnelRatingSchemeRoster: createInMemoryPersonnelRatingSchemeRosterPort(rawStore),
		personnelCalendarRoster: createInMemoryPersonnelCalendarRosterPort(rawStore),
		personnelOnboardingRoster: createInMemoryPersonnelOnboardingRosterPort(rawStore),
		trainingOnboardingReferences: createInMemoryTrainingOnboardingReferencesPort(rawStore)
	};
}
