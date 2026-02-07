<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Select Clinic - Troop to Task</title>
</svelte:head>

<div class="selector-page">
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
</style>
