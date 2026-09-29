<script lang="ts">
	import { resolve } from '$app/paths';

	interface Props {
		signedIn: boolean;
	}

	let { signedIn }: Props = $props();
</script>

<!-- The phase line again, crossed: the hero opened on Sunday night, this closes on it. -->
<section class="cta">
	<div class="l-wrap">
		<h2 class="l-display cta__title">Get your Sunday night back.</h2>
		<p class="l-body cta__body">
			Request reviewed access for your unit. We work with you to configure your structure, import your roster, and train
			your team leads.
		</p>
		<div class="cta__actions">
			{#if signedIn}
				<a class="l-button" href={resolve('/dashboard?show=all')}>Go to dashboard</a>
			{:else}
				<a class="l-button" href={resolve('/auth/request-access')}>Request access</a>
			{/if}
			<p class="l-eyebrow cta__meta">Reviewed access</p>
		</div>
	</div>
</section>

<style>
	.cta {
		padding-block: clamp(6rem, 16vh, 11rem);
		border-top: 2px solid var(--l-amber);
		background: var(--l-night);
		color: var(--l-night-text);
	}

	.cta__body {
		margin-top: clamp(1.5rem, 3vw, 2.25rem);
		color: var(--l-night-muted);
	}

	.cta__actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem 1.5rem;
		margin-top: 2.5rem;
	}

	.cta__meta {
		color: var(--l-night-muted);
	}
</style>
