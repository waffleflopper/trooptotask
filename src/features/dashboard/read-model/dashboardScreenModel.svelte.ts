import { createRosterReadModel, type RosterReadModelView } from '$features/personnel/contracts';
import { rosterStore } from '$features/personnel';
import { calendarStatusSource, calendarAvailabilitySource, calendarAssignmentsSource } from '$features/calendar';
import { pinnedGroupsStore } from '$features/personnel';
import { groupsStore } from '$features/personnel';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType, DailyAssignment } from '$features/calendar/contracts';
import type { DashboardPageData } from '$features/dashboard/contracts';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { DashboardInputs } from '../sections/dashboardInputs';
import { buildStrengthBand, type StrengthBand } from './strengthBand';
import type {
	StarterConfigurationPackApplyResult,
	StarterConfigurationPackId,
	StarterConfigurationPackSupport
} from '$features/dashboard/contracts';

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

const FORECAST_DAYS = 14;

export interface DashboardSupportData {
	trainingTypeCount?: number;
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	gettingStartedDismissed: boolean;
	starterConfigurationPacks?: StarterConfigurationPackSupport[];
}

export interface DashboardStarterPackApplyState {
	status: 'idle' | 'pending' | 'success' | 'error';
	message: string | null;
	result: StarterConfigurationPackApplyResult | null;
}

export interface DashboardGettingStartedItem {
	id: string;
	label: string;
	description: string;
	href: string;
	complete: boolean;
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

	private rosterView = $derived.by<RosterReadModelView>(() => {
		const groupOrder = [...this.sources.groups.items]
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
			.map((group) => group.name);

		return createRosterReadModel({
			personnel: this.sources.personnel.items,
			pinnedGroups: this.sources.pinnedGroups.list,
			groupOrder,
			fallbackGroupName: this.data.orgName
		}).full({ status: 'active' });
	});

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
		buildStrengthBand({ ...this.inputs, floorPercent: this.data.dashboard.data.strengthFloorPercent })
	);

	gettingStartedDismissed = $state(false);
	starterPackApplyState = $state<DashboardStarterPackApplyState>({
		status: 'idle',
		message: null,
		result: null
	});
	private supportData = $state<DashboardSupportData | null>(null);

	constructor(data: DashboardPageData, options: DashboardScreenModelOptions = {}) {
		this.data = data;
		this.today = data.viewerDay.date;
		const todayNumber = toDayNumber(this.today);
		this.forecastDays = Array.from({ length: FORECAST_DAYS }, (_, offset) => fromDayNumber(todayNumber + offset));
		this.sources = options.sources ?? createDefaultDashboardStoreSources();

		if (
			typeof data.onboardingTemplateStepCount === 'number' &&
			typeof data.ratingSchemeEntryCount === 'number' &&
			typeof data.orgMemberCount === 'number' &&
			typeof data.gettingStartedDismissed === 'boolean'
		) {
			this.applySupportData({
				trainingTypeCount: data.trainingTypeCount,
				onboardingTemplateStepCount: data.onboardingTemplateStepCount,
				ratingSchemeEntryCount: data.ratingSchemeEntryCount,
				orgMemberCount: data.orgMemberCount,
				gettingStartedDismissed: data.gettingStartedDismissed,
				starterConfigurationPacks: data.starterConfigurationPacks
			});
		}
	}

	get personnelCount(): number {
		return this.data.dashboard.data.personnel.length;
	}

	get trainingTypeCount(): number {
		return this.supportData?.trainingTypeCount ?? dashboardTrainingTypeCount(this.data);
	}

	get userRole(): string | undefined {
		return this.data.userRole as string | undefined;
	}

	get hasSupportData(): boolean {
		return this.supportData !== null;
	}

	get starterConfigurationPacks(): StarterConfigurationPackSupport[] {
		return this.supportData?.starterConfigurationPacks ?? [];
	}

	get firstStarterConfigurationPack(): StarterConfigurationPackSupport | null {
		return this.starterConfigurationPacks[0] ?? null;
	}

	get onboardingTemplateStepCount(): number {
		return this.supportData?.onboardingTemplateStepCount ?? 0;
	}

	get ratingSchemeEntryCount(): number {
		return this.supportData?.ratingSchemeEntryCount ?? 0;
	}

	get orgMemberCount(): number {
		return this.supportData?.orgMemberCount ?? 0;
	}

	get gettingStartedItems(): DashboardGettingStartedItem[] {
		const orgPath = `/org/${this.data.orgId}`;
		const items: Array<DashboardGettingStartedItem & { feature?: FeatureKey }> = [
			{
				id: 'personnel',
				label: 'Import or add the roster',
				description: 'Import an Excel/CSV roster or add service members so the dashboard can track strength.',
				href: `${orgPath}/personnel`,
				complete: this.personnelCount > 0
			},
			{
				id: 'statuses',
				label: 'Review availability statuses',
				description: 'Review the seeded availability statuses and adjust them for your unit.',
				href: `${orgPath}/calendar/settings`,
				complete: false
			},
			{
				id: 'training',
				label: 'Add training types',
				description: 'Define the training requirements you want to monitor.',
				href: `${orgPath}/training/types`,
				complete: this.trainingTypeCount > 0,
				feature: 'training'
			},
			{
				id: 'assignments',
				label: 'Review duty assignments',
				description: 'Review the seeded Staff Duty assignment and add other duty types as needed.',
				href: `${orgPath}/calendar/settings`,
				complete: false
			},
			{
				id: 'members',
				label: 'Invite another Organization Member',
				description: 'Add at least one more member for shared access.',
				href: `${orgPath}/settings/members`,
				complete: this.orgMemberCount > 1
			},
			{
				id: 'onboarding',
				label: 'Set up onboarding',
				description: 'Configure template steps for new arrivals.',
				href: `${orgPath}/onboarding/templates`,
				complete: this.onboardingTemplateStepCount > 0,
				feature: 'onboarding'
			},
			{
				id: 'ratings',
				label: 'Configure evals',
				description: 'Add rating scheme entries for evaluation tracking.',
				href: `${orgPath}/evals`,
				complete: this.ratingSchemeEntryCount > 0,
				feature: 'evaluations'
			}
		];
		return items
			.filter(({ feature }) => feature === undefined || !this.data.disabledFeatures.includes(feature))
			.map(({ feature: _feature, ...item }) => item);
	}

	get shouldShowGettingStarted(): boolean {
		if (!this.hasSupportData || this.gettingStartedDismissed) return false;
		if (this.userRole !== 'owner' && this.userRole !== 'admin') return false;

		return this.gettingStartedItems.some((item) => !item.complete);
	}

	applySupportData(data: DashboardSupportData) {
		this.supportData = {
			...data,
			trainingTypeCount: data.trainingTypeCount ?? dashboardTrainingTypeCount(this.data),
			starterConfigurationPacks: data.starterConfigurationPacks ?? []
		};
		this.gettingStartedDismissed = data.gettingStartedDismissed;
	}

	async applyStarterConfigurationPack(
		packId: StarterConfigurationPackId
	): Promise<StarterConfigurationPackApplyResult | null> {
		this.starterPackApplyState = {
			status: 'pending',
			message: null,
			result: null
		};

		try {
			const response = await fetch(`/org/${this.data.orgId}/api/starter-configuration-packs/${packId}/apply`, {
				method: 'POST'
			});
			if (!response.ok) {
				throw new Error(await responseMessage(response, 'Starter pack could not be applied.'));
			}

			const result = (await response.json()) as StarterConfigurationPackApplyResult;
			const hasFailedArtifacts = result.failed.length > 0;
			let refreshWarning: string | null = null;

			try {
				const supportResponse = await fetch(`/org/${this.data.orgId}/api/getting-started`);
				if (!supportResponse.ok) {
					refreshWarning = await responseMessage(supportResponse, 'Checklist could not refresh.');
				} else {
					this.applySupportData((await supportResponse.json()) as DashboardSupportData);
				}
			} catch (error) {
				refreshWarning = errorMessage(error, 'Checklist could not refresh.');
			}

			if (hasFailedArtifacts) {
				this.starterPackApplyState = {
					status: 'error',
					message: 'Some starter artifacts could not be created.',
					result
				};
				return null;
			}

			if (refreshWarning) {
				this.starterPackApplyState = {
					status: 'success',
					message: checklistRefreshWarning(result.packName, refreshWarning),
					result
				};
				return result;
			}

			this.starterPackApplyState = {
				status: 'success',
				message: `${result.packName} applied. You can edit the created setup from each workflow.`,
				result
			};
			return result;
		} catch (error) {
			this.starterPackApplyState = {
				status: 'error',
				message: errorMessage(error, 'Starter pack could not be applied.'),
				result: null
			};
			return null;
		}
	}

	async dismissGettingStarted() {
		this.gettingStartedDismissed = true;
		try {
			const response = await fetch(`/org/${this.data.orgId}/api/getting-started`, { method: 'POST' });
			if (!response.ok) {
				this.gettingStartedDismissed = false;
			}
		} catch {
			this.gettingStartedDismissed = false;
		}
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

function dashboardTrainingTypeCount(data: DashboardPageData): number {
	return data.dashboard?.data?.trainingTypes?.length ?? 0;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
	const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
	return payload?.message ?? payload?.error ?? fallback;
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

function checklistRefreshWarning(packName: string, detail: string): string {
	const base = `${packName} applied, but the setup checklist could not refresh. Reload the page to see the latest setup state.`;
	return detail && detail !== 'Checklist could not refresh.' ? `${base} ${detail}` : base;
}
