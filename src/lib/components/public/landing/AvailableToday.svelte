<script lang="ts">
	import { reveal } from './reveal';
	import SectionIntro from './SectionIntro.svelte';
	import { band, body, container, label, title } from './type';

	type Shot = {
		index: string;
		name: string;
		heading: string;
		text: string;
		image: { src: string; alt: string; width: number; height: number };
	};

	const calendar: Shot = {
		index: '01',
		name: 'CALENDAR',
		heading: 'WHO’S WHERE. EVERY DAY.',
		text: 'Leave, TDY, school, appointments and duty on one rolling calendar. Assign staff duty and CQ from the same screen, and see who is back before anyone asks.',
		image: {
			src: '/landing/calendar.webp',
			alt: 'October calendar for a 53-person medical clinic: leave, school, appointment and training bars per Soldier, with staff duty, section and clinic duty rows above.',
			width: 1280,
			height: 720
		}
	};

	const pair: Shot[] = [
		{
			index: '02',
			name: 'PERSONNEL',
			heading: 'EVERY SOLDIER. ONE PAGE.',
			text: 'What needs action comes first, most urgent at the top. The next 14 days, readiness, rating chain and notes sit beside it.',
			image: {
				src: '/landing/personnel-detail.webp',
				alt: 'Soldier record for SGT Isaac Morgan: expired and missing training listed first, the next 14 days, rating chain and latest counseling.',
				width: 620,
				height: 480
			}
		},
		{
			index: '03',
			name: 'TRAINING REPORTS',
			heading: 'SEE THE DROP BEFORE IT LANDS.',
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
			index: '04',
			name: 'TRAINING',
			heading: 'NOTHING EXPIRES QUIETLY.',
			text: 'Every requirement for every Soldier, colored by its own warning window.',
			image: {
				src: '/landing/training.webp',
				alt: 'Training matrix with a row per Soldier and a column per requirement, each cell colored current, expiring or expired.',
				width: 400,
				height: 300
			}
		},
		{
			index: '05',
			name: 'EVALS',
			heading: 'NO NCOER SLIPS.',
			text: 'Rating chains and thru dates, with overdue and due-soon surfaced first.',
			image: {
				src: '/landing/evals.webp',
				alt: 'Evaluations grouped by urgency, with overdue and due-soon NCOERs at the top of each rating chain.',
				width: 400,
				height: 300
			}
		},
		{
			index: '06',
			name: 'ONBOARDING',
			heading: 'ARRIVALS, TRACKED TO DONE.',
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

{#snippet caption(shot: Shot)}
	<p class={[label, 'text-accent-text']}>{shot.index} · {shot.name}</p>
	<h3 class={title}>{shot.heading}</h3>
{/snippet}

<section id="platform" class="scroll-mt-20 bg-background text-foreground">
	<div class={[container, band, 'flex flex-col gap-16 lg:gap-[72px]']}>
		<SectionIntro
			eyebrow="AVAILABLE TODAY"
			lines={['ONE FORMATION.', 'ONE SOURCE OF TRUTH.']}
			lead="Every tracker in the ledger above, replaced by one system that leaders already update as part of their day."
		/>
		<div class="flex flex-col gap-8">
			{@render screenshot(calendar.image)}
			<div class="flex flex-col gap-4 lg:flex-row lg:justify-between lg:gap-20">
				<div class="flex flex-col gap-2 lg:w-[420px]">{@render caption(calendar)}</div>
				<p class={[body, 'text-muted-foreground lg:w-[620px]']}>{calendar.text}</p>
			</div>
		</div>
		<div class="grid gap-16 md:grid-cols-2 md:gap-10">
			{#each pair as shot (shot.index)}
				<div class="flex flex-col gap-8">
					{@render screenshot(shot.image)}
					<div class="flex flex-col gap-2">
						{@render caption(shot)}
						<p class={[body, 'text-muted-foreground']}>{shot.text}</p>
					</div>
				</div>
			{/each}
		</div>
		<div class="grid gap-16 md:grid-cols-3 md:gap-10">
			{#each trio as shot (shot.index)}
				<div class="flex flex-col gap-6">
					{@render screenshot(shot.image)}
					<div class="flex flex-col gap-2">
						{@render caption(shot)}
						<p class={[body, 'text-muted-foreground']}>{shot.text}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
