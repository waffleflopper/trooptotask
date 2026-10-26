<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { body, container, display, eyebrow, label } from './type';

	interface Props {
		action: { href: string; label: string };
	}

	let { action }: Props = $props();

	// @starting-style plays the wipe on first paint without hiding server HTML from visitors who have no motion.
	const wipe =
		'motion-safe:transition-[clip-path] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:[clip-path:inset(-20%_-5%_-20%_0)] motion-safe:starting:[clip-path:inset(-20%_100%_-20%_0)]';
</script>

<section class="bg-chrome text-chrome-text">
	<div class={container}>
		<div class="flex flex-col gap-12 pt-16 pb-12 lg:pt-32 lg:pb-16">
			<div class="flex flex-col gap-6">
				<p class={[eyebrow, 'text-chrome-accent']}>READINESS · BUILT FOR THE COMPANY</p>
				<h1 class={[display, 'tracking-[-0.005em]']}>
					<span class={['block text-chrome-text-muted', wipe]}>LESS TIME ON ADMIN.</span>
					<span class={['block text-chrome-accent motion-safe:delay-200', wipe]}>MORE TIME WITH SOLDIERS.</span>
				</h1>
			</div>
			<div class="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
				<p class={[body, 'max-w-[520px] text-chrome-text-muted']}>
					Every tracker a leader reconciles by hand is time taken from the range, the motor pool and counseling.
					TroopToTask keeps the whole formation current in one place, so that time goes back to training Soldiers.
				</p>
				<div class="flex flex-wrap items-center gap-8">
					<a href="#platform" class={[label, 'text-chrome-text underline decoration-1 underline-offset-[6px]']}>
						SEE IT WORK
					</a>
					<Button
						href={action.href}
						variant="accent"
						size="none"
						class="h-12 rounded-lg bg-chrome-accent px-6 font-mono text-[0.8125rem] leading-4 font-normal tracking-[0.12em] text-chrome uppercase hover:bg-chrome-accent/90"
					>
						{action.label}
					</Button>
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
