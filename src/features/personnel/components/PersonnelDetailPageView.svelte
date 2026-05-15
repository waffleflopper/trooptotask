<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import SoldierDataSheetModal from './SoldierDataSheetModal.svelte';
	import type {
		PersonnelCounselingRecord,
		PersonnelDetailStreams,
		PersonnelExtendedInfo,
		PersonnelLeaderNote,
		PersonnelReadinessLane,
		PersonnelReadinessLaneKey,
		PersonnelReadinessLaneTone
	} from '$features/personnel/personnel-detail.types';
	import type { Personnel } from '$lib/types';
	import { cn } from '$lib/utils';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';

	interface Props {
		orgId: string;
		person: Personnel;
		roster: Personnel[];
		orgName: string;
		detail: PersonnelDetailStreams;
	}

	type Tone = PersonnelReadinessLaneTone;

	interface ReadinessLaneEntry {
		key: PersonnelReadinessLaneKey;
		label: string;
		promise: Promise<PersonnelReadinessLane>;
	}

	let { orgId, person, roster, orgName, detail }: Props = $props();
	let showDataSheet = $state(false);
	let leaderNoteText = $state('');
	let leaderNoteSaving = $state(false);
	let leaderNoteError = $state('');
	let createdLeaderNotes = $state<PersonnelLeaderNote[]>([]);

	const displayName = $derived(`${person.rank} ${person.lastName}, ${person.firstName}`);
	const peersInGroup = $derived(roster.filter((item) => item.groupName === person.groupName).length);
	const detailBasePath = $derived(`/org/${orgId}/personnel/${person.slug}`);
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

	const fallbackCounselingRecords: PersonnelCounselingRecord[] = [
		{
			dateConducted: '2026-04-08',
			title: 'Q2 performance counseling',
			summary: 'Board prep, clinic coverage, and tracker habits reviewed.',
			status: 'uploaded',
			uploadedBy: 'SFC N. Carter',
			filePath: 'org-1/counseling-records/cr-102/q2-performance-counseling.pdf'
		},
		{
			dateConducted: '2026-04-22',
			title: 'Supply turn-in follow-up',
			summary: 'Missed initial suspense, self-reported, corrected within 24 hours.',
			status: 'uploaded',
			uploadedBy: 'SFC N. Carter',
			filePath: 'org-1/counseling-records/cr-117/supply-turn-in-follow-up.pdf'
		},
		{
			dateConducted: '2026-01-15',
			title: 'Initial counseling',
			summary: 'Duty standards, communication expectations, and training priorities.',
			status: 'uploaded',
			uploadedBy: 'SSG L. Owens',
			filePath: 'org-1/counseling-records/cr-051/initial-counseling.pdf'
		}
	];

	const adminRows = $derived([
		['Rank', person.rank || 'Not set'],
		['Name', `${person.lastName}, ${person.firstName}`],
		['MOS', person.mos || 'Not set'],
		['Duty role', person.clinicRole || 'Not set'],
		['Group', person.groupName || orgName],
		['Group roster count', `${peersInGroup} assigned`],
		['ETS', person.ets ? formatDate(person.ets) : 'Not set'],
		['PCS / DEROS', person.deros ? formatDate(person.deros) : 'Not set']
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
			const response = await fetch(`/org/${orgId}/api/personnel/${person.id}/leader-notes`, {
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
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<ClipboardListIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Leader follow-ups</h2>
							</div>
							<div class="flex items-center gap-2">
								<Badge variant="warning">{openFollowUps.length} open</Badge>
								<Button href={`${detailBasePath}/follow-ups`} variant="outline" size="sm">Show all</Button>
							</div>
						</div>
						<div class="divide-y">
							{#each openFollowUps as item, index (item)}
								<div class="grid gap-3 p-4 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
									<div class="grid size-7 place-items-center rounded-full border bg-muted text-xs font-semibold">
										{index + 1}
									</div>
									<p class="text-sm">{item}</p>
									<Button variant="outline" size="sm">Track</Button>
								</div>
							{/each}
						</div>
					</section>
				{/await}

				{#await detail.counselingRecords}
					{@render PanelSkeleton('Recent counseling and uploads')}
				{:then counselingRecords}
					<section class="rounded-md border bg-card">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
							<div class="flex items-center gap-2">
								<FileTextIcon aria-hidden="true" size={18} />
								<h2 class="font-semibold">Recent counseling and uploads</h2>
							</div>
							<div class="flex items-center gap-2">
								<Button href={`${detailBasePath}/counselings`} variant="outline" size="sm">Show all</Button>
								<Button variant="outline" size="sm">New counseling</Button>
							</div>
						</div>
						<div class="divide-y">
							{#each counselingRecords.length ? counselingRecords : fallbackCounselingRecords as record (record.filePath)}
								<article class="grid gap-3 p-4 lg:grid-cols-[12rem_minmax(0,1fr)_auto]">
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
										<p class="mt-2 text-xs text-muted-foreground">{record.filePath}</p>
									</div>
									<Button variant="outline" size="sm">Open PDF</Button>
								</article>
							{/each}
						</div>
					</section>
				{/await}
			</section>

			<aside class="space-y-5">
				<section class="rounded-md border bg-card">
					<div class="flex items-center gap-2 border-b p-4">
						<UserRoundIcon aria-hidden="true" size={18} />
						<h2 class="font-semibold">Service details</h2>
					</div>
					{@render FactList(adminRows)}
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
