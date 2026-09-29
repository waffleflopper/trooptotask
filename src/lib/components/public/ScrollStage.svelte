<script lang="ts">
	import type { Snippet } from 'svelte';
	import { trackStage } from './stageProgress';

	interface Props {
		/** Scroll distance the scene stays pinned for, as a CSS length such as `500vh`. */
		length: string;
		/** Called with progress from 0 to 1 whenever it changes; CSS reads the same value as `--p`. */
		onprogress?: (progress: number) => void;
		/** Progress values (0 to 1) where the scene is at rest. With reduced motion, the scene shows only these frames. */
		rests?: number[];
		class?: string;
		children: Snippet;
	}

	let { length, onprogress, rests, class: className = '', children }: Props = $props();
</script>

<section class={['stage', className]} style:--stage-length={length} {@attach trackStage(onprogress, rests)}>
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
