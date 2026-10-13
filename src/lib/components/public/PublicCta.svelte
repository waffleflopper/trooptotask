<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		signedIn?: boolean;
	}

	let { signedIn = false }: Props = $props();

	const action = $derived(
		signedIn
			? { href: resolve('/dashboard?show=all'), label: 'Go to Dashboard' }
			: { href: resolve('/auth/request-access'), label: 'Request Access' }
	);
</script>

<section class="border-t border-chrome-border bg-chrome px-8 py-[clamp(4rem,8vw,6rem)] text-chrome-text max-sm:px-4">
	<div class="mx-auto max-w-[860px] text-center">
		<h2
			class="m-0 font-heading text-[length:clamp(2.8rem,7vw,5.2rem)] leading-[0.92] font-extrabold tracking-[0.04em] uppercase"
		>
			Ready to streamline<br />
			<em class="font-light text-accent italic">your unit?</em>
		</h2>
		<p class="mx-auto mt-6 max-w-[44rem] text-[1.1875rem] leading-[1.7] text-chrome-text-muted max-sm:text-base">
			Request reviewed access for your formation.
		</p>
		<Button
			href={action.href}
			variant="accent"
			size="none"
			class="mt-8 gap-3 rounded-md px-[1.35rem] py-[0.95rem] font-heading text-[1.1875rem] leading-none font-semibold tracking-[0.06em] uppercase hover:-translate-y-px"
		>
			{action.label}
			<ArrowRightIcon class="size-[18px]" aria-hidden="true" />
		</Button>
	</div>
</section>
