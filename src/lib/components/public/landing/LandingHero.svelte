<script lang="ts">
	import PublicButton from '../PublicButton.svelte';
	import PublicHeading from '../PublicHeading.svelte';
	import { body, monoLabel, pageGutter } from '../layout';

	interface Props {
		action: { href: string; label: string };
	}

	let { action }: Props = $props();

	// @starting-style plays the wipe on first paint without hiding server HTML from visitors who have no motion.
	const wipe =
		'motion-safe:transition-[clip-path] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:[clip-path:inset(-20%_-5%_-20%_0)] motion-safe:starting:[clip-path:inset(-20%_100%_-20%_0)]';
</script>

<section class="bg-chrome text-chrome-text">
	<div class={pageGutter}>
		<div class="flex flex-col gap-12 pt-16 pb-12 lg:pt-32 lg:pb-16">
			<PublicHeading
				label="READINESS · BUILT FOR THE COMPANY"
				lines={['LESS TIME ON ADMIN.', 'MORE TIME WITH SOLDIERS.']}
				tone="dark"
				accent
				level="h1"
				lineClass={[wipe, `${wipe} motion-safe:delay-200`]}
			/>
			<div class="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
				<p class={[body, 'max-w-[520px] text-chrome-text-muted']}>
					Every tracker a leader reconciles by hand is time taken from the range, the motor pool and counseling.
					TroopToTask keeps the whole formation current in one place, so that time goes back to training Soldiers.
				</p>
				<div class="flex flex-wrap items-center gap-8">
					<a href="#platform" class={[monoLabel, 'text-chrome-text underline decoration-1 underline-offset-[6px]']}>
						SEE IT WORK
					</a>
					<PublicButton href={action.href}>{action.label}</PublicButton>
				</div>
			</div>
		</div>
		<div class="overflow-hidden rounded-t-lg bg-background">
			<img
				src="/landing/hero-dashboard.webp"
				alt="TroopToTask dashboard for C Co, 526th BSB: 19 of 22 Soldiers available today, who is out and when they return, and a 14-day availability chart."
				width="1280"
				height="520"
				fetchpriority="high"
				class="block h-72 w-full object-cover object-left-top sm:h-auto"
			/>
		</div>
	</div>
</section>
