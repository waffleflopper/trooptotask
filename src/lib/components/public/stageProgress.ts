/**
 * How far the viewport has travelled through a pinned runway: 0 while the
 * runway's top is at or below the viewport's top, 1 once its bottom reaches
 * the viewport's bottom.
 */
export function stageProgress(runwayTop: number, runwayHeight: number, viewportHeight: number): number {
	const travel = runwayHeight - viewportHeight;
	if (travel <= 0) return runwayTop <= 0 ? 1 : 0;
	return Math.min(1, Math.max(0, -runwayTop / travel));
}

/** The resting frame closest to `progress`, or `progress` itself when there are none. */
export function nearestRest(progress: number, rests: readonly number[]): number {
	return rests.reduce(
		(best, rest) => (Math.abs(rest - progress) < Math.abs(best - progress) ? rest : best),
		rests[0] ?? progress
	);
}

interface TrackedStage {
	node: HTMLElement;
	onprogress: ((progress: number) => void) | undefined;
	rests: readonly number[];
	progress: number;
}

const tracked = new Set<TrackedStage>();
let frame = 0;
let reducedMotion: MediaQueryList | undefined;

function render() {
	frame = 0;
	const viewportHeight = window.innerHeight;
	const reduceMotion = reducedMotion?.matches ?? false;
	// Read every position before writing any variable so the browser lays out once per frame.
	const readings = [...tracked].map((stage) => {
		const { top, height } = stage.node.getBoundingClientRect();
		const progress = stageProgress(top, height, viewportHeight);
		return { stage, progress: reduceMotion ? nearestRest(progress, stage.rests) : progress };
	});
	for (const { stage, progress } of readings) {
		if (progress === stage.progress) continue;
		stage.progress = progress;
		stage.node.style.setProperty('--p', progress.toFixed(4));
		stage.onprogress?.(progress);
	}
}

function schedule() {
	if (!frame) frame = requestAnimationFrame(render);
}

/**
 * Attachment that writes a stage's progress to its `--p` custom property (and
 * to `onprogress`) on scroll, resize and reduced-motion changes. Every tracked
 * stage shares one set of listeners and one animation frame. When the reader
 * prefers reduced motion, progress jumps between `rests` instead of sliding, so
 * the scene cuts from one still frame to the next.
 */
export function trackStage(onprogress?: (progress: number) => void, rests: readonly number[] = []) {
	return (node: HTMLElement) => {
		const stage: TrackedStage = { node, onprogress, rests, progress: -1 };
		if (tracked.size === 0) {
			reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
			reducedMotion.addEventListener('change', schedule);
			window.addEventListener('scroll', schedule, { passive: true });
			window.addEventListener('resize', schedule);
		}
		tracked.add(stage);
		schedule();

		return () => {
			tracked.delete(stage);
			if (tracked.size > 0) return;
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			reducedMotion?.removeEventListener('change', schedule);
			reducedMotion = undefined;
			cancelAnimationFrame(frame);
			frame = 0;
		};
	};
}
