<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Create Organization - Troop to Task</title>
</svelte:head>

<div class="create-page">
	<div class="create-card">
		<h1>Create an Organization</h1>
		<p class="subtitle">Set up your organization to start scheduling</p>

		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			{#if form?.error}
				<div class="error-message">{form.error}</div>
			{/if}

			<div class="form-group">
				<label class="label" for="name">Organization Name</label>
				<input id="name" name="name" type="text" class="input" placeholder="e.g., Ft. Hood TMC" required />
			</div>

			<p class="seed-info">
				Your organization will be set up with default units, status types, assignment types, and federal holidays. You
				can customize these after creation.
			</p>

			<div class="actions">
				<a href="/" class="btn btn-secondary">Cancel</a>
				<button type="submit" class="btn btn-primary" disabled={loading}>
					{loading ? 'Creating...' : 'Create Organization'}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.create-page {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: var(--spacing-lg);
	}

	.create-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		width: 100%;
		max-width: 450px;
	}

	.create-card h1 {
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

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.seed-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		background: var(--color-bg);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin: var(--spacing-md) 0;
	}

	.actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
		margin-top: var(--spacing-md);
	}
</style>
