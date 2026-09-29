<script lang="ts">
	import type { Snippet } from 'svelte';
	import { trackStage } from './stageProgress';

	interface Props {
		/** Scroll distance the scene stays pinned for, as a CSS length such as `500vh`. */
		length: string;
		/** Called with progress from 0 to 1 whenever it changes; CSS reads the same value as `--p`. */
		onprogress?: (progress: number) => void;
		/** Progress values (0 to 1) where the scene is at rest. Scrolling settles on them and cannot fly past one. */
		stops?: number[];
		class?: string;
		children: Snippet;
	}

	let { length, onprogress, stops = [], class: className = '', children }: Props = $props();
</script>

<section class={['stage', className]} style:--stage-length={length} {@attach trackStage(onprogress)}>
	{#each stops as stop (stop)}
		<span class="stage__stop" style:--stop={stop} aria-hidden="true"></span>
	{/each}
	<div class="stage__pin">
		{@render children()}
	</div>
</section>

<style>
	.stage {
		--p: 0;
		position: relative;
		height: var(--stage-length);
	}

	/* A snap point at one progress value. `scroll-snap-type` on the page decides whether snapping happens. */
	.stage__stop {
		position: absolute;
		left: 0;
		top: calc(var(--stop) * (100% - 100svh));
		width: 1px;
		height: 1px;
		scroll-snap-align: start;
		scroll-snap-stop: always;
		pointer-events: none;
	}

	/* Pinned viewport. `cqw`/`cqh` inside it measure the pinned frame, not the window. */
	.stage__pin {
		position: sticky;
		top: 0;
		height: 100vh;
		height: 100svh;
		overflow: clip;
		container-type: size;
	}
</style>
