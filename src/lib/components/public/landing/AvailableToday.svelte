<script lang="ts">
	import { fadeUp, reveal } from './reveal';
	import PublicHeading from '../PublicHeading.svelte';
	import PublicSection from '../PublicSection.svelte';
	import { body, monoLabel, subhead } from '../layout';

	type Shot = {
		name: string;
		heading: string;
		text: string;
		image: { src: string; alt: string; width: number; height: number };
	};

	const calendar: Shot = {
		name: 'Calendar',
		heading: 'Who’s where. Every day.',
		text: 'Leave, TDY, school, appointments and duty on one rolling calendar. Assign staff duty and CQ from the same screen, and see who is back before anyone asks.',
		image: {
			src: '/landing/calendar.webp',
			alt: 'October calendar for a 53-person medical clinic: leave, school, appointment and training bars per Soldier, with staff duty, section and clinic duty rows above.',
			width: 1280,
			height: 720
		}
	};

	const tasking = [
		{ name: 'STAFFED', value: '3 / 4 medics', short: false },
		{ name: 'EQUIPPED', value: '3 of 4 ready', short: true },
		{ name: 'ON TIME', value: 'Starts Mon 19 Oct', short: false }
	];

	const pair: Shot[] = [
		{
			name: 'Personnel',
			heading: 'Every Soldier. One page.',
			text: 'What needs action comes first, most urgent at the top. The next 14 days, readiness, rating chain and notes sit beside it.',
			image: {
				src: '/landing/personnel-detail.webp',
				alt: 'Soldier record for SGT Isaac Morgan: expired and missing training listed first, the next 14 days, rating chain and latest counseling.',
				width: 620,
				height: 480
			}
		},
		{
			name: 'Training reports',
			heading: 'See the drop before it lands.',
			text: 'A forecast of readiness if no one renews, with the weeks it falls and the Soldiers behind it. Print the brief for the training meeting.',
			image: {
				src: '/landing/training-reports.webp',
				alt: 'Training report forecasting clinic readiness falling from 56% to 34% over 90 days if no one renews, with the Soldiers behind the drop.',
				width: 620,
				height: 480
			}
		}
	];

	const trio: Shot[] = [
		{
			name: 'Training',
			heading: 'Nothing expires quietly.',
			text: 'Every requirement for every Soldier, colored by its own warning window.',
			image: {
				src: '/landing/training.webp',
				alt: 'Training matrix with a row per Soldier and a column per requirement, each cell colored current, expiring or expired.',
				width: 400,
				height: 300
			}
		},
		{
			name: 'Evals',
			heading: 'No NCOER slips.',
			text: 'Rating chains and thru dates, with overdue and due-soon surfaced first.',
			image: {
				src: '/landing/evals.webp',
				alt: 'Evaluations grouped by urgency, with overdue and due-soon NCOERs at the top of each rating chain.',
				width: 400,
				height: 300
			}
		},
		{
			name: 'Onboarding',
			heading: 'Arrivals, tracked to done.',
			text: 'Every new Soldier on one checklist, with the steps where people are waiting.',
			image: {
				src: '/landing/onboarding.webp',
				alt: 'Onboarding board showing how many new Soldiers wait at each step, then each Soldier in processing with their next step.',
				width: 400,
				height: 300
			}
		}
	];
</script>

{#snippet screenshot(image: Shot['image'])}
	<div class="overflow-hidden rounded-lg border border-border bg-muted" {@attach reveal}>
		<img
			src={image.src}
			alt={image.alt}
			width={image.width}
			height={image.height}
			loading="lazy"
			class="block h-auto w-full transition-transform duration-[8s] ease-out in-data-[reveal=shown]:scale-[1.03]"
		/>
	</div>
{/snippet}

{#snippet caption(name: string, heading: string)}
	<h3 class={subhead}><span class="block text-muted-foreground">{name}.</span> {heading}</h3>
{/snippet}

<PublicSection id="platform" class="gap-16 lg:gap-[72px]">
	<PublicHeading lines={['ONE FORMATION.', 'ONE SOURCE OF TRUTH.']}>
		All of it is in TroopToTask today. Every tracker in the ledger above becomes one system leaders already update as
		part of their day.
	</PublicHeading>
	<div class="flex flex-col gap-8">
		{@render screenshot(calendar.image)}
		<div class="flex flex-col gap-4 lg:flex-row lg:justify-between lg:gap-20">
			<div class="lg:w-[420px]">{@render caption(calendar.name, calendar.heading)}</div>
			<p class={[body, 'text-muted-foreground lg:w-[620px]']}>{calendar.text}</p>
		</div>
	</div>
	<div class="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-20" {@attach reveal}>
		<div class={[fadeUp, 'flex shrink-0 flex-col gap-5 lg:w-[420px]']}>
			{@render caption('Events & Taskings', 'Every tasking. Tracked to done.')}
			<p class={[body, 'text-muted-foreground']}>
				The tasking that arrived as a forwarded email becomes a tracked requirement, with an owner, the people it needs
				and the equipment it is waiting on. Leaders staff it from their own roster and see conflicts before they assign.
			</p>
			<dl class="border-t border-border">
				{#each tasking as row (row.name)}
					<div class="flex h-11 items-center justify-between border-b border-border">
						<dt class={[monoLabel, 'text-muted-foreground']}>{row.name}</dt>
						<dd
							class={[
								'font-mono text-[0.8125rem] leading-4 font-normal',
								row.short ? 'text-danger-foreground' : 'text-foreground'
							]}
						>
							{row.value}
						</dd>
					</div>
				{/each}
			</dl>
		</div>
		<div class={[fadeUp, 'grow overflow-hidden rounded-lg border border-border delay-150']}>
			<img
				src="/landing/events-taskings.webp"
				alt="Events and Taskings: a list of active taskings with status, responsible group, people staffed, equipment readiness and next date."
				width="840"
				height="525"
				loading="lazy"
				class="block h-auto w-full"
			/>
		</div>
	</div>
	<div class="grid gap-16 md:grid-cols-2 md:gap-10">
		{#each pair as shot (shot.name)}
			<div class="flex flex-col gap-8">
				{@render screenshot(shot.image)}
				<div class="flex flex-col gap-2">
					{@render caption(shot.name, shot.heading)}
					<p class={[body, 'text-muted-foreground']}>{shot.text}</p>
				</div>
			</div>
		{/each}
	</div>
	<div class="grid gap-16 md:grid-cols-3 md:gap-10">
		{#each trio as shot (shot.name)}
			<div class="flex flex-col gap-6">
				{@render screenshot(shot.image)}
				<div class="flex flex-col gap-2">
					{@render caption(shot.name, shot.heading)}
					<p class={[body, 'text-muted-foreground']}>{shot.text}</p>
				</div>
			</div>
		{/each}
	</div>
</PublicSection>
