<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import SoldierDataSheetModal from './SoldierDataSheetModal.svelte';
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
	import type { Personnel } from '$lib/types';
	import type { Group } from '$lib/stores/groups.svelte';
	import { cn } from '$lib/utils';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';

	interface Props {
		orgId: string;
		person: Personnel;
		roster: Personnel[];
		groups?: Group[];
		orgName: string;
		detail: PersonnelDetailStreams;
	}

	type Tone = PersonnelReadinessLaneTone;

	interface ReadinessLaneEntry {
		key: PersonnelReadinessLaneKey;
		label: string;
		promise: Promise<PersonnelReadinessLane>;
	}

	let { orgId, person, roster, groups = [], orgName, detail }: Props = $props();
	let updatedPerson = $state<Personnel | null>(null);
	let showDataSheet = $state(false);
	let editingBasicInfo = $state(false);
	let basicInfoRank = $state('');
	let basicInfoFirstName = $state('');
	let basicInfoLastName = $state('');
	let basicInfoMos = $state('');
	let basicInfoClinicRole = $state('');
	let basicInfoGroupId = $state('');
	let basicInfoEts = $state('');
	let basicInfoDeros = $state('');
	let basicInfoSaving = $state(false);
	let basicInfoError = $state('');
	let updatedFollowUps = $state<PersonnelFollowUp[]>([]);
	let togglingFollowUpId = $state('');
	let followUpError = $state('');
	let followUpTitle = $state('');
	let followUpNotes = $state('');
	let followUpDueDate = $state('');
	let followUpSaving = $state(false);
	let leaderNoteText = $state('');
	let leaderNoteSaving = $state(false);
	let leaderNoteError = $state('');
	let createdLeaderNotes = $state<PersonnelLeaderNote[]>([]);
	let counselingDate = $state(new Date().toISOString().slice(0, 10));
	let counselingTitle = $state('');
	let counselingSummary = $state('');
	let counselingFile = $state<File | null>(null);
	let counselingSaving = $state(false);
	let counselingError = $state('');
	let createdCounselingRecords = $state<PersonnelCounselingRecord[]>([]);
	let documentTitle = $state('');
	let documentFile = $state<File | null>(null);
	let documentSaving = $state(false);
	let documentError = $state('');
	let openingDocumentId = $state('');
	let createdDocuments = $state<PersonnelDocument[]>([]);

	const currentPerson = $derived(updatedPerson ?? person);
	const displayName = $derived(`${currentPerson.rank} ${currentPerson.lastName}, ${currentPerson.firstName}`);
	const detailBasePath = $derived(`/org/${orgId}/personnel/${currentPerson.slug}`);
	const groupOptions = $derived([
		{ value: '', label: 'No Group Assigned' },
		...groups.map((group) => ({ value: group.id, label: group.name || 'Unnamed group' }))
	]);
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

	const readinessLaneEntries = $derived<ReadinessLaneEntry[]>([
		{
			key: 'availability',
			label: 'Availability',
			promise: detail.readinessLanes.availability
		},
		{
			key: 'training',
			label: 'Training',
			promise: detail.readinessLanes.training
		},
		{
			key: 'criticalTasks',
			label: 'Critical Tasks',
			promise: detail.readinessLanes.criticalTasks
		},
		{
			key: 'dutyRoster',
			label: 'Duty Roster',
			promise: detail.readinessLanes.dutyRoster
		},
		{
			key: 'ratingScheme',
			label: 'Rating Scheme',
			promise: detail.readinessLanes.ratingScheme
		},
		{
			key: 'lossTracking',
			label: 'Loss Tracking',
			promise: detail.readinessLanes.lossTracking
		}
	]);

	const adminRows = $derived([
		['Rank', currentPerson.rank || 'Not set'],
		['Name', `${currentPerson.lastName}, ${currentPerson.firstName}`],
		['MOS', currentPerson.mos || 'Not set'],
		['Duty role', currentPerson.clinicRole || 'Not set'],
		['Group', currentPerson.groupName || orgName],
		['ETS', currentPerson.ets ? formatDate(currentPerson.ets) : 'Not set'],
		['PCS / DEROS', currentPerson.deros ? formatDate(currentPerson.deros) : 'Not set']
	]);

	function toneClass(tone: Tone) {
		return {
			good: 'border-success/20 bg-success-muted text-success-foreground',
			watch: 'border-warning/20 bg-warning-muted text-warning-foreground',
			bad: 'border-destructive/20 bg-destructive/10 text-destructive',
			info: 'border-info/20 bg-info-muted text-info-foreground',
			neutral: 'border-border bg-muted text-muted-foreground'
		}[tone];
	}

	function statusTone(status: string): Tone {
		if (['uploaded', 'completed'].includes(status)) return 'good';
		if (['needs-title', 'in-progress'].includes(status)) return 'watch';
		return 'neutral';
	}

	function formatDate(value: string) {
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}

	function formatBytes(bytes: number) {
		if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${bytes} B`;
	}

	function documentTitleFromFilename(filename: string) {
		const name = filename.split(/[\\/]/).pop() ?? '';
		const base = name.replace(/\.[^.]+$/, '');
		return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Uploaded document';
	}

	function fileNameFromPath(path: string) {
		return path.split(/[\\/]/).pop() ?? path;
	}

	function mergeUpdatedFollowUps(loaded: PersonnelFollowUp[]): PersonnelFollowUp[] {
		const updatedById = new Map(updatedFollowUps.map((item) => [item.id, item]));
		const merged = loaded.map((item) => updatedById.get(item.id) ?? item);
		const loadedIds = new Set(loaded.map((item) => item.id));
		const created = updatedFollowUps.filter((item) => !loadedIds.has(item.id) && item.status !== 'archived');
		return sortFollowUps([...created, ...merged.filter((item) => item.status !== 'archived')]);
	}

	function sortFollowUps(items: PersonnelFollowUp[]): PersonnelFollowUp[] {
		const statusRank: Record<PersonnelFollowUp['status'], number> = { open: 0, completed: 1, archived: 2 };
		return [...items].sort((a, b) => {
			const statusDelta = statusRank[a.status] - statusRank[b.status];
			if (statusDelta !== 0) return statusDelta;
			return b.createdAt.localeCompare(a.createdAt);
		});
	}

	function startBasicInfoEdit() {
		basicInfoRank = currentPerson.rank;
		basicInfoFirstName = currentPerson.firstName;
		basicInfoLastName = currentPerson.lastName;
		basicInfoMos = currentPerson.mos;
		basicInfoClinicRole = currentPerson.clinicRole;
		basicInfoGroupId = currentPerson.groupId ?? '';
		basicInfoEts = currentPerson.ets ?? '';
		basicInfoDeros = currentPerson.deros ?? '';
		basicInfoError = '';
		editingBasicInfo = true;
	}

	async function saveBasicInfo() {
		basicInfoError = '';
		basicInfoSaving = true;
		try {
			const response = await fetch(`/org/${orgId}/api/personnel`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: currentPerson.id,
					rank: basicInfoRank.trim(),
					lastName: basicInfoLastName.trim(),
					firstName: basicInfoFirstName.trim(),
					mos: basicInfoMos.trim(),
					clinicRole: basicInfoClinicRole.trim(),
					groupId: basicInfoGroupId || null,
					ets: basicInfoEts || null,
					deros: basicInfoDeros || null
				})
			});
			if (!response.ok) throw new Error('Unable to update basic info.');
			const previousSlug = currentPerson.slug;
			const savedPerson = (await response.json()) as Personnel;
			updatedPerson = savedPerson;
			if (savedPerson.slug !== previousSlug) {
				replaceState(resolve(`/org/${orgId}/personnel/${savedPerson.slug}`), {});
			}
			editingBasicInfo = false;
		} catch (caught) {
			basicInfoError = caught instanceof Error ? caught.message : 'Unable to update basic info.';
		} finally {
			basicInfoSaving = false;
		}
	}

	async function setFollowUpStatus(followUp: PersonnelFollowUp, status: 'open' | 'completed') {
		followUpError = '';
		togglingFollowUpId = followUp.id;
		try {
			const response = await fetch(`/org/${orgId}/api/personnel/${currentPerson.id}/follow-ups/${followUp.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (!response.ok) throw new Error('Unable to update follow-up.');
			const updated = (await response.json()) as PersonnelFollowUp;
			updatedFollowUps = [updated, ...updatedFollowUps.filter((item) => item.id !== updated.id)];
		} catch (caught) {
			followUpError = caught instanceof Error ? caught.message : 'Unable to update follow-up.';
		} finally {
			togglingFollowUpId = '';
		}
	}

	async function submitFollowUp() {
		followUpError = '';
		const title = followUpTitle.trim();
		if (!title) {
			followUpError = 'Enter a follow-up title.';
			return;
		}

		followUpSaving = true;
		try {
			const response = await fetch(`/org/${orgId}/api/personnel/${currentPerson.id}/follow-ups`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title,
					notes: followUpNotes.trim(),
					dueDate: followUpDueDate || null
				})
			});
			if (!response.ok) throw new Error('Unable to add follow-up.');
			const created = (await response.json()) as PersonnelFollowUp;
			updatedFollowUps = [created, ...updatedFollowUps.filter((item) => item.id !== created.id)];
			followUpTitle = '';
			followUpNotes = '';
			followUpDueDate = '';
		} catch (caught) {
			followUpError = caught instanceof Error ? caught.message : 'Unable to add follow-up.';
		} finally {
			followUpSaving = false;
		}
	}

	function getContactRows(info: PersonnelExtendedInfo): string[][] {
		return [
			['Blood type', info.bloodType || 'Not set'],
			['BASD', info.basd ? formatDate(info.basd) : 'Not set'],
			['Date of rank', info.dateOfRank ? formatDate(info.dateOfRank) : 'Not set'],
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

	async function submitLeaderNote() {
		leaderNoteError = '';
		const text = leaderNoteText.trim();
		if (!text) {
			leaderNoteError = 'Enter a leader note before saving.';
			return;
		}

		leaderNoteSaving = true;
		try {
			const response = await fetch(`/org/${orgId}/api/personnel/${currentPerson.id}/leader-notes`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text })
			});
			if (!response.ok) throw new Error('Unable to save leader note.');
			const note = (await response.json()) as PersonnelLeaderNote;
			createdLeaderNotes = [note, ...createdLeaderNotes];
			leaderNoteText = '';
		} catch (caught) {
			leaderNoteError = caught instanceof Error ? caught.message : 'Unable to save leader note.';
		} finally {
			leaderNoteSaving = false;
		}
	}

	function updateCounselingFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		counselingFile = input.files?.[0] ?? null;
	}

	function updateDocumentFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		documentFile = input.files?.[0] ?? null;
		if (documentFile && !documentTitle.trim()) {
			documentTitle = documentTitleFromFilename(documentFile.name);
		}
	}

	async function submitDocument() {
		documentError = '';
		if (!documentFile) {
			documentError = 'Choose a PDF, JPEG, PNG, or HEIC file.';
			return;
		}
		if (!documentTitle.trim()) {
			documentError = 'Enter a document title.';
			return;
		}

		const formData = new FormData();
		formData.set('title', documentTitle.trim());
		formData.set('file', documentFile);

		documentSaving = true;
		try {
			const response = await fetch(`/org/${orgId}/api/personnel/${currentPerson.id}/documents`, {
				method: 'POST',
				body: formData
			});
			if (!response.ok) throw new Error('Unable to upload document.');
			const record = (await response.json()) as PersonnelDocument;
			createdDocuments = [record, ...createdDocuments];
			documentTitle = '';
			documentFile = null;
		} catch (caught) {
			documentError = caught instanceof Error ? caught.message : 'Unable to upload document.';
		} finally {
			documentSaving = false;
		}
	}

	async function openDocument(documentId: string) {
		documentError = '';
		openingDocumentId = documentId;
		try {
			const response = await fetch(`/org/${orgId}/api/personnel/${currentPerson.id}/documents/${documentId}/download`);
			if (!response.ok) throw new Error('Unable to open document.');
			const { url } = (await response.json()) as { url: string };
			window.open(url, '_blank', 'noopener,noreferrer');
		} catch (caught) {
			documentError = caught instanceof Error ? caught.message : 'Unable to open document.';
		} finally {
			openingDocumentId = '';
		}
	}

	async function submitCounselingRecord() {
		counselingError = '';
		if (!counselingFile) {
			counselingError = 'Choose a signed counseling PDF.';
			return;
		}
		if (!counselingTitle.trim()) {
			counselingError = 'Enter a counseling title.';
			return;
		}

		const formData = new FormData();
		formData.set('dateConducted', counselingDate);
		formData.set('title', counselingTitle.trim());
		formData.set('summary', counselingSummary.trim());
		formData.set('file', counselingFile);

		counselingSaving = true;
		try {
			const response = await fetch(`/org/${orgId}/api/personnel/${currentPerson.id}/counseling-records`, {
				method: 'POST',
				body: formData
			});
			if (!response.ok) throw new Error('Unable to upload counseling PDF.');
			const record = (await response.json()) as PersonnelCounselingRecord;
			createdCounselingRecords = [record, ...createdCounselingRecords];
			counselingTitle = '';
			counselingSummary = '';
			counselingFile = null;
		} catch (caught) {
			counselingError = caught instanceof Error ? caught.message : 'Unable to upload counseling PDF.';
		} finally {
			counselingSaving = false;
		}
	}
</script>

<svelte:head>
	<title>{displayName} - Personnel</title>
</svelte:head>

<main class="min-h-full bg-background text-foreground">
	<section class="flex min-h-full flex-col">
		<div class="grid gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<section class="space-y-5">
				<section class="grid gap-3 lg:grid-cols-3" aria-label="Readiness summary">
					{#each readinessLaneEntries as lane (lane.key)}
						{#await lane.promise}
							{@render ReadinessLaneSkeleton(lane.label)}
						{:then loadedLane}
							{@render ReadinessLaneCard(loadedLane)}
						{:catch}
							{@render ReadinessLaneCard({
								label: lane.label,
								value: 'Unavailable',
								detail: `${lane.label} could not be loaded.`,
								tone: 'neutral'
							})}
						{/await}
					{/each}
				</section>

				{#await detail.followUps}
					{@render PanelSkeleton('Leader follow-ups')}
				{:then openFollowUps}
					{@const followUps = mergeUpdatedFollowUps(openFollowUps)}
					{@const visibleFollowUps = followUps.filter((item) => item.status === 'open').slice(0, 5)}
					{@const openCount = followUps.filter((item) => item.status === 'open').length}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<ClipboardListIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Leader follow-ups</h2>
							</div>
							<div class="flex items-center gap-2">
								<Badge variant="warning">{openCount} open</Badge>
								<Button href={`${detailBasePath}/follow-ups`} variant="outline" size="sm">Show all</Button>
							</div>
						</div>
						{#if followUpError}
							<p class="border-b px-4 py-3 text-sm text-destructive">{followUpError}</p>
						{/if}
						<form class="grid gap-3 border-b p-4" onsubmit={(event) => (event.preventDefault(), submitFollowUp())}>
							<div class="grid gap-3 md:grid-cols-[1fr_10rem_auto]">
								<Input bind:value={followUpTitle} aria-label="Follow-up title" placeholder="Follow-up title" />
								<DatePicker bind:value={followUpDueDate} aria-label="Follow-up due date" placeholder="Due date" />
								<Button type="submit" size="sm" disabled={followUpSaving}>
									{followUpSaving ? 'Adding...' : 'Add'}
								</Button>
							</div>
							<Textarea bind:value={followUpNotes} rows={2} aria-label="Follow-up notes" placeholder="Optional notes" />
						</form>
						<div class="divide-y">
							{#if followUps.length === 0}
								<p class="p-4 text-sm text-muted-foreground">No follow-ups have been added for this Soldier yet.</p>
							{:else if visibleFollowUps.length === 0}
								<p class="p-4 text-sm text-muted-foreground">No open follow-ups.</p>
							{:else}
								{#each visibleFollowUps as item, index (item.id)}
									<div class="grid gap-3 p-4 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
										<div class="grid size-7 place-items-center rounded-full border bg-muted text-xs font-semibold">
											{index + 1}
										</div>
										<div class="min-w-0">
											<p class="text-sm font-medium">{item.title}</p>
											{#if item.notes}
												<p class="mt-1 text-xs text-muted-foreground">{item.notes}</p>
											{/if}
											{#if item.dueDate}
												<p class="mt-1 text-xs text-muted-foreground">Due {formatDate(item.dueDate)}</p>
											{/if}
										</div>
										<Button
											variant="outline"
											size="sm"
											disabled={togglingFollowUpId === item.id}
											aria-label={`${item.status === 'completed' ? 'Reopen' : 'Complete'} ${item.title}`}
											onclick={() => setFollowUpStatus(item, item.status === 'completed' ? 'open' : 'completed')}
										>
											{item.status === 'completed' ? 'Reopen' : 'Complete'}
										</Button>
									</div>
								{/each}
							{/if}
						</div>
					</section>
				{/await}

				{#await detail.counselingRecords}
					{@render PanelSkeleton('Recent counseling and uploads')}
				{:then counselingRecords}
					{@const records = [...createdCounselingRecords, ...counselingRecords]}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<FileTextIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Recent counseling and uploads</h2>
							</div>
							<div class="flex items-center gap-2">
								<Button href={`${detailBasePath}/counselings`} variant="outline" size="sm">Show all</Button>
							</div>
						</div>
						<form
							class="grid gap-3 border-b p-4"
							onsubmit={(event) => (event.preventDefault(), submitCounselingRecord())}
						>
							<div class="grid gap-3 md:grid-cols-[9rem_1fr]">
								<DatePicker
									bind:value={counselingDate}
									aria-label="Counseling date conducted"
									placeholder="Date conducted"
								/>
								<Input bind:value={counselingTitle} aria-label="Counseling title" placeholder="Counseling title" />
							</div>
							<Textarea
								bind:value={counselingSummary}
								rows={2}
								aria-label="Counseling summary"
								placeholder="Optional summary"
							/>
							<div class="flex flex-wrap items-center justify-between gap-3">
								<Input
									type="file"
									accept="application/pdf,.pdf"
									aria-label="Counseling PDF"
									onchange={updateCounselingFile}
								/>
								<Button type="submit" size="sm" disabled={counselingSaving}>
									{counselingSaving ? 'Uploading...' : 'Upload PDF'}
								</Button>
							</div>
							{#if counselingError}
								<p class="text-sm text-destructive">{counselingError}</p>
							{/if}
						</form>
						<div class="divide-y">
							{#if records.length === 0}
								<p class="p-4 text-sm text-muted-foreground">
									No counseling records have been added for this Soldier yet.
								</p>
							{/if}
							{#each records.slice(0, 5) as record (record.id)}
								<article class="grid gap-3 p-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
									<div>
										<p class="text-sm font-medium">{formatDate(record.dateConducted)}</p>
										<p class="text-xs text-muted-foreground">Uploaded by {record.uploadedBy}</p>
									</div>
									<div>
										<div class="flex flex-wrap items-center gap-2">
											<p class="font-medium">{record.title}</p>
											{@render ToneBadge(statusTone(record.status), record.status)}
										</div>
										{#if record.summary}
											<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{record.summary}</p>
										{/if}
										<p class="mt-2 text-xs text-muted-foreground">File: {fileNameFromPath(record.filePath)}</p>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/await}

				{#await detail.documents}
					{@render PanelSkeleton('Recent documents')}
				{:then loadedDocuments}
					{@const documents = [...createdDocuments, ...loadedDocuments]}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<FileTextIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Recent documents</h2>
							</div>
							<Button href={`${detailBasePath}/documents`} variant="outline" size="sm">Show all</Button>
						</div>
						<form class="grid gap-3 border-b p-4" onsubmit={(event) => (event.preventDefault(), submitDocument())}>
							<div class="grid gap-3 md:grid-cols-[1fr_auto]">
								<Input bind:value={documentTitle} aria-label="Document title" placeholder="Document title" />
								<Button type="submit" size="sm" disabled={documentSaving}>
									{documentSaving ? 'Uploading...' : 'Upload'}
								</Button>
							</div>
							<Input
								type="file"
								accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic"
								aria-label="Document file"
								onchange={updateDocumentFile}
							/>
							{#if documentError}
								<p class="text-sm text-destructive">{documentError}</p>
							{/if}
						</form>
						<div class="divide-y">
							{#if documents.length === 0}
								<p class="p-4 text-sm text-muted-foreground">No documents have been uploaded for this Soldier yet.</p>
							{/if}
							{#each documents.slice(0, 5) as document (document.id)}
								<article class="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_9rem]">
									<div>
										<p class="font-medium">{document.title}</p>
										<p class="mt-1 text-xs text-muted-foreground">Uploaded by {document.uploadedBy}</p>
									</div>
									<div class="grid gap-2 text-sm text-muted-foreground lg:justify-items-end lg:text-right">
										<div>
											<p>{formatBytes(document.fileSizeBytes)}</p>
											<p>{formatDate(document.createdAt.slice(0, 10))}</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={openingDocumentId === document.id}
											onclick={() => openDocument(document.id)}
										>
											{openingDocumentId === document.id ? 'Opening...' : 'Open'}
										</Button>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/await}
			</section>

			<aside class="space-y-5">
				<section class="rounded-md border bg-card">
					<div class="flex items-center justify-between gap-3 border-b p-4">
						<div class="flex items-center gap-2">
							<UserRoundIcon aria-hidden="true" size={18} />
							<h2 class="font-semibold">Service details</h2>
						</div>
						{#if !editingBasicInfo}
							<Button type="button" variant="outline" size="sm" onclick={startBasicInfoEdit}>Edit basic info</Button>
						{/if}
					</div>
					{#if editingBasicInfo}
						<form class="space-y-3 p-4" onsubmit={(event) => (event.preventDefault(), saveBasicInfo())}>
							<Input bind:value={basicInfoRank} aria-label="Rank" />
							<div class="grid gap-3 sm:grid-cols-2">
								<Input bind:value={basicInfoFirstName} aria-label="First name" />
								<Input bind:value={basicInfoLastName} aria-label="Last name" />
							</div>
							<div class="grid gap-3 sm:grid-cols-2">
								<Input bind:value={basicInfoMos} aria-label="MOS" />
								<Input bind:value={basicInfoClinicRole} aria-label="Duty role" />
							</div>
							<Combobox.Root items={groupOptions} bind:value={basicInfoGroupId} label="Group" autoHighlight>
								<Combobox.Trigger clearable placeholder="No Group Assigned" aria-label="Group" />
								<Combobox.Content>
									<Combobox.Search placeholder="Search groups..." />
									<Combobox.Empty>No groups found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
							<div class="grid gap-3 sm:grid-cols-2">
								<DatePicker bind:value={basicInfoEts} aria-label="ETS" placeholder="ETS" />
								<DatePicker bind:value={basicInfoDeros} aria-label="PCS / DEROS" placeholder="PCS / DEROS" />
							</div>
							{#if basicInfoError}
								<p class="text-sm text-destructive">{basicInfoError}</p>
							{/if}
							<div class="flex justify-end gap-2">
								<Button type="button" variant="outline" size="sm" onclick={() => (editingBasicInfo = false)}
									>Cancel</Button
								>
								<Button type="submit" size="sm" disabled={basicInfoSaving}>
									{basicInfoSaving ? 'Saving...' : 'Save basic info'}
								</Button>
							</div>
						</form>
					{:else}
						{@render FactList(adminRows)}
					{/if}
				</section>

				{#await detail.extendedInfo}
					{@render PanelSkeleton('Extended info')}
				{:then loadedExtendedInfo}
					{@const extendedInfo = loadedExtendedInfo ?? emptyExtendedInfo}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<PhoneIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Extended info</h2>
							</div>
							<Button variant="outline" size="sm" onclick={() => (showDataSheet = true)}>More info</Button>
						</div>
						{@render FactList(getContactRows(extendedInfo))}
					</section>
					{#if showDataSheet}
						<SoldierDataSheetModal
							{orgId}
							personnelId={person.id}
							initialInfo={extendedInfo}
							onClose={() => (showDataSheet = false)}
						/>
					{/if}
				{:catch}
					<section class="rounded-md border bg-card p-4">
						<div class="flex items-center gap-2">
							<PhoneIcon aria-hidden="true" size={18} />
							<h2 class="font-semibold">Extended info</h2>
						</div>
						<p class="mt-3 text-sm text-muted-foreground">Extended info could not be loaded.</p>
					</section>
				{/await}

				<section class="rounded-md border bg-card p-4">
					<div class="flex items-center justify-between gap-3">
						<div class="flex items-center gap-2">
							<UserRoundIcon aria-hidden="true" size={18} />
							<h2 class="font-semibold">Leader notes</h2>
						</div>
						<Button href={`${detailBasePath}/notes`} variant="outline" size="sm">Show all</Button>
					</div>
					<form class="mt-4 space-y-2" onsubmit={(event) => (event.preventDefault(), submitLeaderNote())}>
						<Textarea
							bind:value={leaderNoteText}
							placeholder="Add an observation or accomplishment"
							aria-label="New leader note"
							rows={3}
						/>
						<div class="flex items-center justify-between gap-3">
							{#if leaderNoteError}
								<p class="text-xs text-destructive">{leaderNoteError}</p>
							{:else}
								<p class="text-xs text-muted-foreground">Observation journal</p>
							{/if}
							<Button type="submit" size="sm" disabled={leaderNoteSaving}>
								{leaderNoteSaving ? 'Saving...' : 'Add note'}
							</Button>
						</div>
					</form>
					{#await detail.leaderNotes}
						<div class="mt-4 space-y-3">
							<Skeleton class="h-4 w-3/4" />
							<Skeleton class="h-3 w-full" />
							<Skeleton class="h-3 w-5/6" />
						</div>
					{:then leaderNotes}
						{@const notes = [...createdLeaderNotes, ...leaderNotes]}
						{#if notes.length === 0}
							<p class="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
								No leader notes have been added for this Soldier yet.
							</p>
						{:else}
							<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{notes[0].text}</p>
						{/if}
					{:catch}
						<p class="mt-3 text-sm text-muted-foreground">Leader notes could not be loaded.</p>
					{/await}
				</section>
			</aside>
		</div>
	</section>
</main>

{#snippet ToneBadge(tone: Tone, label: string)}
	<span
		class={cn(
			'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
			toneClass(tone)
		)}
	>
		{label}
	</span>
{/snippet}

{#snippet ReadinessLaneCard(lane: PersonnelReadinessLane)}
	<article class="rounded-md border bg-card p-4">
		<div class="flex items-start justify-between gap-3">
			<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{lane.label}</p>
			{@render ToneBadge(lane.tone, lane.value)}
		</div>
		<p class="mt-4 text-sm leading-relaxed text-muted-foreground">{lane.detail}</p>
	</article>
{/snippet}

{#snippet ReadinessLaneSkeleton(label: string)}
	<article class="rounded-md border bg-card p-4" aria-label={`${label} loading`}>
		<div class="flex items-start justify-between gap-3">
			<p class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</p>
			<Skeleton class="h-5 w-20" />
		</div>
		<div class="mt-4 space-y-2">
			<Skeleton class="h-3 w-full" />
			<Skeleton class="h-3 w-4/5" />
		</div>
	</article>
{/snippet}

{#snippet FactList(rows: string[][])}
	<div class="divide-y">
		{#each rows as row (row[0])}
			<div class="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[10rem_1fr]">
				<p class="text-muted-foreground">{row[0]}</p>
				<p class="font-medium break-words">{row[1]}</p>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet PanelSkeleton(label: string)}
	<section class="min-h-52 rounded-md border bg-card" aria-label={`${label} loading`}>
		<div class="border-b p-4">
			<Skeleton class="h-4 w-48" />
		</div>
		<div class="space-y-3 p-4">
			<Skeleton class="h-4 w-3/4" />
			<Skeleton class="h-3 w-full" />
			<Skeleton class="h-3 w-5/6" />
			<Skeleton class="h-9 w-24" />
		</div>
	</section>
{/snippet}
