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
		<div class="card-intro">
			<p class="eyebrow">Organization Setup</p>
			<h1>Create an Organization</h1>
			<p class="subtitle">Stand up a workspace for scheduling, readiness tracking, and day-to-day unit management.</p>
		</div>

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

			<div class="seed-info">
				<p class="seed-label">Included On Day One</p>
				<p>
					Your organization starts with default groups, status types, assignment types, and federal holidays so you are
					not staring at a blank page after setup.
				</p>
			</div>

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
		min-height: 100vh;
		background: var(--surface-page);
		padding: var(--sp-6);
	}

	.create-card {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--sp-6);
		width: 100%;
		max-width: 520px;
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}

	.card-intro {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.eyebrow,
	.seed-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.create-card h1 {
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 5vw, 3.4rem);
		line-height: 0.94;
		font-weight: 800;
		text-transform: uppercase;
		margin: 0;
		color: var(--text-strong);
	}

	.subtitle {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-base);
		line-height: 1.55;
	}

	.error-message {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		color: var(--danger);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		margin-bottom: var(--sp-4);
	}

	.seed-info {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		padding: var(--sp-4);
		border-radius: var(--radius-md);
		margin: var(--sp-4) 0 0;
		border: var(--border-thin);
	}

	.seed-info p {
		margin: 0;
		line-height: 1.55;
	}

	.actions {
		display: flex;
		gap: var(--sp-3);
		justify-content: flex-end;
		margin-top: var(--sp-5);
		padding-top: var(--sp-5);
		border-top: var(--border-thin);
	}

	@media (max-width: 640px) {
		.create-page {
			padding: var(--sp-4);
		}

		.create-card {
			padding: var(--sp-5);
		}

		.actions {
			flex-direction: column-reverse;
		}

		.actions :global(.btn) {
			width: 100%;
		}
	}
</style>
