<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Dashboard - Troop to Task</title>
</svelte:head>

<div class="selector-page">
	<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
		{#if themeStore.isDark}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="5"/>
				<line x1="12" y1="1" x2="12" y2="3"/>
				<line x1="12" y1="21" x2="12" y2="23"/>
				<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
				<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
				<line x1="1" y1="12" x2="3" y2="12"/>
				<line x1="21" y1="12" x2="23" y2="12"/>
				<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
				<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
			</svg>
		{/if}
	</button>
	<div class="selector-card">
		<h1>Troop to Task</h1>
		<p class="subtitle">Select a clinic to manage</p>

		<div class="clinic-list">
			{#each data.clinics as clinic}
				<a href="/clinic/{clinic.id}" class="clinic-item">
					<span class="clinic-name">{clinic.name}</span>
					<span class="clinic-role">{clinic.role}</span>
				</a>
			{/each}
		</div>

		<div class="actions">
			<a href="/clinic/new" class="btn btn-primary">Create New Clinic</a>
			<a href="/auth/logout" class="btn btn-secondary">Sign Out</a>
		</div>
	</div>
</div>

<style>
	.selector-page {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: var(--spacing-lg);
	}

	.selector-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		width: 100%;
		max-width: 500px;
	}

	.selector-card h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-primary);
		text-align: center;
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
	}

	.clinic-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
	}

	.clinic-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--color-text);
		transition: all 0.15s ease;
	}

	.clinic-item:hover {
		border-color: var(--color-primary);
		background: var(--color-bg);
	}

	.clinic-name {
		font-weight: 600;
	}

	.clinic-role {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-transform: capitalize;
	}

	.actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: center;
	}

	.theme-toggle {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: var(--shadow-md);
	}

	.theme-toggle:hover {
		background: var(--color-bg);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.theme-toggle svg {
		width: 20px;
		height: 20px;
	}
</style>
