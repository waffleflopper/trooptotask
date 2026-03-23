import type { FeatureArea } from '../permissionContext';

// Re-export for convenience so consumers don't need two imports
export type { FeatureArea };

/** Options for DataStore.findMany queries */
export interface FindOptions {
	orderBy?: Array<{ column: string; ascending: boolean }>;
	filters?: Record<string, unknown>;
	inFilters?: Record<string, unknown[]>;
	select?: string;
	limit?: number;
}

/** Abstracts all persistence — business logic never imports Supabase */
export interface DataStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;

	findMany<T>(table: string, orgId: string, filters?: Record<string, unknown>, options?: FindOptions): Promise<T[]>;

	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;

	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;

	delete(table: string, orgId: string, id: string): Promise<void>;

	deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;

	deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number>;

	insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;
}

/** Abstracts permission enforcement — no SupabaseClient parameter needed */
export interface AuthContext {
	readonly userId: string | null;
	readonly orgId: string;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isPrivileged: boolean;
	readonly isFullEditor: boolean;
	readonly scopedGroupId: string | null;

	requireEdit(area: FeatureArea): void;
	requireView(area: FeatureArea): void;
	requirePrivileged(): void;
	requireOwner(): void;
	requireFullEditor(): void;
	requireManageMembers(): void;
	requireGroupAccess(personnelId: string): Promise<void>;
	requireGroupAccessBatch(personnelIds: string[]): Promise<void>;
	requireGroupAccessByRecord(table: string, recordId: string, personnelIdColumn: string): Promise<void>;
}

/** Fire-and-forget audit logging */
export interface AuditPort {
	log(event: { action: string; resourceType: string; resourceId?: string; details?: Record<string, unknown> }): void;
}

/** Subscription/billing state checks */
export interface ReadOnlyGuard {
	check(): Promise<boolean>;
}

/** Subscription/billing cap checks and cache management */
export interface SubscriptionPort {
	canAddPersonnel(): Promise<{ allowed: boolean; message?: string }>;
	/** Returns number of personnel slots available, or null if unlimited */
	getAvailablePersonnelSlots(): Promise<number | null>;
	invalidateTierCache(): void;
}

/** Combined context for all use cases */
export interface UseCaseContext {
	store: DataStore;
	auth: AuthContext;
	audit: AuditPort;
	readOnlyGuard: ReadOnlyGuard;
}
