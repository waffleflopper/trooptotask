import {
	createRosterReadModel,
	type CreateRosterReadModelInput,
	type RosterReadModel,
	type RosterStatus
} from '$lib/domain/rosterReadModel';
import type { AuthContext, DataStore, FindOptions } from '$lib/server/core/ports';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { Personnel } from '$lib/types';

type RosterReadModelOptions = Omit<CreateRosterReadModelInput, 'personnel'>;

export interface RosterPersonnelFindOptions {
	status?: RosterStatus;
	select?: string;
	orderBy?: FindOptions['orderBy'];
	inFilters?: FindOptions['inFilters'];
	notInFilters?: FindOptions['notInFilters'];
	rangeFilters?: FindOptions['rangeFilters'];
	ilikeFilters?: FindOptions['ilikeFilters'];
	range?: FindOptions['range'];
	limit?: FindOptions['limit'];
}

export interface LoadRosterPersonnelOptions extends RosterPersonnelFindOptions {
	filters?: Record<string, unknown>;
}

export interface LoadRosterReadModelOptions extends LoadRosterPersonnelOptions, RosterReadModelOptions {}

interface RosterPersonnelQueryPorts {
	auth: AuthContext;
	store: DataStore;
}

const DEFAULT_ROSTER_PERSONNEL_ORDER: FindOptions['orderBy'] = [
	{ column: 'last_name', ascending: true },
	{ column: 'first_name', ascending: true }
];

export function rosterPersonnelFindOptions(options: RosterPersonnelFindOptions = {}): FindOptions {
	const statusIsNull = rosterStatusIsNull(options.status ?? 'active');

	return {
		select: options.select ?? PersonnelEntity.select,
		orderBy: options.orderBy ?? DEFAULT_ROSTER_PERSONNEL_ORDER,
		isNull: statusIsNull,
		inFilters: options.inFilters,
		notInFilters: options.notInFilters,
		rangeFilters: options.rangeFilters,
		ilikeFilters: options.ilikeFilters,
		range: options.range,
		limit: options.limit
	};
}

export async function loadRosterPersonnel(
	ctx: RosterPersonnelQueryPorts,
	options: LoadRosterPersonnelOptions = {}
): Promise<Personnel[]> {
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		PersonnelEntity.table,
		ctx.auth.orgId,
		options.filters,
		rosterPersonnelFindOptions(options)
	);

	return PersonnelEntity.fromDbArray(rows);
}

export async function loadRosterReadModel(
	ctx: RosterPersonnelQueryPorts,
	options: LoadRosterReadModelOptions = {}
): Promise<RosterReadModel> {
	const { pinnedGroups, groupOrder, fallbackGroupName, ...personnelOptions } = options;
	const personnel = await loadRosterPersonnel(ctx, personnelOptions);

	return createRosterReadModel({
		personnel,
		pinnedGroups,
		groupOrder,
		fallbackGroupName
	});
}

export function createRosterReadModelFromDbRows(
	rows: Record<string, unknown>[],
	options: RosterReadModelOptions = {}
): RosterReadModel {
	return createRosterReadModel({
		personnel: PersonnelEntity.fromDbArray(rows),
		...options
	});
}

function rosterStatusIsNull(status: RosterStatus): Record<string, boolean> | undefined {
	if (status === 'active') return { archived_at: true };
	if (status === 'archived') return { archived_at: false };
	return undefined;
}
