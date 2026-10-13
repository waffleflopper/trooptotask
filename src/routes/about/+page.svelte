<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import PublicShell from '$lib/components/public/PublicShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const paragraph = 'm-0 max-w-[72ch] text-[length:clamp(1.02rem,1.1vw,1.16rem)] leading-[1.66] text-muted-foreground';
	const sectionLabel =
		'mb-[0.85rem] font-mono text-[0.72rem] leading-[1.2] font-semibold tracking-[0.14em] text-accent-text uppercase';
	const buttonClass =
		'min-h-10 px-4 py-[0.62rem] font-heading text-[0.95rem] leading-none font-bold tracking-[0.04em] uppercase hover:border-accent max-sm:w-full';

	const heroCopy =
		"I'm SSG Baddeley, an active duty Army NCO and the sole developer behind TroopToTask. I built it around the admin friction I've seen throughout a career working as a first-line leader, in the orderly room, deployed in the TOC, and as a Troop Clinic NCOIC.";

	const frictionCopy =
		'From role to role, the tools changed and technology improved, but the friction stayed familiar: scattered trackers, duplicated updates, unclear ownership, and too much time spent chasing information. Somewhere between the third broken spreadsheet and the fifth version of the same tracker, the idea stopped feeling optional.';

	const whyBuilt = [
		'The idea for TroopToTask first surfaced while I was deployed as Battle NCO, but high operational tempo and real-world missions took priority.',
		'Later, as NCOIC of a clinic running almost entirely on borrowed manpower, the same problem became impossible to ignore. Most personnel rotated through every few months, while the continuity staff was small and already carrying patient-care responsibilities. That meant constant in-processing and out-processing, clinic scheduling, training calendars, access requirements, training records, and competency packets all had to stay coordinated at the same time.',
		'The clinic made the problem obvious, but it was not unique to the clinic. I had seen the same pattern in line units and staff roles: people move, requirements change, and leaders are left piecing the picture together from disconnected trackers.',
		'TroopToTask came from that pattern. From doing the work, seeing the same friction repeat, and building the tool I kept wishing existed.'
	];

	const feedback = [
		'TroopToTask is independently built by me, not by a defense contractor or large corporate team. I think that matters because the product is shaped close to the problem. Feedback from leaders actively using TroopToTask across multiple Army locations directly influences what gets built, what gets simplified, and what needs to work better next.',
		'It is still evolving, but the direction is clear: reduce admin drag, keep important work visible, and help leaders spend less time chasing the same information through five different places.',
		'I will never forget walking into a brigade headquarters just in time to hear CSM Moran, then Command Sergeant Major of 1st Medical Brigade, tell his team, "Never lose sight of the fact that every decision we make in these meetings is executed by a Soldier."',
		'That idea has followed me from place to place and shaped the way I approach problems. TroopToTask is built for the leaders who have to make the plan work after the meeting ends.'
	];

	const notTroopToTask = [
		'TroopToTask is not an official Army system, a replacement for required systems of record, or a government-endorsed product.',
		'It is a practical coordination layer for the everyday work that happens around those systems: the handoffs, requirements, schedules, personnel changes, and follow-through that leaders still have to manage.'
	];
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

<PublicShell signedIn={data.signedIn} active="about" showClassificationBar={false} showCta={false}>
	<section class="px-6 pt-[clamp(2.5rem,5vw,4.5rem)] text-foreground max-sm:px-4">
		<div
			class="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_minmax(260px,360px)] items-center gap-[clamp(2rem,6vw,5rem)] max-[920px]:grid-cols-1"
		>
			<div class="grid gap-[1.35rem] [&_p+p]:mt-[1.1rem]">
				<p class={sectionLabel}>About TroopToTask</p>
				<h1
					class="m-0 max-w-[12ch] font-heading text-[length:clamp(3.35rem,7.1vw,6.35rem)] leading-[0.98] font-extrabold tracking-normal uppercase max-sm:text-[length:clamp(3.2rem,16vw,4.8rem)]"
				>
					Built by someone who has lived the problem firsthand.
				</h1>
				<p class="m-0 max-w-[66ch] text-[length:clamp(1.18rem,1.6vw,1.48rem)] leading-[1.5] text-foreground">
					{heroCopy}
				</p>
				<p class={cn(paragraph, 'max-w-[66ch]')}>{frictionCopy}</p>
				<div class="mt-8 flex flex-wrap gap-3 max-sm:grid">
					<Button href={resolve('/')} size="none" class={cn(buttonClass, 'border-primary')}
						>See how TroopToTask works</Button
					>
					{#if data.signedIn}
						<Button href={resolve('/dashboard?show=all')} variant="outline" size="none" class={buttonClass}
							>Go to Dashboard</Button
						>
					{:else}
						<Button href={resolve('/auth/request-access')} variant="outline" size="none" class={buttonClass}
							>Request access</Button
						>
					{/if}
				</div>
			</div>

			<figure class="m-0">
				<img
					src={asset('/me.jpeg')}
					alt="SSG Baddeley, founder and sole developer of TroopToTask"
					class="block aspect-[3/4] w-full rounded-lg border border-border object-cover object-[center_24%]"
				/>
				<figcaption
					class="mt-[0.85rem] grid gap-1 font-mono text-[0.74rem] leading-[1.35] tracking-[0.05em] text-muted-foreground uppercase"
				>
					<span class="font-heading text-[1.1rem] font-bold tracking-[0.04em] text-foreground">SSG Baddeley</span>
					Active duty Army NCO, sole developer
				</figcaption>
			</figure>
		</div>
	</section>

	<section class="text-foreground">
		<div
			class="mx-auto mt-[clamp(4rem,9vw,7rem)] grid max-w-[1040px] grid-cols-[minmax(0,0.9fr)_minmax(260px,0.55fr)] gap-[clamp(2rem,5vw,4rem)] px-6 pb-24 max-[920px]:grid-cols-1 max-sm:px-4"
		>
			<article class="border-t border-border pt-8 [&_p+p]:mt-[1.1rem]">
				<p class={sectionLabel}>Why I Built TroopToTask</p>
				{#each whyBuilt as text (text)}
					<p class={paragraph}>{text}</p>
				{/each}
			</article>

			<aside class="self-start rounded-lg border border-border bg-muted p-6 min-[921px]:row-span-2 dark:bg-card">
				<p class="m-0 max-w-[72ch] text-[length:clamp(1.2rem,2vw,1.55rem)] leading-[1.38] text-foreground">
					"Never lose sight of the fact that every decision we make in these meetings is executed by a Soldier."
				</p>
				<span
					class="mt-6 block font-mono text-[0.68rem] leading-[1.45] tracking-[0.12em] text-muted-foreground uppercase"
					>CSM Moran, Command Sergeant Major of 1st Medical Brigade, retired</span
				>
			</aside>

			<article class="border-t border-border pt-8 [&_p+p]:mt-[1.1rem]">
				<p class={sectionLabel}>Shaped By Real Feedback</p>
				{#each feedback as text (text)}
					<p class={paragraph}>{text}</p>
				{/each}
			</article>

			<section class="border-t border-border pt-8 [grid-column:1/-1] [&_p+p]:mt-[1.1rem]">
				<p class={sectionLabel}>What TroopToTask Is Not</p>
				{#each notTroopToTask as text (text)}
					<p class={paragraph}>{text}</p>
				{/each}
			</section>
		</div>
	</section>
</PublicShell>
