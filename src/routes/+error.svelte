<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Error {page.status} - Troop to Task</title>
</svelte:head>

<div class="error-page">
	<h1>{page.status}</h1>
	<p class="error-message">
		{#if page.status === 404}
			Page not found. The page you're looking for doesn't exist or has been moved.
		{:else if page.status === 403}
			You don't have permission to view this page.
		{:else}
			Something went wrong. Please try again later.
		{/if}
	</p>
	<a href="/" class="btn btn-primary">Go Home</a>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		text-align: center;
		padding: var(--spacing-xl);
	}

	h1 {
		font-size: 72px;
		font-weight: 700;
		color: var(--color-primary);
		margin: 0 0 var(--spacing-sm);
		line-height: 1;
	}

	.error-message {
		font-size: var(--font-size-lg);
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-lg);
		max-width: 400px;
	}
</style>
