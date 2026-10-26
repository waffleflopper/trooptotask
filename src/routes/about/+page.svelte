<script lang="ts">
	import { asset } from '$app/paths';
	import PublicHeading from '$lib/components/public/PublicHeading.svelte';
	import PublicSection from '$lib/components/public/PublicSection.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';
	import { monoLabel } from '$lib/components/public/layout';

	let { data } = $props();

	const history = [
		{
			where: 'First-line leader',
			job: 'Squad and section',
			stuck: 'The same update, sent to five different places',
			marker: null
		},
		{
			where: 'Orderly room',
			job: 'Unit administration',
			stuck: 'Scattered trackers, unclear ownership',
			marker: null
		},
		{
			where: 'TOC · Deployed',
			job: 'Battle NCO',
			stuck: 'The idea surfaced. Missions came first.',
			marker: 'idea'
		},
		{
			where: 'Troop clinic',
			job: 'NCOIC',
			stuck: 'Borrowed manpower, rotating every few months',
			marker: 'built'
		}
	] as const;

	const isNot = [
		'An official Army system',
		'A replacement for required systems of record',
		'A government-endorsed product'
	];

	const bodyClass = 'm-0 font-body text-lg leading-7';
</script>

<svelte:head>
	<title>About - TroopToTask</title>
	<meta
		name="description"
		content="TroopToTask is independently built by SSG Baddeley around firsthand Army unit admin experience and feedback from leaders using the platform."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="TroopToTask" />
	<meta property="og:title" content="About TroopToTask" />
	<meta property="og:description" content="Built by someone who has lived the unit admin problem firsthand." />
</svelte:head>

<PublicShell signedIn={data.signedIn} active="about">
	<PublicSection tone="dark" class="gap-12 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
		<div class="flex min-w-0 flex-col gap-12 lg:grow">
			<PublicHeading
				label="About · Built from the orderly room"
				lines={['Built by a leader', 'who lived the problem.']}
				tone="dark"
				accent
				level="h1"
			/>
			<p class="{bodyClass} max-w-[560px] font-light text-chrome-text-muted">
				I'm SSG Baddeley, an active duty Army NCO and the sole developer behind TroopToTask. I built it around the admin
				friction I've seen as a first-line leader, in the orderly room, deployed in the TOC, and as a Troop Clinic
				NCOIC.
			</p>
		</div>
		<figure class="m-0 flex w-full max-w-[360px] shrink-0 flex-col gap-4">
			<img
				src={asset('/me.jpeg')}
				alt="SSG Baddeley, founder and sole developer of TroopToTask"
				width="768"
				height="1024"
				class="aspect-[3/4] w-full rounded-lg object-cover object-[center_24%] contrast-105 grayscale"
			/>
			<figcaption class="flex items-baseline justify-between gap-4">
				<span class="font-heading text-lg leading-[22px] font-bold tracking-[0.02em] text-chrome-text uppercase"
					>SSG Baddeley</span
				>
				<span class="{monoLabel} text-chrome-text-muted">Sole developer</span>
			</figcaption>
		</figure>
	</PublicSection>

	<PublicSection>
		<PublicHeading label="Why I built it" lines={['The same friction,', 'every assignment.']}>
			The tools changed and the technology improved. Scattered trackers, duplicated updates and unclear ownership stayed
			exactly where they were.
		</PublicHeading>

		<div class="border-t-2 border-foreground">
			<div
				aria-hidden="true"
				class="{monoLabel} hidden h-12 items-center border-b border-border text-muted-foreground lg:grid lg:grid-cols-[19fr_15fr_20fr_10fr]"
			>
				<span>Where</span>
				<span>The job</span>
				<span>What stuck</span>
				<span class="pr-5 text-right">TroopToTask</span>
			</div>
			<ul class="m-0 list-none p-0">
				{#each history as row (row.where)}
					<li
						class="grid grid-cols-1 gap-1 border-b border-border py-4 lg:min-h-16 lg:grid-cols-[19fr_15fr_20fr_10fr] lg:items-center lg:gap-0 lg:py-3"
					>
						<span class="{monoLabel} text-foreground">{row.where}</span>
						<span class="{bodyClass} text-foreground">{row.job}</span>
						<span class="{bodyClass} font-light text-muted-foreground">{row.stuck}</span>
						<span class="{monoLabel} mt-2 flex items-center gap-3 lg:mt-0 lg:justify-end">
							{#if row.marker === 'idea'}
								<span class="text-muted-foreground">The idea</span>
								<span class="size-2 shrink-0 rounded-[1px] border border-muted-foreground" aria-hidden="true"></span>
							{:else if row.marker === 'built'}
								<span class="text-foreground">Built</span>
								<span class="size-2 shrink-0 rounded-[1px] bg-accent" aria-hidden="true"></span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="flex flex-col gap-4 lg:flex-row lg:gap-0">
			<div class="{monoLabel} text-muted-foreground lg:w-[380px] lg:shrink-0 lg:leading-7">The clinic</div>
			<div class="flex max-w-[680px] flex-col gap-5">
				<p class="{bodyClass} text-foreground">
					In-processing, out-processing, clinic schedules, training calendars, access requirements, training records and
					competency packets all had to stay coordinated at once, by a small continuity staff already carrying patient
					care.
				</p>
				<p class="{bodyClass} font-light text-muted-foreground">
					The clinic made the problem obvious, but it was not unique to the clinic. People move, requirements change,
					and leaders are left piecing the picture together from disconnected trackers. TroopToTask is the tool I kept
					wishing existed.
				</p>
			</div>
		</div>
	</PublicSection>

	<PublicSection tone="dark" loose class="gap-12 lg:gap-16">
		<div class="{monoLabel} tracking-[0.14em] text-chrome-accent">What stayed with me</div>
		<div class="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
			<figure class="m-0 flex max-w-[900px] flex-col gap-8 border-l-2 border-chrome-accent pl-6 sm:pl-10">
				<blockquote
					class="m-0 font-body text-[clamp(1.5rem,4vw,2.75rem)] leading-[1.27] font-light text-chrome-text italic"
				>
					“Never lose sight of the fact that every decision we make in these meetings is executed by a Soldier.”
				</blockquote>
				<figcaption class="{monoLabel} text-chrome-text-muted">CSM Moran · 1st Medical Brigade, retired</figcaption>
			</figure>
			<p class="{bodyClass} font-light text-chrome-text-muted lg:w-[300px] lg:shrink-0">
				TroopToTask is built for the leaders who have to make the plan work after the meeting ends.
			</p>
		</div>
	</PublicSection>

	<PublicSection class="lg:flex-row lg:justify-between lg:gap-16">
		<div class="flex flex-col gap-12 lg:w-[420px] lg:shrink-0">
			<PublicHeading label="Shaped by real feedback" lines={['One builder.', 'Real users.']} />
			<div class="flex flex-col gap-5">
				<p class="{bodyClass} text-foreground">
					Not a defense contractor or a corporate team. One NCO, building close to the problem.
				</p>
				<p class="{bodyClass} font-light text-muted-foreground">
					Leaders using TroopToTask across multiple Army locations decide what gets built next, what gets simplified,
					and what needs to work better.
				</p>
			</div>
		</div>
		<div class="min-w-0 self-start border-t-2 border-foreground lg:w-[764px] lg:shrink-0">
			<ul class="m-0 list-none p-0">
				{#each isNot as item (item)}
					<li
						class="flex min-h-16 flex-col justify-center gap-1 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-start sm:gap-0"
					>
						<span class="{monoLabel} w-40 shrink-0 text-muted-foreground">Is not</span>
						<span class="{bodyClass} text-foreground">{item}</span>
					</li>
				{/each}
				<li class="flex flex-col gap-1 border-b border-border py-6 sm:flex-row sm:gap-0">
					<span class="{monoLabel} w-40 shrink-0 text-accent-text sm:pt-1">Is</span>
					<div class="flex flex-col gap-2 sm:max-w-[560px]">
						<p class="{bodyClass} text-foreground">A practical coordination layer for the work around those systems.</p>
						<p class="{bodyClass} font-light text-muted-foreground">
							The handoffs, requirements, schedules, personnel changes and follow-through that leaders still have to
							manage.
						</p>
					</div>
				</li>
			</ul>
		</div>
	</PublicSection>
</PublicShell>
