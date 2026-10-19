<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { Snippet } from 'svelte';
	import {
		buildCalendarAnchorCookie,
		PersonnelNextDays,
		PersonnelNextDaysSkeleton,
		type PersonnelCalendarWindow
	} from '$features/calendar';
	import type {
		Personnel,
		PersonnelAttention,
		PersonnelCounselingRecord,
		PersonnelLeaderNote
	} from '$features/personnel/contracts';
	import { alsoChecked, attentionRows, uncheckedSources } from '$features/personnel';
	import type { PersonnelActiveEvaluation } from '$features/rating-scheme/contracts';
	import { AttentionList, AttentionListSkeleton } from '$lib/components/patterns/readiness-items';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { formatDayMonth, formatDayOffset, formatDate } from '$lib/utils/dates';
	import { toDayNumber } from '$lib/utils/dayNumber';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';

	interface PersonnelReach {
		phone: string;
		email: string;
		emergency: { name: string; relationship: string; phone: string } | null;
	}

	let {
		orgUrlSegment,
		person,
		asOf,
		overview
	}: {
		orgUrlSegment: string;
		person: Pick<Personnel, 'slug'>;
		asOf: string;
		overview: {
			nextDays: Promise<PersonnelCalendarWindow | null>;
			attention: Promise<PersonnelAttention>;
			evaluation: Promise<PersonnelActiveEvaluation | null>;
			reach: Promise<PersonnelReach | null>;
			lastCounseling: Promise<PersonnelCounselingRecord | null>;
			latestNote: Promise<PersonnelLeaderNote | null>;
		};
	} = $props();

	const nextDays = new StreamedValue(() => overview.nextDays);
	const attention = new StreamedValue(() => overview.attention);
	const evaluation = new StreamedValue(() => overview.evaluation);
	const reach = new StreamedValue(() => overview.reach);
	const lastCounseling = new StreamedValue(() => overview.lastCounseling);
	const latestNote = new StreamedValue(() => overview.latestNote);

	const orgPath = $derived(`/org/${orgUrlSegment}`);
	const paths = $derived({ org: orgPath, person: `${orgPath}/personnel/${person.slug}` });

	function dayOffset(date: string): number {
		return toDayNumber(date.slice(0, 10)) - toDayNumber(asOf);
	}

	function ratingChain(entry: PersonnelActiveEvaluation) {
		return [
			{ role: 'Rater', name: entry.rater },
			...(entry.intermediateRater ? [{ role: 'Intermediate rater', name: entry.intermediateRater }] : []),
			{ role: 'Senior rater', name: entry.seniorRater },
			{ role: 'Reviewer', name: entry.reviewer }
		];
	}

	function localDay(timestamp: string): string {
		return formatDayMonth(formatDate(new Date(timestamp)));
	}

	function openCalendarToday() {
		document.cookie = buildCalendarAnchorCookie(new Date());
	}
</script>

{#snippet sectionHeader(title: string, meta: string | null, link: Snippet)}
	<header class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<div class="flex flex-wrap items-baseline gap-x-2.5">
			<h2 class="font-heading text-[22px] leading-[26px] font-bold">{title}</h2>
			{#if meta}<p class="font-mono text-xs text-muted-foreground">{meta}</p>{/if}
		</div>
		{@render link()}
	</header>
{/snippet}

{#snippet unavailable(what: string)}
	<p class="rounded-[4px] border border-dashed px-4 py-3 text-sm text-muted-foreground">
		Couldn't load {what}. Reload the page to try again.
	</p>
{/snippet}

{#snippet railLabel(text: string)}
	<h2 class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{text}</h2>
{/snippet}

{#snippet railSkeleton(label: string)}
	<div class="flex flex-col gap-2" aria-busy="true" aria-label={label}>
		<Skeleton class="h-3 w-24" />
		<Skeleton class="h-6 w-40" />
		<Skeleton class="h-4 w-52" />
	</div>
{/snippet}

<div class="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
	<div class="flex min-w-0 flex-col gap-9">
		{#if !(nextDays.current.state === 'ready' && nextDays.current.value === null)}
			<section class="flex flex-col gap-3" aria-label="Next 14 days">
				{#snippet calendarLink()}
					<a
						href="{orgPath}/calendar"
						data-sveltekit-preload-data="off"
						class="text-sm underline underline-offset-2"
						onclick={openCalendarToday}>Open in calendar</a
					>
				{/snippet}
				{@render sectionHeader('Next 14 days', null, calendarLink)}
				{#if nextDays.current.state === 'ready' && nextDays.current.value}
					<PersonnelNextDays calendar={nextDays.current.value} />
				{:else if nextDays.current.state === 'failed'}
					{@render unavailable('the Calendar')}
				{:else}
					<PersonnelNextDaysSkeleton />
				{/if}
			</section>
		{/if}

		<section class="flex flex-col gap-3" aria-label="Needs attention">
			{#snippet readinessLink()}
				<a href="{paths.person}/readiness" class="text-sm underline underline-offset-2">Full readiness</a>
			{/snippet}
			{#if attention.current.state === 'ready'}
				{@const rows = attentionRows(attention.current.value, paths)}
				{@const unchecked = uncheckedSources(attention.current.value)}
				{@const checked = alsoChecked(attention.current.value.checked)}
				{@render sectionHeader(
					'Needs attention',
					rows.length > 0 ? `${rows.length} ${rows.length === 1 ? 'item' : 'items'} · most urgent first` : null,
					readinessLink
				)}
				{#if rows.length > 0}
					<AttentionList {rows} label="Needs attention" />
				{:else if unchecked.length === 0}
					<p class="text-sm text-muted-foreground">Nothing needs attention.</p>
				{/if}
				{#each unchecked as source (source)}
					<p class="rounded-[4px] border border-dashed px-4 py-3 text-sm text-muted-foreground">
						Couldn't check {source}. Reload the page to try again.
					</p>
				{/each}
				{#if checked.length > 0}
					<p class="flex items-start gap-2 text-sm text-muted-foreground">
						<CheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						Also checked: {checked.join(' · ')}
					</p>
				{/if}
			{:else if attention.current.state === 'failed'}
				{@render sectionHeader('Needs attention', null, readinessLink)}
				{@render unavailable('readiness')}
			{:else}
				{@render sectionHeader('Needs attention', null, readinessLink)}
				<AttentionListSkeleton />
			{/if}
		</section>
	</div>

	<aside class="flex flex-col gap-7" aria-label="Contact and leadership">
		<section class="flex flex-col gap-3.5 rounded-[4px] border bg-muted p-5" aria-label="Reach">
			{@render railLabel('Reach')}
			{#if reach.current.state === 'ready'}
				{@const contact = reach.current.value}
				{#if contact && (contact.phone || contact.email)}
					<div class="flex flex-col gap-1">
						{#if contact.phone}<p class="font-mono text-lg">{contact.phone}</p>{/if}
						{#if contact.email}<p class="text-sm break-all">{contact.email}</p>{/if}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No personal phone or email on the Data sheet.</p>
				{/if}
				{#if contact?.emergency}
					<div class="flex flex-col gap-1 border-t pt-3.5">
						<p class="text-[13px] text-muted-foreground">
							Emergency{contact.emergency.relationship ? ` · ${contact.emergency.relationship}` : ''}
						</p>
						<p class="text-[15px]">{contact.emergency.name}</p>
						{#if contact.emergency.phone}<p class="font-mono text-sm">{contact.emergency.phone}</p>{/if}
					</div>
				{/if}
			{:else if reach.current.state === 'failed'}
				{@render unavailable('contact details')}
			{:else}
				<div class="flex flex-col gap-2" aria-busy="true" aria-label="Reach">
					<Skeleton class="h-6 w-36" />
					<Skeleton class="h-4 w-48" />
				</div>
			{/if}
		</section>

		{#if evaluation.current.state === 'ready' && evaluation.current.value}
			{@const evaluationValue = evaluation.current.value}
			<section class="flex flex-col gap-3 border-b pb-7" aria-label="Rating chain">
				{@render railLabel(`Rating chain · ${evaluationValue.evalType}`)}
				<dl class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
					{#each ratingChain(evaluationValue) as link (link.role)}
						<dt class="text-muted-foreground">{link.role}</dt>
						<dd class={link.name ? '' : 'text-muted-foreground'}>{link.name ?? 'Not set'}</dd>
					{/each}
				</dl>
			</section>
		{:else if evaluation.current.state === 'failed'}
			<section class="flex flex-col gap-3 border-b pb-7" aria-label="Rating chain">
				{@render railLabel('Rating chain')}
				{@render unavailable('the rating chain')}
			</section>
		{:else if evaluation.current.state === 'pending'}
			<div class="border-b pb-7">{@render railSkeleton('Rating chain')}</div>
		{/if}

		<section class="flex flex-col gap-2 border-b pb-7" aria-label="Last counseled">
			{@render railLabel('Last counseled')}
			{#if lastCounseling.current.state === 'ready'}
				{@const record = lastCounseling.current.value}
				{#if record}
					<p class="flex flex-wrap items-baseline gap-x-2">
						<span class="font-heading text-[26px] leading-8 font-bold first-letter:uppercase"
							>{formatDayOffset(dayOffset(record.dateConducted))}</span
						>
						<span class="text-sm text-muted-foreground">{formatDayMonth(record.dateConducted)}</span>
					</p>
					<p class="text-sm">{record.title} · {record.uploadedBy}</p>
				{:else}
					<p class="text-sm text-muted-foreground">No counseling on record.</p>
				{/if}
			{:else if lastCounseling.current.state === 'failed'}
				{@render unavailable('counselings')}
			{:else}
				<div class="flex flex-col gap-2" aria-busy="true" aria-label="Last counseled">
					<Skeleton class="h-7 w-32" />
					<Skeleton class="h-4 w-56" />
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-2" aria-label="Latest note">
			{@render railLabel('Latest note')}
			{#if latestNote.current.state === 'ready'}
				{@const note = latestNote.current.value}
				{#if note}
					<blockquote class="line-clamp-5 text-[15px] leading-6">“{note.text}”</blockquote>
					<p class="text-[13px] text-muted-foreground">{note.author} · {localDay(note.createdAt)}</p>
				{:else}
					<p class="text-sm text-muted-foreground">No notes yet.</p>
				{/if}
			{:else if latestNote.current.state === 'failed'}
				{@render unavailable('notes')}
			{:else}
				<div class="flex flex-col gap-2" aria-busy="true" aria-label="Latest note">
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-4/5" />
					<Skeleton class="h-3.5 w-32" />
				</div>
			{/if}
		</section>
	</aside>
</div>
