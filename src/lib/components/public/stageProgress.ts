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

interface TrackedStage {
	node: HTMLElement;
	onprogress: ((progress: number) => void) | undefined;
	progress: number;
}

const tracked = new Set<TrackedStage>();
let frame = 0;

function render() {
	frame = 0;
	const viewportHeight = window.innerHeight;
	// Read every position before writing any variable so the browser lays out once per frame.
	const readings = [...tracked].map((stage) => {
		const { top, height } = stage.node.getBoundingClientRect();
		return { stage, progress: stageProgress(top, height, viewportHeight) };
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
 * to `onprogress`) on scroll and resize. Every tracked stage shares one scroll
 * listener and one animation frame.
 */
export function trackStage(onprogress?: (progress: number) => void) {
	return (node: HTMLElement) => {
		const stage: TrackedStage = { node, onprogress, progress: -1 };
		if (tracked.size === 0) {
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
			cancelAnimationFrame(frame);
			frame = 0;
		};
	};
}
