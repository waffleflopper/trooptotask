<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import SoldierDataSheetModal from './SoldierDataSheetModal.svelte';
	import type { PersonnelDetailStreams, PersonnelReadinessLane } from '$features/personnel/personnel-detail.types';
	import {
		createPersonnelDetailWorkspace,
		type PersonnelDetailTone
	} from '$features/personnel/workspace/personnelDetailWorkspace.svelte';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import { cn } from '$lib/utils';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';

	interface Props {
		orgId: string;
		orgUrlSegment?: string;
		person: Personnel;
		roster: Personnel[];
		groups?: Group[];
		orgName: string;
		detail: PersonnelDetailStreams;
		canArchivePersonnel?: boolean;
	}

	let {
		orgId,
		orgUrlSegment = orgId,
		person,
		groups = [],
		orgName,
		detail,
		canArchivePersonnel = false
	}: Props = $props();

	const workspace = createPersonnelDetailWorkspace(() => ({
		orgId,
		orgUrlSegment,
		person,
		groups,
		orgName,
		detail,
		canArchivePersonnel
	}));
</script>

<svelte:head>
	<title>{workspace.displayName} - Personnel</title>
</svelte:head>

<main class="min-h-full bg-background text-foreground">
	<section class="flex min-h-full flex-col">
		<div class="grid gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<section class="space-y-5">
				<section class="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4">
					<div>
						<h1 class="text-lg font-semibold">{workspace.displayName}</h1>
						<p class="text-sm text-muted-foreground">Personnel record</p>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={workspace.exportSubmitting}
						onclick={workspace.exportPersonnelRecords}
					>
						<DownloadIcon aria-hidden="true" size={16} />
						{workspace.exportSubmitting ? 'Exporting...' : 'Export records'}
					</Button>
				</section>
				{#if workspace.exportError}
					<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{workspace.exportError}
					</p>
				{/if}

				<section class="grid gap-3 lg:grid-cols-3" aria-label="Readiness summary">
					{#each workspace.readinessLaneEntries as lane (lane.key)}
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

				{#await workspace.detail.followUps}
					{@render PanelSkeleton('Leader follow-ups')}
				{:then openFollowUps}
					{@const followUps = workspace.mergeUpdatedFollowUps(openFollowUps)}
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
								<Button href={`${workspace.detailBasePath}/follow-ups`} variant="outline" size="sm">Show all</Button>
							</div>
						</div>
						{#if workspace.followUpError}
							<p class="border-b px-4 py-3 text-sm text-destructive">{workspace.followUpError}</p>
						{/if}
						<form
							class="grid gap-3 border-b p-4"
							onsubmit={(event) => (event.preventDefault(), workspace.submitFollowUp())}
						>
							<div class="grid gap-3 md:grid-cols-[1fr_10rem_auto]">
								<Input
									bind:value={workspace.followUpTitle}
									aria-label="Follow-up title"
									placeholder="Follow-up title"
								/>
								<DatePicker
									bind:value={workspace.followUpDueDate}
									aria-label="Follow-up due date"
									placeholder="Due date"
								/>
								<Button type="submit" size="sm" disabled={workspace.followUpSaving}>
									{workspace.followUpSaving ? 'Adding...' : 'Add'}
								</Button>
							</div>
							<Textarea
								bind:value={workspace.followUpNotes}
								rows={2}
								aria-label="Follow-up notes"
								placeholder="Optional notes"
							/>
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
												<p class="mt-1 text-xs text-muted-foreground">Due {workspace.formatDate(item.dueDate)}</p>
											{/if}
										</div>
										<Button
											variant="outline"
											size="sm"
											disabled={workspace.togglingFollowUpId === item.id}
											aria-label={`${item.status === 'completed' ? 'Reopen' : 'Complete'} ${item.title}`}
											onclick={() =>
												workspace.setFollowUpStatus(item, item.status === 'completed' ? 'open' : 'completed')}
										>
											{item.status === 'completed' ? 'Reopen' : 'Complete'}
										</Button>
									</div>
								{/each}
							{/if}
						</div>
					</section>
				{/await}

				{#await workspace.detail.counselingRecords}
					{@render PanelSkeleton('Recent counseling and uploads')}
				{:then counselingRecords}
					{@const records = [...workspace.createdCounselingRecords, ...counselingRecords]}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<FileTextIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Recent counseling and uploads</h2>
							</div>
							<div class="flex items-center gap-2">
								<Button href={`${workspace.detailBasePath}/counselings`} variant="outline" size="sm">Show all</Button>
							</div>
						</div>
						<form
							class="grid gap-3 border-b p-4"
							onsubmit={(event) => (event.preventDefault(), workspace.submitCounselingRecord())}
						>
							<div class="grid gap-3 md:grid-cols-[9rem_1fr]">
								<DatePicker
									bind:value={workspace.counselingDate}
									aria-label="Counseling date conducted"
									placeholder="Date conducted"
								/>
								<Input
									bind:value={workspace.counselingTitle}
									aria-label="Counseling title"
									placeholder="Counseling title"
								/>
							</div>
							<Textarea
								bind:value={workspace.counselingSummary}
								rows={2}
								aria-label="Counseling summary"
								placeholder="Optional summary"
							/>
							<div class="flex flex-wrap items-center justify-between gap-3">
								<Input
									type="file"
									accept="application/pdf,.pdf"
									aria-label="Counseling PDF"
									onchange={workspace.updateCounselingFile}
								/>
								<Button type="submit" size="sm" disabled={workspace.counselingSaving}>
									{workspace.counselingSaving ? 'Uploading...' : 'Upload PDF'}
								</Button>
							</div>
							{#if workspace.counselingError}
								<p class="text-sm text-destructive">{workspace.counselingError}</p>
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
										<p class="text-sm font-medium">{workspace.formatDate(record.dateConducted)}</p>
										<p class="text-xs text-muted-foreground">Uploaded by {record.uploadedBy}</p>
									</div>
									<div>
										<div class="flex flex-wrap items-center gap-2">
											<p class="font-medium">{record.title}</p>
											{@render ToneBadge(workspace.statusTone(record.status), record.status)}
										</div>
										{#if record.summary}
											<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{record.summary}</p>
										{/if}
										<p class="mt-2 text-xs text-muted-foreground">File: {record.fileName}</p>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/await}

				{#await workspace.detail.documents}
					{@render PanelSkeleton('Recent documents')}
				{:then loadedDocuments}
					{@const documents = [...workspace.createdDocuments, ...loadedDocuments]}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<FileTextIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Recent documents</h2>
							</div>
							<Button href={`${workspace.detailBasePath}/documents`} variant="outline" size="sm">Show all</Button>
						</div>
						<form
							class="grid gap-3 border-b p-4"
							onsubmit={(event) => (event.preventDefault(), workspace.submitDocument())}
						>
							<div class="grid gap-3 md:grid-cols-[1fr_auto]">
								<Input bind:value={workspace.documentTitle} aria-label="Document title" placeholder="Document title" />
								<Button type="submit" size="sm" disabled={workspace.documentSaving}>
									{workspace.documentSaving ? 'Uploading...' : 'Upload'}
								</Button>
							</div>
							<Input
								type="file"
								accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic"
								aria-label="Document file"
								onchange={workspace.updateDocumentFile}
							/>
							{#if workspace.documentError}
								<p class="text-sm text-destructive">{workspace.documentError}</p>
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
											<p>{workspace.formatBytes(document.fileSizeBytes)}</p>
											<p>{workspace.formatDate(document.createdAt.slice(0, 10))}</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={workspace.openingDocumentId === document.id}
											onclick={() => workspace.openDocument(document.id)}
										>
											{workspace.openingDocumentId === document.id ? 'Opening...' : 'Open'}
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
						{#if !workspace.editingBasicInfo}
							<div class="flex items-center gap-2">
								{#if workspace.canArchivePersonnel}
									<Button
										type="button"
										variant="destructive"
										size="icon-sm"
										title={workspace.archiveLabel}
										aria-label={workspace.archiveLabel}
										onclick={() => (workspace.showArchiveConfirm = true)}
									>
										<ArchiveIcon aria-hidden="true" />
									</Button>
								{/if}
								<Button type="button" variant="outline" size="sm" onclick={workspace.startBasicInfoEdit}
									>Edit basic info</Button
								>
							</div>
						{/if}
					</div>
					{#if workspace.editingBasicInfo}
						<form class="space-y-3 p-4" onsubmit={(event) => (event.preventDefault(), workspace.saveBasicInfo())}>
							<Input bind:value={workspace.basicInfoRank} aria-label="Rank" />
							<div class="grid gap-3 sm:grid-cols-2">
								<Input bind:value={workspace.basicInfoFirstName} aria-label="First name" />
								<Input bind:value={workspace.basicInfoLastName} aria-label="Last name" />
							</div>
							<div class="grid gap-3 sm:grid-cols-2">
								<Input bind:value={workspace.basicInfoMos} aria-label="MOS" />
								<Input bind:value={workspace.basicInfoClinicRole} aria-label="Duty role" />
							</div>
							<Combobox.Root
								items={workspace.groupOptions}
								bind:value={workspace.basicInfoGroupId}
								label="Group"
								autoHighlight
							>
								<Combobox.Trigger clearable placeholder="No Group Assigned" aria-label="Group" />
								<Combobox.Content>
									<Combobox.Search placeholder="Search groups..." />
									<Combobox.Empty>No groups found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
							<div class="grid gap-3 sm:grid-cols-2">
								<DatePicker bind:value={workspace.basicInfoEts} aria-label="ETS" placeholder="ETS" />
								<DatePicker bind:value={workspace.basicInfoDeros} aria-label="PCS / DEROS" placeholder="PCS / DEROS" />
							</div>
							{#if workspace.basicInfoError}
								<p class="text-sm text-destructive">{workspace.basicInfoError}</p>
							{/if}
							<div class="flex justify-end gap-2">
								<Button type="button" variant="outline" size="sm" onclick={() => (workspace.editingBasicInfo = false)}
									>Cancel</Button
								>
								<Button type="submit" size="sm" disabled={workspace.basicInfoSaving}>
									{workspace.basicInfoSaving ? 'Saving...' : 'Save basic info'}
								</Button>
							</div>
						</form>
					{:else}
						{@render FactList(workspace.adminRows)}
					{/if}
				</section>

				{#await workspace.detail.extendedInfo}
					{@render PanelSkeleton('Extended info')}
				{:then loadedExtendedInfo}
					{@const extendedInfo = loadedExtendedInfo ?? workspace.emptyExtendedInfo}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<PhoneIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Extended info</h2>
							</div>
							<Button variant="outline" size="sm" onclick={() => (workspace.showDataSheet = true)}>More info</Button>
						</div>
						{@render FactList(workspace.getContactRows(extendedInfo))}
					</section>
					{#if workspace.showDataSheet}
						<SoldierDataSheetModal
							{orgId}
							personnelId={workspace.currentPerson.id}
							initialInfo={extendedInfo}
							onClose={() => (workspace.showDataSheet = false)}
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
						<Button href={`${workspace.detailBasePath}/notes`} variant="outline" size="sm">Show all</Button>
					</div>
					<form class="mt-4 space-y-2" onsubmit={(event) => (event.preventDefault(), workspace.submitLeaderNote())}>
						<Textarea
							bind:value={workspace.leaderNoteText}
							placeholder="Add an observation or accomplishment"
							aria-label="New leader note"
							rows={3}
						/>
						<div class="flex items-center justify-between gap-3">
							{#if workspace.leaderNoteError}
								<p class="text-xs text-destructive">{workspace.leaderNoteError}</p>
							{:else}
								<p class="text-xs text-muted-foreground">Observation journal</p>
							{/if}
							<Button type="submit" size="sm" disabled={workspace.leaderNoteSaving}>
								{workspace.leaderNoteSaving ? 'Saving...' : 'Add note'}
							</Button>
						</div>
					</form>
					{#await workspace.detail.leaderNotes}
						<div class="mt-4 space-y-3">
							<Skeleton class="h-4 w-3/4" />
							<Skeleton class="h-3 w-full" />
							<Skeleton class="h-3 w-5/6" />
						</div>
					{:then leaderNotes}
						{@const notes = [...workspace.createdLeaderNotes, ...leaderNotes]}
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

{#if workspace.showArchiveConfirm}
	<ConfirmDialog
		title="Archive Personnel"
		message={workspace.archiveMessage}
		confirmLabel="Archive"
		variant="warning"
		loading={workspace.archiveSubmitting}
		onConfirm={workspace.confirmArchive}
		onCancel={() => (workspace.showArchiveConfirm = false)}
	/>
{/if}

{#snippet ToneBadge(tone: PersonnelDetailTone, label: string)}
	<span
		class={cn(
			'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
			workspace.toneClass(tone)
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
