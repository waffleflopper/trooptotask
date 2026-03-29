import type { EffectiveTier } from '$lib/types/subscription';

export type FeatureArea = 'calendar' | 'personnel' | 'training' | 'onboarding' | 'leaders-book';

/** Options for DataStore.findMany queries */
export interface FindOptions {
	orderBy?: Array<{ column: string; ascending: boolean }>;
	filters?: Record<string, unknown>;
	inFilters?: Record<string, unknown[]>;
	select?: string;
	limit?: number;
	/** Null-check filters: { archived_at: true } means IS NULL, false means IS NOT NULL */
	isNull?: Record<string, boolean>;
	/** Range filters for date/numeric queries */
	rangeFilters?: Array<{ column: string; op: 'gte' | 'lte' | 'gt' | 'lt'; value: string }>;
	/** Case-insensitive LIKE filters: { title: '%search%' } */
	ilikeFilters?: Record<string, string>;
	/** Pagination range (0-indexed, inclusive) */
	range?: { from: number; to: number };
	/** Count mode — used by findManyWithCount */
	count?: 'exact' | 'planned' | 'estimated';
}

/** Result from findManyWithCount — data plus total count */
export interface FindResult<T> {
	data: T[];
	count: number | null;
}

/** Scope rule for ScopedDataStore — how a table relates to personnel groups */
export type GroupScopeRule = { type: 'group'; groupColumn: string } | { type: 'personnel'; personnelColumn: string };

/** Abstracts all persistence — business logic never imports Supabase */
export interface DataStore {
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;

	findMany<T>(table: string, orgId: string, filters?: Record<string, unknown>, options?: FindOptions): Promise<T[]>;

	insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;

	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;

	/** Update a row by primary key only — no organization_id scoping.
	 *  Use for tables like `organizations` where the row IS the org. */
	updateById<T>(table: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;

	delete(table: string, orgId: string, id: string): Promise<void>;

	deleteWhere(table: string, orgId: string, filters: Record<string, unknown>): Promise<void>;

	deleteManyByIds(table: string, orgId: string, ids: string[]): Promise<number>;

	insertMany<T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]>;

	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: FindOptions
	): Promise<FindResult<T>>;
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
	/** Get the effective tier for this org (considers gifts, subscriptions, billing-disabled) */
	getEffectiveTier(): Promise<EffectiveTier>;
	/** Count bulk data exports this month for this org */
	getMonthlyExportCount(): Promise<number>;
}

/** Abstracts payment provider operations (Stripe, etc.) */
export interface BillingPort {
	createCheckoutSession(options: {
		orgId: string;
		orgName: string;
		tier: 'team' | 'unit';
		customerEmail: string;
		existingCustomerId?: string;
		successUrl: string;
		cancelUrl: string;
	}): Promise<{ url: string; customerId: string }>;
	createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
	cancelSubscription(subscriptionId: string): Promise<void>;
	pauseSubscription(subscriptionId: string): Promise<void>;
	resumeSubscription(subscriptionId: string): Promise<void>;
}

/** Notification payload for user/admin notifications */
export interface NotificationPayload {
	type: string;
	title: string;
	message: string;
	link?: string | null;
}

/** Abstracts notification delivery — business logic never imports Supabase notifications */
export interface NotificationPort {
	notifyUser(orgId: string, userId: string, notification: NotificationPayload): Promise<void>;
	notifyAdmins(orgId: string, excludeUserId: string | null, notification: NotificationPayload): Promise<void>;
}

/** Abstracts file storage operations — business logic never imports Supabase storage */
export interface StoragePort {
	upload(bucket: string, path: string, data: File | Blob | ArrayBuffer, options?: { upsert?: boolean }): Promise<void>;
	remove(bucket: string, paths: string[]): Promise<void>;
	createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
}

/** The 4 ports every standard write operation needs */
export interface WritePorts {
	store: DataStore;
	auth: AuthContext;
	audit: AuditPort;
	readOnlyGuard: ReadOnlyGuard;
}

/** Write + notifications (e.g., assignment type deletion, rating scheme approval) */
export interface WriteWithNotificationsPorts extends WritePorts {
	notifications: NotificationPort;
}

/** Write + subscription (e.g., personnel create with slot checks) */
export interface WriteWithSubscriptionPorts extends WritePorts {
	subscription: SubscriptionPort;
}

/** User-scoped operations that aren't org-level writes (e.g., pinned groups) */
export interface UserWritePorts {
	store: DataStore;
	auth: AuthContext;
	audit: AuditPort;
}

/** Read-only query operations */
export interface QueryPorts {
	store: DataStore;
	auth: AuthContext;
}

/** Query operations needing unscoped access (e.g., shared data) */
export interface QueryWithRawStorePorts extends QueryPorts {
	rawStore: DataStore;
}

/** Combined context for all use cases */
export interface UseCaseContext {
	store: DataStore;
	auth: AuthContext;
	audit: AuditPort;
	readOnlyGuard: ReadOnlyGuard;
	subscription: SubscriptionPort;
	notifications: NotificationPort;
	billing: BillingPort;
	storage: StoragePort;
	/** Unscoped DataStore — use only when business logic requires org-wide data (e.g. allPersonnel for dropdowns) */
	rawStore: DataStore;
}
