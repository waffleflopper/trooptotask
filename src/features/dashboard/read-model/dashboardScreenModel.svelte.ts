import { createRosterReadModel, type RosterReadModelView } from '$features/personnel/contracts';
import { rosterStore } from '$features/personnel';
import { calendarStatusSource, calendarAvailabilitySource, calendarAssignmentsSource } from '$features/calendar';
import { pinnedGroupsStore } from '$features/personnel';
import { groupsStore } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from '$features/calendar/contracts';
import { FORECAST_DAYS, type DashboardPageData } from '$features/dashboard/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { showSubGroups } from '$lib/stores/showSubGroups.svelte';
import type { DashboardInputs } from '../sections/dashboardInputs';
import { buildStrengthBand, type StrengthBand } from './strengthBand';

export interface DashboardCollectionSource<T> {
	items: T[];
	loading?: boolean;
}

export interface DashboardAssignmentSource {
	assignments: DailyAssignment[];
	types: AssignmentType[];
	loading?: boolean;
}

export interface DashboardPinnedGroupSource {
	list: string[];
	loading?: boolean;
}

export interface DashboardStoreSources {
	personnel: DashboardCollectionSource<Personnel>;
	statusTypes: DashboardCollectionSource<StatusType>;
	availability: DashboardCollectionSource<AvailabilityEntry>;
	dailyAssignments: DashboardAssignmentSource;
	groups: DashboardCollectionSource<Group>;
	pinnedGroups: DashboardPinnedGroupSource;
}

export interface DashboardScreenModelOptions {
	sources?: DashboardStoreSources;
}

export function createDashboardScreenModel(
	data: DashboardPageData,
	options: DashboardScreenModelOptions = {}
): DashboardScreenModel {
	return new DashboardScreenModel(data, options);
}

export class DashboardScreenModel {
	readonly data: DashboardPageData;
	readonly today: string;
	readonly forecastDays: readonly string[];
	private readonly sources: DashboardStoreSources;

	private rosterView = $derived.by<RosterReadModelView>(() =>
		createRosterReadModel({
			personnel: this.sources.personnel.items,
			groups: this.sources.groups.items,
			pinnedGroupIds: this.sources.pinnedGroups.list,
			fallbackGroupName: this.data.orgName
		}).full({ status: 'active' })
	);

	/** The loaded data as plain values, for the Dashboard sections. */
	inputs = $derived.by<DashboardInputs>(() => ({
		today: this.today,
		timeZone: this.data.viewerDay.timeZone,
		forecastDays: this.forecastDays,
		personnel: this.rosterView.flatPersonnel,
		availability: this.sources.availability.items,
		statusTypes: this.sources.statusTypes.items,
		groups: this.sources.groups.items,
		assignmentTypes: this.sources.dailyAssignments.types,
		assignments: this.sources.dailyAssignments.assignments,
		specialDays: this.data.dashboard.data.specialDays,
		page: this.data
	}));

	/** The strength band: bottom line, forecast, headline and groups, rebuilt only when the loaded data changes. */
	strength = $derived.by<StrengthBand>(() =>
		buildStrengthBand({
			...this.inputs,
			floorPercent: this.data.dashboard.data.strengthFloorPercent,
			showSubGroups: showSubGroups.current
		})
	);

	constructor(data: DashboardPageData, options: DashboardScreenModelOptions = {}) {
		this.data = data;
		this.today = data.viewerDay.date;
		const todayNumber = toDayNumber(this.today);
		this.forecastDays = Array.from({ length: FORECAST_DAYS }, (_, offset) => fromDayNumber(todayNumber + offset));
		this.sources = options.sources ?? createDefaultDashboardStoreSources();
	}

	get isHydrating(): boolean {
		return (
			this.sources.personnel.loading === true ||
			this.sources.statusTypes.loading === true ||
			this.sources.availability.loading === true ||
			this.sources.dailyAssignments.loading === true ||
			this.sources.groups.loading === true
		);
	}

	get totalPersonnel(): number {
		return this.rosterView.flatPersonnel.length;
	}
}

function createDefaultDashboardStoreSources(): DashboardStoreSources {
	return {
		personnel: rosterStore,
		statusTypes: calendarStatusSource,
		availability: calendarAvailabilitySource,
		dailyAssignments: calendarAssignmentsSource,
		groups: groupsStore,
		pinnedGroups: pinnedGroupsStore
	};
}
