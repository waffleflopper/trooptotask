<script lang="ts">
	import ScrollStage from '../ScrollStage.svelte';
	import BoardChips from './crossing/BoardChips.svelte';
	import DayBoard from './crossing/DayBoard.svelte';
	import DayHeadline from './crossing/DayHeadline.svelte';
	import NightStory from './crossing/NightStory.svelte';
	import PhaseLine from './crossing/PhaseLine.svelte';
	import StageClock from './crossing/StageClock.svelte';
	import { clockReading, nightClockMinute } from './crossing/nightClock';
	import Pile from './Pile.svelte';

	interface Props {
		/** Scroll progress through the crossing, 0 to 1. The page flips its nav to day once it reaches 0.9. */
		onprogress?: (progress: number) => void;
	}

	let { onprogress }: Props = $props();

	/*
	 * Beat timeline, in scroll progress through the runway. Each layer owns its own windows in CSS;
	 * this is the one place to read them together.
	 *   0.00 to 0.05  hero at rest                                            (NightStory)
	 *   0.05 to 0.10  hero leaves
	 *   0.10 to 0.54  four question beats, 0.11 each; night clock 2214 to 0247 (NightStory, nightClock)
	 *   0.54 to 0.60  the pile recedes, the facts light up as chips            (.recede, BoardChips)
	 *   0.54 to 0.70  the thesis arrives, then fades out from 0.64             (NightStory)
	 *   0.62 to 0.92  the phase line rises; chips sort; paper covers the pile  (.frame --line, PhaseLine, BoardChips)
	 *   0.92 to 1.00  the board holds at Monday 0630; the page flips its nav to day at 0.9
	 */

	// Where the scene is at rest: the hero, the middle of each question beat, the thesis, the finished board.
	const rests = [0, 0.155, 0.265, 0.375, 0.485, 0.6, 0.96];

	// Svelte skips same-value writes, so these re-render at thresholds (a displayed minute, a phase), never per frame.
	let minute = $state(nightClockMinute(0));
	let phase = $state<'night' | 'crossing' | 'day'>('night');
	const night = $derived(clockReading(minute));

	function track(progress: number) {
		minute = nightClockMinute(progress);
		// Every element under the stage restyles whenever `--p` changes, so decorative layers
		// that cannot be seen sit out: the chips before they light up, the pile once paper covers it.
		phase = progress < 0.535 ? 'night' : progress < 0.925 ? 'crossing' : 'day';
		onprogress?.(progress);
	}
</script>

<div class="crossing">
	<ScrollStage length="var(--crossing-length)" onprogress={track} {rests}>
		<div class="frame">
			<div class="night">
				<div class="pile" hidden={phase === 'day'}>
					<Pile />
				</div>
				<div class="recede"></div>
				<NightStory />
				<StageClock day={night.day} time={night.time} tone="night" />
			</div>
			<div class="day">
				<div class="day-view">
					<DayHeadline />
					<DayBoard />
					<StageClock day="Mon" time="0630" tone="day" />
				</div>
			</div>
			<BoardChips hidden={phase === 'night'} />
			<PhaseLine />
		</div>
	</ScrollStage>
</div>

<style>
	.crossing {
		--crossing-length: 700vh;
	}

	.frame,
	.night,
	.pile,
	.recede,
	.day,
	.day-view {
		position: absolute;
		inset: 0;
	}

	/*
	 * Stage geometry, inherited by every layer. The text column sits on the page grid
	 * (the same content box as `.l-wrap`). The board is unitless fractions of the frame
	 * height plus column lengths, so the grid (day layer) and the chips (chip layer)
	 * read one source of truth and align by construction.
	 */
	.frame {
		--nav-h: 56px;
		/* PL AMBER: 1 sits on the bottom edge (p <= 0.62), 0 on the top edge (p >= 0.92). */
		--line: clamp(0, calc(1 - (var(--p) - 0.62) / 0.3), 1);

		--x0: calc((100cqw - min(100cqw, var(--l-wrap-max))) / 2 + var(--l-gutter));
		--cw: calc(min(100cqw, var(--l-wrap-max)) - 2 * var(--l-gutter));

		--cols: 14;
		--rows: 13;
		--groups: 2;
		--bx: calc(var(--x0) + var(--cw) * 0.37);
		--bw: calc(var(--cw) * 0.63);
		--namew: clamp(6.5rem, calc(var(--bw) * 0.17), 8.5rem);
		--colw: calc((var(--bw) - var(--namew)) / var(--cols));
		--by-f: 0.22;
		--bh-f: 0.68;
		--head-f: 0.064;
		--band-f: 0.027;
		--row-f: calc((var(--bh-f) - var(--head-f) - var(--groups) * var(--band-f)) / var(--rows));
	}

	.night {
		background-color: var(--l-night);
		background-image: radial-gradient(color-mix(in oklch, var(--l-night-text) 9%, transparent) 1px, transparent 1.5px);
		background-size: 24px 24px;
	}

	/* Keeps whatever stacking the pile uses beneath the night captions. */
	.pile {
		isolation: isolate;
	}

	/* Where it lived recedes as the facts light up (p 0.54 to 0.60), so the facts, not the containers, hold the eye. */
	.recede {
		background: var(--l-night);
		opacity: calc(0.6 * clamp(0, calc((var(--p) - 0.54) / 0.06), 1));
	}

	/*
	 * Day paper rises with the line: the outer box slides down by the line and the
	 * view slides back up by the same amount, so the paper's content stays put on
	 * screen while its window grows. Transforms only; nothing repaints to reveal it.
	 */
	.day {
		overflow: clip;
		background: var(--l-day);
		transform: translate3d(0, calc(var(--line) * 100cqh), 0);
		will-change: transform;
		/* Skips the paper's rendering work while it waits below the frame; its text stays in the accessibility tree. */
		content-visibility: auto;
	}

	.day-view {
		transform: translate3d(0, calc(var(--line) * -100cqh), 0);
		will-change: transform;
	}

	/* Short wide frames (laptops): a taller header row and a board nudged down, clear of the clock. */
	@media (min-width: 1100px) and (max-height: 760px) {
		.frame {
			--by-f: 0.25;
			--bh-f: 0.67;
			--head-f: 0.076;
		}
	}

	/* Stacked: headline above, the full board below. */
	@media (max-width: 1099px) {
		.frame {
			--bx: var(--x0);
			--bw: var(--cw);
			--by-f: 0.37;
			--bh-f: 0.595;
			--head-f: 0.065;
			--band-f: 0.024;
		}
	}

	/* Phone: one week of the first platoon. */
	@media (max-width: 640px) {
		.crossing {
			--crossing-length: 600vh;
		}

		.frame {
			--cols: 7;
			--rows: 8;
			--groups: 1;
			--namew: 6.25rem;
			--by-f: 0.45;
			--bh-f: 0.5;
			--head-f: 0.058;
			--band-f: 0.026;
		}
	}
</style>
