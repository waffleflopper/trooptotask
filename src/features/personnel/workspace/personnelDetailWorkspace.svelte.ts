import { goto, invalidate } from '$app/navigation';
import { resolve } from '$app/paths';
import {
	PERSONNEL_FIRST_NAME_REQUIRED_MESSAGE,
	PERSONNEL_LAST_NAME_REQUIRED_MESSAGE
} from '$features/personnel/contracts';
import type {
	PersonnelExtendedInfo,
	PersonnelLeaderNote,
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUp,
	Group
} from '$features/personnel/contracts';
import type {
	PersonnelDetailStreams,
	PersonnelReadinessLane,
	PersonnelReadinessLaneKey,
	PersonnelReadinessLaneTone
} from '$features/personnel/personnel-detail.types';
import { archivePersonnel, type RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';
import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
import { downloadBlob } from '$lib/utils/downloadBlob';
import { filenameFromContentDisposition } from '$lib/utils/workbook';
import type { Personnel } from '../personnel.types';
import { personnelStore } from '../stores/personnel.svelte';
import { SvelteDate } from 'svelte/reactivity';
import { ArtifactDraft } from './artifactDraft.svelte';
import { PERSONNEL_DETAIL_COUNTS_KEY } from './detailCounts';
import {
	counselingRecordDraftSpec,
	documentDraftSpec,
	followUpDraftSpec,
	leaderNoteDraftSpec,
	type CounselingRecordDraftInput,
	type DocumentDraftInput,
	type FollowUpDraftInput,
	type LeaderNoteDraftInput
} from './personnelArtifactDraftSpecs';

/** A basic-info save changes the header and the readiness lanes; the roster is patched from the response. */
const PERSONNEL_DETAIL_KEYS = ['app:personnel-detail-header', 'app:personnel-detail'] as const;

const NAME_FIELD_ERRORS = new Map<string, 'firstName' | 'lastName'>([
	[PERSONNEL_FIRST_NAME_REQUIRED_MESSAGE, 'firstName'],
	[PERSONNEL_LAST_NAME_REQUIRED_MESSAGE, 'lastName']
]);

export type PersonnelDetailTone = PersonnelReadinessLaneTone;

export interface PersonnelDetailWorkspaceInput {
	orgId: string;
	orgUrlSegment?: string;
	person: Personnel;
	groups?: Group[];
	orgName: string;
	detail: PersonnelDetailStreams;
	canArchivePersonnel?: boolean;
	requestArchiveApproval: RequestPersonnelArchiveApproval;
}

export type PersonnelDetailWorkspaceInputSource = PersonnelDetailWorkspaceInput | (() => PersonnelDetailWorkspaceInput);

export interface PersonnelDetailWorkspaceDeps {
	fetch?: typeof fetch;
	goto?: typeof goto;
	invalidate?: typeof invalidate;
	resolve?: typeof resolve;
	archivePersonnel?: typeof archivePersonnel;
	downloadBlob?: typeof downloadBlob;
	filenameFromContentDisposition?: typeof filenameFromContentDisposition;
	openDocumentUrl?: (url: string) => void;
}

export interface PersonnelDetailReadinessLaneEntry {
	key: PersonnelReadinessLaneKey;
	label: string;
	promise: Promise<PersonnelReadinessLane>;
}

const emptyExtendedInfo: PersonnelExtendedInfo = {
	bloodType: '',
	basd: '',
	dateOfRank: '',
	maritalStatus: '',
	numberOfDependents: null,
	children: [],
	civilianEducation: '',
	militaryEducation: [],
	emergencyContactName: '',
	emergencyContactRelationship: '',
	emergencyContactPhone: '',
	spouseName: '',
	spousePhone: '',
	vehicleMakeModel: '',
	vehiclePlate: '',
	vehicleColor: '',
	personalEmail: '',
	personalPhone: '',
	addressStreet: '',
	addressCity: '',
	addressState: '',
	addressZip: '',
	address: ''
};

const defaultDeps = {
	fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
		init === undefined ? fetch(input) : fetch(input, init),
	goto,
	invalidate,
	resolve,
	archivePersonnel,
	downloadBlob,
	filenameFromContentDisposition,
	openDocumentUrl: (url: string) => {
		if (typeof window !== 'undefined') {
			window.open(url, '_blank', 'noopener,noreferrer');
		}
	}
} satisfies Required<PersonnelDetailWorkspaceDeps>;

export function createPersonnelDetailWorkspace(
	input: PersonnelDetailWorkspaceInputSource,
	deps: PersonnelDetailWorkspaceDeps = {}
): PersonnelDetailWorkspace {
	return new PersonnelDetailWorkspace(input, deps);
}

export class PersonnelDetailWorkspace {
	readonly #getInput: () => PersonnelDetailWorkspaceInput;
	readonly #deps: Required<PersonnelDetailWorkspaceDeps>;
	#disposed = false;

	followUps: ArtifactDraft<FollowUpDraftInput, PersonnelFollowUp>;
	leaderNotes: ArtifactDraft<LeaderNoteDraftInput, PersonnelLeaderNote>;
	counselingRecords: ArtifactDraft<CounselingRecordDraftInput, PersonnelCounselingRecord>;
	documents: ArtifactDraft<DocumentDraftInput, PersonnelDocument>;

	updatedPerson = $state<Personnel | null>(null);
	showDataSheet = $state(false);
	showArchiveConfirm = $state(false);
	archiveSubmitting = $state(false);

	editingBasicInfo = $state(false);
	basicInfoRank = $state('');
	basicInfoFirstName = $state('');
	basicInfoLastName = $state('');
	basicInfoMos = $state('');
	basicInfoClinicRole = $state('');
	basicInfoGroupId = $state('');
	basicInfoEts = $state('');
	basicInfoDeros = $state('');
	basicInfoSaving = $state(false);
	basicInfoError = $state('');
	/** A server rejection that names one name field; it renders on that field, not in the form alert. */
	basicInfoNameError = $state<{ field: 'firstName' | 'lastName'; message: string } | null>(null);

	togglingFollowUpId = $state('');
	openingDocumentId = $state('');

	exportSubmitting = $state(false);
	exportError = $state('');

	constructor(input: PersonnelDetailWorkspaceInputSource, deps: PersonnelDetailWorkspaceDeps = {}) {
		this.#getInput = typeof input === 'function' ? input : () => input;
		this.#deps = { ...defaultDeps, ...deps };
		const draftDeps = {
			context: () => ({ orgId: this.orgId, personId: this.currentPerson.id }),
			fetch: this.#deps.fetch
		};
		this.followUps = new ArtifactDraft(followUpDraftSpec, draftDeps);
		this.leaderNotes = new ArtifactDraft(leaderNoteDraftSpec, draftDeps);
		this.counselingRecords = new ArtifactDraft(counselingRecordDraftSpec, draftDeps);
		this.documents = new ArtifactDraft(documentDraftSpec, draftDeps);
	}

	dispose = (): void => {
		this.#disposed = true;
	};

	get #input(): PersonnelDetailWorkspaceInput {
		return this.#getInput();
	}

	get orgId(): string {
		return this.#input.orgId;
	}

	get orgUrlSegment(): string {
		return this.#input.orgUrlSegment ?? this.#input.orgId;
	}

	get detail(): PersonnelDetailStreams {
		return this.#input.detail;
	}

	get canArchivePersonnel(): boolean {
		return this.#input.canArchivePersonnel ?? false;
	}

	get currentPerson(): Personnel {
		return this.updatedPerson ?? this.#input.person;
	}

	get displayName(): string {
		return `${this.currentPerson.rank} ${this.currentPerson.lastName}, ${this.currentPerson.firstName}`;
	}

	get detailBasePath(): string {
		return `/org/${this.orgUrlSegment}/personnel/${this.currentPerson.slug}`;
	}

	get groupOptions(): Array<{ value: string; label: string }> {
		return [
			{ value: '', label: 'No Group Assigned' },
			...(this.#input.groups ?? []).map((group) => ({ value: group.id, label: group.name || 'Unnamed group' }))
		];
	}

	get emptyExtendedInfo(): PersonnelExtendedInfo {
		return emptyExtendedInfo;
	}

	get readinessLaneEntries(): PersonnelDetailReadinessLaneEntry[] {
		return [
			{
				key: 'availability',
				label: 'Availability',
				promise: this.detail.readinessLanes.availability
			},
			{
				key: 'training',
				label: 'Training',
				promise: this.detail.readinessLanes.training
			},
			{
				key: 'criticalTasks',
				label: 'Critical Tasks',
				promise: this.detail.readinessLanes.criticalTasks
			},
			{
				key: 'ratingScheme',
				label: 'Rating Scheme',
				promise: this.detail.readinessLanes.ratingScheme
			},
			{
				key: 'lossTracking',
				label: 'Loss Tracking',
				promise: this.detail.readinessLanes.lossTracking
			}
		];
	}

	get adminRows(): string[][] {
		return [
			['Rank', this.currentPerson.rank || 'Not set'],
			['Name', `${this.currentPerson.lastName}, ${this.currentPerson.firstName}`],
			['MOS', this.currentPerson.mos || 'Not set'],
			['Duty role', this.currentPerson.clinicRole || 'Not set'],
			['Group', this.currentPerson.groupName || this.#input.orgName],
			['ETS', this.currentPerson.ets ? this.formatDate(this.currentPerson.ets) : 'Not set'],
			['PCS / DEROS', this.currentPerson.deros ? this.formatDate(this.currentPerson.deros) : 'Not set']
		];
	}

	get archiveLabel(): string {
		return `Archive ${this.currentPerson.rank} ${this.currentPerson.lastName}, ${this.currentPerson.firstName}`;
	}

	get archiveMessage(): string {
		return `Archive ${this.currentPerson.rank} ${this.currentPerson.lastName}? They will be removed from active rosters, calendars, and reports, but their records remain available in archived personnel.`;
	}

	toneClass(tone: PersonnelDetailTone): string {
		return {
			good: 'border-success/20 bg-success-muted text-success-foreground',
			watch: 'border-warning/20 bg-warning-muted text-warning-foreground',
			bad: 'border-danger/20 bg-danger-muted text-danger-foreground',
			info: 'border-info/20 bg-info-muted text-info-foreground',
			neutral: 'border-border bg-muted text-muted-foreground'
		}[tone];
	}

	statusTone(status: string): PersonnelDetailTone {
		if (['uploaded', 'completed'].includes(status)) return 'good';
		if (['needs-title', 'in-progress'].includes(status)) return 'watch';
		return 'neutral';
	}

	formatDate(value: string): string {
		const date = new SvelteDate(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}

	formatBytes(bytes: number): string {
		if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${bytes} B`;
	}

	mergeUpdatedFollowUps(loaded: PersonnelFollowUp[]): PersonnelFollowUp[] {
		return this.sortFollowUps(this.followUps.mergeLoaded(loaded).filter((item) => item.status !== 'archived'));
	}

	sortFollowUps(items: PersonnelFollowUp[]): PersonnelFollowUp[] {
		const statusRank: Record<PersonnelFollowUp['status'], number> = { open: 0, completed: 1, archived: 2 };
		return [...items].sort((a, b) => {
			const statusDelta = statusRank[a.status] - statusRank[b.status];
			if (statusDelta !== 0) return statusDelta;
			return b.createdAt.localeCompare(a.createdAt);
		});
	}

	startBasicInfoEdit = (): void => {
		this.basicInfoRank = this.currentPerson.rank;
		this.basicInfoFirstName = this.currentPerson.firstName;
		this.basicInfoLastName = this.currentPerson.lastName;
		this.basicInfoMos = this.currentPerson.mos;
		this.basicInfoClinicRole = this.currentPerson.clinicRole;
		this.basicInfoGroupId = this.currentPerson.groupId ?? '';
		this.basicInfoEts = this.currentPerson.ets ?? '';
		this.basicInfoDeros = this.currentPerson.deros ?? '';
		this.basicInfoError = '';
		this.basicInfoNameError = null;
		this.editingBasicInfo = true;
	};

	saveBasicInfo = async (): Promise<void> => {
		if (this.#disposed) return;
		this.basicInfoError = '';
		this.basicInfoNameError = null;
		this.basicInfoSaving = true;
		try {
			const response = await this.#deps.fetch(`/org/${this.orgId}/api/personnel`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: this.currentPerson.id,
					rank: this.basicInfoRank.trim(),
					lastName: this.basicInfoLastName.trim(),
					firstName: this.basicInfoFirstName.trim(),
					mos: this.basicInfoMos.trim(),
					clinicRole: this.basicInfoClinicRole.trim(),
					groupId: this.basicInfoGroupId || null,
					ets: this.basicInfoEts || null,
					deros: this.basicInfoDeros || null
				})
			});
			if (this.#disposed) return;
			if (!response.ok) {
				const failure = await buildRequestError(response, 'PUT', 'personnel');
				const field = NAME_FIELD_ERRORS.get(failure.message);
				if (field) {
					this.basicInfoNameError = { field, message: failure.message };
					return;
				}
				throw failure;
			}
			const previousSlug = this.currentPerson.slug;
			const savedPerson = (await response.json()) as Personnel;
			if (this.#disposed) return;
			this.updatedPerson = savedPerson;
			personnelStore.updateLocalWhere(
				(item) => item.id === savedPerson.id,
				() => savedPerson
			);
			if (savedPerson.slug !== previousSlug) {
				await this.#deps.goto(this.#deps.resolve(`/org/${this.orgUrlSegment}/personnel/${savedPerson.slug}`), {
					replaceState: true,
					invalidate: [...PERSONNEL_DETAIL_KEYS]
				});
			} else {
				await Promise.all(PERSONNEL_DETAIL_KEYS.map((key) => this.#deps.invalidate(key)));
			}
			this.editingBasicInfo = false;
		} catch (caught) {
			this.basicInfoError = rejectedRequestMessage(caught, 'Unable to update basic info.');
		} finally {
			this.basicInfoSaving = false;
		}
	};

	confirmArchive = async (): Promise<void> => {
		if (this.#disposed || this.archiveSubmitting) return;
		this.archiveSubmitting = true;
		try {
			const result = await this.#deps.archivePersonnel({
				orgId: this.orgId,
				person: this.currentPerson,
				requestArchiveApproval: this.#input.requestArchiveApproval,
				resourceUrl: `/org/${this.orgId}/personnel/${this.currentPerson.slug ?? this.currentPerson.id}`
			});
			if (this.#disposed) return;
			if (result === 'archived') {
				await this.#deps.goto(this.#deps.resolve(`/org/${this.orgUrlSegment}/personnel`), {
					invalidate: ['app:personnel-data']
				});
			} else {
				this.showArchiveConfirm = false;
			}
		} finally {
			this.archiveSubmitting = false;
		}
	};

	setFollowUpStatus = async (followUp: PersonnelFollowUp, status: 'open' | 'completed'): Promise<void> => {
		this.followUps.error = '';
		this.togglingFollowUpId = followUp.id;
		try {
			const response = await this.#deps.fetch(
				`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/follow-ups/${followUp.id}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ status })
				}
			);
			if (!response.ok) throw await buildRequestError(response, 'PATCH', 'follow-up');
			const updated = (await response.json()) as Partial<PersonnelFollowUp>;
			this.followUps.upsert({ ...followUp, ...updated });
			void this.#deps.invalidate(PERSONNEL_DETAIL_COUNTS_KEY);
		} catch (caught) {
			this.followUps.error = rejectedRequestMessage(caught, 'Unable to update follow-up.');
		} finally {
			this.togglingFollowUpId = '';
		}
	};

	getContactRows(info: PersonnelExtendedInfo): string[][] {
		return [
			['Blood type', info.bloodType || 'Not set'],
			['BASD', info.basd ? this.formatDate(info.basd) : 'Not set'],
			['Date of rank', info.dateOfRank ? this.formatDate(info.dateOfRank) : 'Not set'],
			['Personal phone', info.personalPhone || 'Not set'],
			['Personal email', info.personalEmail || 'Not set'],
			['Address', info.address || 'Not set'],
			[
				'Emergency contact',
				info.emergencyContactName
					? `${info.emergencyContactName} (${info.emergencyContactRelationship || 'relationship not set'})`
					: 'Not set'
			],
			['Emergency phone', info.emergencyContactPhone || 'Not set'],
			['Spouse', info.spouseName ? `${info.spouseName}, ${info.spousePhone || 'phone not set'}` : 'Not set'],
			['Vehicle', [info.vehicleColor, info.vehicleMakeModel, info.vehiclePlate].filter(Boolean).join(', ') || 'Not set']
		];
	}

	updateCounselingFile = (event: Event): void => {
		const input = event.currentTarget as HTMLInputElement;
		this.counselingRecords.selectFile(input.files?.[0] ?? null);
	};

	updateDocumentFile = (event: Event): void => {
		const input = event.currentTarget as HTMLInputElement;
		this.documents.selectFile(input.files?.[0] ?? null);
	};

	openDocument = async (documentId: string): Promise<void> => {
		if (this.#disposed) return;
		this.documents.error = '';
		this.openingDocumentId = documentId;
		try {
			const response = await this.#deps.fetch(
				`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/documents/${documentId}/download`
			);
			if (this.#disposed) return;
			if (!response.ok) throw new Error('Unable to open document.');
			const { url } = (await response.json()) as { url: string };
			if (this.#disposed) return;
			this.#deps.openDocumentUrl(url);
		} catch (caught) {
			this.documents.error = caught instanceof Error ? caught.message : 'Unable to open document.';
		} finally {
			this.openingDocumentId = '';
		}
	};

	exportPersonnelRecords = async (): Promise<void> => {
		if (this.#disposed || this.exportSubmitting) return;
		this.exportSubmitting = true;
		this.exportError = '';
		try {
			const response = await this.#deps.fetch(`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/export`);
			if (this.#disposed) return;
			if (!response.ok) {
				throw new Error('Unable to export personnel records.');
			}
			const blob = await response.blob();
			if (this.#disposed) return;
			const fallbackName = `${this.currentPerson.rank}-${this.currentPerson.lastName}-records.xlsx`;
			this.#deps.downloadBlob(
				blob,
				this.#deps.filenameFromContentDisposition(response.headers.get('Content-Disposition'), fallbackName)
			);
		} catch (caught) {
			this.exportError = caught instanceof Error ? caught.message : 'Unable to export personnel records.';
		} finally {
			this.exportSubmitting = false;
		}
	};
}
