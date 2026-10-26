<script lang="ts">
	import { resolve } from '$app/paths';
	import PublicBand from './PublicBand.svelte';
	import PublicButton from './PublicButton.svelte';

	interface Props {
		signedIn?: boolean;
	}

	let { signedIn = false }: Props = $props();

	const cta = $derived(
		signedIn
			? { href: resolve('/dashboard?show=all'), label: 'Go to Dashboard' }
			: { href: resolve('/auth/request-access'), label: 'Request Access' }
	);
</script>

<PublicBand
	label="The bottom line"
	lines={['Less admin. More training.', "That's readiness."]}
	copy="Request reviewed access for your unit. We set up your structure with you, import your roster and train your team leads."
>
	{#snippet action()}
		<PublicButton href={cta.href}>{cta.label}</PublicButton>
	{/snippet}
</PublicBand>
