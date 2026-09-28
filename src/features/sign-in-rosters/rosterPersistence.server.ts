interface RosterFindOptions {
	orderBy?: Array<{ column: string; ascending: boolean }>;
	range?: { from: number; to: number };
	count?: 'exact';
	ilikeFilters?: Record<string, string>;
	rangeFilters?: Array<{ column: string; op: 'gte' | 'lte'; value: string }>;
}

interface RequestStore {
	findManyWithCount<T>(
		table: string,
		orgId: string,
		filters?: Record<string, unknown>,
		options?: RosterFindOptions
	): Promise<{ data: T[]; count: number | null }>;
	findOne<T>(table: string, orgId: string, filters: Record<string, unknown>): Promise<T | null>;
	insert<T>(table: string, orgId: string, data: Record<string, unknown>): Promise<T>;
	update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>): Promise<T>;
	delete(table: string, orgId: string, id: string): Promise<void>;
}

export interface SignInRosterRecord extends Record<string, unknown> {
	id: string;
	title: string;
	signed_file_path: string | null;
}

export interface SignInRosterListInput {
	title: string;
	from: string | null;
	to: string | null;
	limit: number;
	offset: number;
}

export interface SignInRosterPersistence {
	list(input: SignInRosterListInput): Promise<{ data: SignInRosterRecord[]; count: number | null }>;
	find(id: string): Promise<SignInRosterRecord | null>;
	create(data: Record<string, unknown>): Promise<SignInRosterRecord>;
	setSignedFilePath(id: string, path: string | null): Promise<void>;
	delete(id: string): Promise<void>;
}

/** Bind the owner's record operations to the request-scoped store and its Group rules. */
export function createSignInRosterPersistence(store: RequestStore, orgId: string): SignInRosterPersistence {
	return {
		list(input) {
			const options: RosterFindOptions = {
				orderBy: [{ column: 'created_at', ascending: false }],
				range: { from: input.offset, to: input.offset + input.limit - 1 },
				count: 'exact'
			};
			if (input.title) options.ilikeFilters = { title: `%${input.title}%` };
			const rangeFilters: NonNullable<typeof options.rangeFilters> = [];
			if (input.from) rangeFilters.push({ column: 'created_at', op: 'gte', value: input.from });
			if (input.to) rangeFilters.push({ column: 'created_at', op: 'lte', value: input.to + 'T23:59:59.999Z' });
			if (rangeFilters.length) options.rangeFilters = rangeFilters;
			return store.findManyWithCount<SignInRosterRecord>('sign_in_rosters', orgId, undefined, options);
		},
		find(id) {
			return store.findOne<SignInRosterRecord>('sign_in_rosters', orgId, { id });
		},
		create(data) {
			return store.insert<SignInRosterRecord>('sign_in_rosters', orgId, data);
		},
		async setSignedFilePath(id, path) {
			await store.update('sign_in_rosters', orgId, id, { signed_file_path: path });
		},
		delete(id) {
			return store.delete('sign_in_rosters', orgId, id);
		}
	};
}
