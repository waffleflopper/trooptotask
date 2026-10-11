<script lang="ts">
	import { resolve } from '$app/paths';

	const linkClass =
		'font-heading text-[0.8125rem] font-medium tracking-[0.03em] text-muted-foreground no-underline transition-colors duration-[120ms] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
	const headingClass = 'mb-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase';
	const labelClass = 'font-mono text-[9px] font-medium tracking-[0.12em] text-muted-foreground uppercase';
</script>

<footer class="border-t border-border bg-background pt-12 pb-10">
	<div class="mx-auto max-w-[1200px] px-8 max-sm:px-4">
		<div class="grid grid-cols-[auto_1fr_auto] items-start gap-16 max-[900px]:grid-cols-1 max-[900px]:gap-10">
			<div>
				<div class="font-heading text-[20px] font-extrabold tracking-[0.02em] text-foreground">
					Troop<span class="text-accent">To</span>Task
				</div>
				<div class="mt-2 font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
					Unit Readiness Platform
				</div>
			</div>

			<div class="flex gap-12 max-sm:flex-col max-sm:gap-8">
				<div class="flex flex-col gap-3">
					<div class={headingClass}>Product</div>
					<a href={resolve('/about')} class={linkClass}>About</a>
					<a href={resolve('/security')} class={linkClass}>Security</a>
					<a href={resolve('/#faq')} class={linkClass}>FAQ</a>
				</div>
				<div class="flex flex-col gap-3">
					<div class={headingClass}>Access</div>
					<a href={resolve('/auth/request-access')} class={linkClass}>Request Access</a>
					<a href={resolve('/auth/login')} class={linkClass}>Sign In</a>
				</div>
				<div class="flex flex-col gap-3">
					<div class={headingClass}>Legal</div>
					<a href={resolve('/privacy')} class={linkClass}>Privacy Policy</a>
					<a href={resolve('/terms')} class={linkClass}>Terms of Use</a>
				</div>
			</div>

			<div
				class="max-w-[36ch] justify-self-end text-right font-mono text-[10px] leading-[1.7] text-muted-foreground max-[900px]:max-w-none max-[900px]:justify-self-start max-[900px]:text-left"
			>
				<div>© 2026 TroopToTask. All rights reserved.</div>
				<div class="mt-2">Not affiliated with the U.S. Department of Defense.</div>
				<div>Designed for DoD personnel use.</div>
				<div class="mt-2">
					Formal government adoption may involve additional review. Day-to-day use should follow local policy and
					data-handling guidance.
				</div>
			</div>
		</div>

		<div class="mt-8 flex flex-wrap items-center gap-6 border-t border-border pt-6">
			<div class={labelClass}>trooptotask.org</div>
			<div class="h-3 w-px bg-border"></div>
			<div class={labelClass}>Built for unit leaders</div>
		</div>
	</div>
</footer>
