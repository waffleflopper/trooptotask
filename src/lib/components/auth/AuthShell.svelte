<script lang="ts">
	import type { Snippet } from 'svelte';
	import { themeStore } from '$lib/stores/theme.svelte';

	interface Props {
		eyebrow?: string;
		title: string;
		description?: string;
		panelEyebrow?: string;
		panelTitle?: string;
		panelDescription?: string;
		supportLabel?: string;
		supportTitle?: string;
		supportDescription?: string;
		supportPoints?: string[];
		children: Snippet;
		aside?: Snippet;
	}

	const defaultSupportPoints: string[] = [];

	let {
		eyebrow = 'Account Access',
		title,
		description,
		panelEyebrow,
		panelTitle,
		panelDescription,
		supportLabel = 'Account Help',
		supportTitle = 'Use the path that fits your account.',
		supportDescription = 'Sign in, recover access, or complete an invite from the links on this page.',
		supportPoints = defaultSupportPoints,
		children,
		aside
	}: Props = $props();

	const resolvedPanelTitle = $derived(panelTitle ?? title);
</script>

<div class="auth-shell">
	<div class="auth-shell__backdrop" aria-hidden="true"></div>

	<div class="auth-shell__frame">
		<header class="auth-shell__topbar">
			<a href="/" class="auth-shell__brand">
				<span class="auth-shell__brand-mark">Troop<span>To</span>Task</span>
				<span class="auth-shell__brand-subtitle">Unit Readiness Platform</span>
			</a>

			<div class="auth-shell__topbar-actions">
				<a href="/" class="auth-shell__back-link">Back to site</a>
				<button
					class="auth-shell__theme-toggle"
					type="button"
					onclick={() => themeStore.toggle()}
					aria-label="Toggle theme"
				>
					{#if themeStore.isDark}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="5" />
							<path
								d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
							/>
						</svg>
					{:else}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
						</svg>
					{/if}
				</button>
			</div>
		</header>

		<main class="auth-shell__main">
			<section class="auth-shell__intro" aria-labelledby="auth-shell-title">
				<p class="auth-shell__eyebrow">{eyebrow}</p>
				<h1 id="auth-shell-title" class="auth-shell__title">{title}</h1>
				{#if description}
					<p class="auth-shell__description">{description}</p>
				{/if}

				<div class="auth-shell__signal">
					<p class="auth-shell__signal-label">{supportLabel}</p>
					<h2 class="auth-shell__signal-title">{supportTitle}</h2>
					<p class="auth-shell__signal-copy">{supportDescription}</p>

					{#if supportPoints.length > 0}
						<ul class="auth-shell__points">
							{#each supportPoints as point}
								<li>{point}</li>
							{/each}
						</ul>
					{/if}

					{#if aside}
						<div class="auth-shell__aside">
							{@render aside()}
						</div>
					{/if}
				</div>
			</section>

			<section class="auth-shell__panel" aria-labelledby="auth-panel-title">
				<header class="auth-shell__panel-header">
					{#if panelEyebrow}
						<p class="auth-shell__panel-eyebrow">{panelEyebrow}</p>
					{/if}
					<h2 id="auth-panel-title" class="auth-shell__panel-title">{resolvedPanelTitle}</h2>
					{#if panelDescription}
						<p class="auth-shell__panel-description">{panelDescription}</p>
					{/if}
				</header>

				<div class="auth-shell__panel-body">
					{@render children()}
				</div>
			</section>
		</main>

		<footer class="auth-shell__footer">Built for Army leaders, by Army leaders.</footer>
	</div>
</div>
