import { goto, invalidateAll } from '$app/navigation';
import { resolve } from '$app/paths';
import type {
	PersonnelCounselingRecord,
	PersonnelDetailStreams,
	PersonnelDocument,
	PersonnelExtendedInfo,
	PersonnelFollowUp,
	PersonnelLeaderNote,
	PersonnelReadinessLane,
	PersonnelReadinessLaneKey,
	PersonnelReadinessLaneTone
} from '$features/personnel/personnel-detail.types';
import { archivePersonnel } from '$features/personnel/utils/archivePersonnel';
import { derivePersonnelDocumentTitle } from '$features/personnel/utils/documentTitles';
import { downloadBlob, filenameFromContentDisposition } from '$lib/export/workbook';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';

export type PersonnelDetailTone = PersonnelReadinessLaneTone;

export interface PersonnelDetailWorkspaceInput {
	orgId: string;
	orgUrlSegment?: string;
	person: Personnel;
	groups?: Group[];
	orgName: string;
	detail: PersonnelDetailStreams;
	canArchivePersonnel?: boolean;
}

export type PersonnelDetailWorkspaceInputSource = PersonnelDetailWorkspaceInput | (() => PersonnelDetailWorkspaceInput);

export interface PersonnelDetailWorkspaceDeps {
	fetch?: typeof fetch;
	goto?: typeof goto;
	invalidateAll?: typeof invalidateAll;
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
	invalidateAll,
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

	updatedFollowUps = $state<PersonnelFollowUp[]>([]);
	togglingFollowUpId = $state('');
	followUpError = $state('');
	followUpTitle = $state('');
	followUpNotes = $state('');
	followUpDueDate = $state('');
	followUpSaving = $state(false);

	leaderNoteText = $state('');
	leaderNoteSaving = $state(false);
	leaderNoteError = $state('');
	createdLeaderNotes = $state<PersonnelLeaderNote[]>([]);

	counselingDate = $state(new SvelteDate().toISOString().slice(0, 10));
	counselingTitle = $state('');
	counselingSummary = $state('');
	counselingFile = $state<File | null>(null);
	counselingSaving = $state(false);
	counselingError = $state('');
	createdCounselingRecords = $state<PersonnelCounselingRecord[]>([]);

	documentTitle = $state('');
	documentFile = $state<File | null>(null);
	documentSaving = $state(false);
	documentError = $state('');
	openingDocumentId = $state('');
	createdDocuments = $state<PersonnelDocument[]>([]);

	exportSubmitting = $state(false);
	exportError = $state('');

	constructor(input: PersonnelDetailWorkspaceInputSource, deps: PersonnelDetailWorkspaceDeps = {}) {
		this.#getInput = typeof input === 'function' ? input : () => input;
		this.#deps = { ...defaultDeps, ...deps };
	}

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
				key: 'dutyRoster',
				label: 'Duty Roster',
				promise: this.detail.readinessLanes.dutyRoster
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
			bad: 'border-destructive/20 bg-destructive/10 text-destructive',
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
		const updatedById = new SvelteMap(this.updatedFollowUps.map((item) => [item.id, item]));
		const merged = loaded.map((item) => updatedById.get(item.id) ?? item);
		const loadedIds = new SvelteSet(loaded.map((item) => item.id));
		const created = this.updatedFollowUps.filter((item) => !loadedIds.has(item.id) && item.status !== 'archived');
		return this.sortFollowUps([...created, ...merged.filter((item) => item.status !== 'archived')]);
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
		this.editingBasicInfo = true;
	};

	saveBasicInfo = async (): Promise<void> => {
		this.basicInfoError = '';
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
			if (!response.ok) throw new Error('Unable to update basic info.');
			const previousSlug = this.currentPerson.slug;
			const savedPerson = (await response.json()) as Personnel;
			this.updatedPerson = savedPerson;
			if (savedPerson.slug !== previousSlug) {
				await this.#deps.goto(this.#deps.resolve(`/org/${this.orgUrlSegment}/personnel/${savedPerson.slug}`), {
					replaceState: true,
					invalidateAll: true
				});
			}
			this.editingBasicInfo = false;
		} catch (caught) {
			this.basicInfoError = caught instanceof Error ? caught.message : 'Unable to update basic info.';
		} finally {
			this.basicInfoSaving = false;
		}
	};

	confirmArchive = async (): Promise<void> => {
		if (this.archiveSubmitting) return;
		this.archiveSubmitting = true;
		try {
			const result = await this.#deps.archivePersonnel({
				orgId: this.orgId,
				person: this.currentPerson,
				resourceUrl: `/org/${this.orgId}/personnel/${this.currentPerson.slug ?? this.currentPerson.id}`
			});
			if (result === 'archived') {
				await this.#deps.invalidateAll();
				await this.#deps.goto(this.#deps.resolve(`/org/${this.orgUrlSegment}/personnel`));
			} else {
				this.showArchiveConfirm = false;
			}
		} finally {
			this.archiveSubmitting = false;
		}
	};

	setFollowUpStatus = async (followUp: PersonnelFollowUp, status: 'open' | 'completed'): Promise<void> => {
		this.followUpError = '';
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
			if (!response.ok) throw new Error('Unable to update follow-up.');
			const updated = (await response.json()) as PersonnelFollowUp;
			this.updatedFollowUps = [updated, ...this.updatedFollowUps.filter((item) => item.id !== updated.id)];
		} catch (caught) {
			this.followUpError = caught instanceof Error ? caught.message : 'Unable to update follow-up.';
		} finally {
			this.togglingFollowUpId = '';
		}
	};

	submitFollowUp = async (): Promise<void> => {
		this.followUpError = '';
		const title = this.followUpTitle.trim();
		if (!title) {
			this.followUpError = 'Enter a follow-up title.';
			return;
		}

		this.followUpSaving = true;
		try {
			const response = await this.#deps.fetch(`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/follow-ups`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title,
					notes: this.followUpNotes.trim(),
					dueDate: this.followUpDueDate || null
				})
			});
			if (!response.ok) throw new Error('Unable to add follow-up.');
			const created = (await response.json()) as PersonnelFollowUp;
			this.updatedFollowUps = [created, ...this.updatedFollowUps.filter((item) => item.id !== created.id)];
			this.followUpTitle = '';
			this.followUpNotes = '';
			this.followUpDueDate = '';
		} catch (caught) {
			this.followUpError = caught instanceof Error ? caught.message : 'Unable to add follow-up.';
		} finally {
			this.followUpSaving = false;
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

	submitLeaderNote = async (): Promise<void> => {
		this.leaderNoteError = '';
		const text = this.leaderNoteText.trim();
		if (!text) {
			this.leaderNoteError = 'Enter a leader note before saving.';
			return;
		}

		this.leaderNoteSaving = true;
		try {
			const response = await this.#deps.fetch(
				`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/leader-notes`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ text })
				}
			);
			if (!response.ok) throw new Error('Unable to save leader note.');
			const note = (await response.json()) as PersonnelLeaderNote;
			this.createdLeaderNotes = [note, ...this.createdLeaderNotes];
			this.leaderNoteText = '';
		} catch (caught) {
			this.leaderNoteError = caught instanceof Error ? caught.message : 'Unable to save leader note.';
		} finally {
			this.leaderNoteSaving = false;
		}
	};

	updateCounselingFile = (event: Event): void => {
		const input = event.currentTarget as HTMLInputElement;
		this.counselingFile = input.files?.[0] ?? null;
	};

	updateDocumentFile = (event: Event): void => {
		const input = event.currentTarget as HTMLInputElement;
		this.documentFile = input.files?.[0] ?? null;
		if (this.documentFile && !this.documentTitle.trim()) {
			this.documentTitle = derivePersonnelDocumentTitle({ filename: this.documentFile.name });
		}
	};

	submitDocument = async (): Promise<void> => {
		this.documentError = '';
		if (!this.documentFile) {
			this.documentError = 'Choose a PDF, JPEG, PNG, or HEIC file.';
			return;
		}
		if (!this.documentTitle.trim()) {
			this.documentError = 'Enter a document title.';
			return;
		}

		const formData = new FormData();
		formData.set('title', this.documentTitle.trim());
		formData.set('file', this.documentFile);

		this.documentSaving = true;
		try {
			const response = await this.#deps.fetch(`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/documents`, {
				method: 'POST',
				body: formData
			});
			if (!response.ok) throw new Error('Unable to upload document.');
			const record = (await response.json()) as PersonnelDocument;
			this.createdDocuments = [record, ...this.createdDocuments];
			this.documentTitle = '';
			this.documentFile = null;
		} catch (caught) {
			this.documentError = caught instanceof Error ? caught.message : 'Unable to upload document.';
		} finally {
			this.documentSaving = false;
		}
	};

	openDocument = async (documentId: string): Promise<void> => {
		this.documentError = '';
		this.openingDocumentId = documentId;
		try {
			const response = await this.#deps.fetch(
				`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/documents/${documentId}/download`
			);
			if (!response.ok) throw new Error('Unable to open document.');
			const { url } = (await response.json()) as { url: string };
			this.#deps.openDocumentUrl(url);
		} catch (caught) {
			this.documentError = caught instanceof Error ? caught.message : 'Unable to open document.';
		} finally {
			this.openingDocumentId = '';
		}
	};

	exportPersonnelRecords = async (): Promise<void> => {
		if (this.exportSubmitting) return;
		this.exportSubmitting = true;
		this.exportError = '';
		try {
			const response = await this.#deps.fetch(`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/export`);
			if (!response.ok) {
				throw new Error('Unable to export personnel records.');
			}
			const blob = await response.blob();
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

	submitCounselingRecord = async (): Promise<void> => {
		this.counselingError = '';
		if (!this.counselingFile) {
			this.counselingError = 'Choose a signed counseling PDF.';
			return;
		}
		if (!this.counselingTitle.trim()) {
			this.counselingError = 'Enter a counseling title.';
			return;
		}

		const formData = new FormData();
		formData.set('dateConducted', this.counselingDate);
		formData.set('title', this.counselingTitle.trim());
		formData.set('summary', this.counselingSummary.trim());
		formData.set('file', this.counselingFile);

		this.counselingSaving = true;
		try {
			const response = await this.#deps.fetch(
				`/org/${this.orgId}/api/personnel/${this.currentPerson.id}/counseling-records`,
				{
					method: 'POST',
					body: formData
				}
			);
			if (!response.ok) throw new Error('Unable to upload counseling PDF.');
			const record = (await response.json()) as PersonnelCounselingRecord;
			this.createdCounselingRecords = [record, ...this.createdCounselingRecords];
			this.counselingTitle = '';
			this.counselingSummary = '';
			this.counselingFile = null;
		} catch (caught) {
			this.counselingError = caught instanceof Error ? caught.message : 'Unable to upload counseling PDF.';
		} finally {
			this.counselingSaving = false;
		}
	};
}
