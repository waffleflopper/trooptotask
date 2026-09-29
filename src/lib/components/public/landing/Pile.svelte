<script lang="ts">
	import BriefSlide from './pile/BriefSlide.svelte';
	import Inbox from './pile/Inbox.svelte';
	import Spreadsheet from './pile/Spreadsheet.svelte';
	import StickyNote from './pile/StickyNote.svelte';
	import TextThread from './pile/TextThread.svelte';
	import Whiteboard from './pile/Whiteboard.svelte';

	// Three versions of the truth. They disagree with each other on purpose (look at Navarro).
	const ROSTER = {
		file: 'Roster_FINAL_v7 (2).xlsx',
		widths: [3.6, 7, 4, 3.4, 5, 5.6, 5, 8],
		rows: [
			['RANK', 'LAST NAME', 'MOS', 'PLT', 'STATUS', 'RETURNS', 'ACFT', 'NOTES'],
			['SGT', 'Griffin', '68W', '1', 'SCH', '8/14', '540', 'ALC? call'],
			['SPC', 'Navarro', '68W', '1', 'LV', '7/14', '488', 'per 1SG'],
			['SPC', 'Turner', '68K', '1', 'PDY', '', '512', ''],
			['PFC', 'Fletcher', '68W', '1', 'PDY', '', '#REF!', ''],
			['SGT', 'Hughes', '68P', '2', 'APPT', 'Thu?', '455', 'see note'],
			['SPC', 'Simmons', '68W', '2', 'PDY', '', '530', ''],
			['SPC', 'Watts', '68W', '2', 'TDY', '7/24', '', 'orders?'],
			['PV2', 'Coleman', '68W', '2', 'PDY', '', '410', 'new'],
			['SPC', 'Ellis', '68A', '2', 'LV', '???', '472', 'check'],
			['SGT', 'Ramsey', '68W', '1', 'PDY', '', '560', ''],
			['PFC', 'Stone', '68W', '2', '??', '', '', 'ask Vega']
		],
		selected: { col: 4, row: 2 },
		tabs: ['Roster', 'Sheet2', 'Roster (old)']
	};

	const TRACKER = {
		file: 'Training tracker - USE THIS ONE.xlsx',
		widths: [6.4, 4.6, 4.8, 4.6, 4.6, 4.8, 4.6, 5.2],
		rows: [
			['NAME', 'ACFT', 'M4 QUAL', 'CBRN', 'SHARP', 'BLS', 'DRIVER', 'UPDATED'],
			['Griffin', '03/2026', '11/2025', '01/2026', '10/2025', '06/2025', '', '6/2'],
			['Navarro', '02/2026', '04/2026', '??', '10/2025', '05/2026', '09/2025', '6/2'],
			['Turner', '11/2025', '', '01/2026', '10/2025', '02/2026', '', '5/28'],
			['Fletcher', '04/2026', '03/2026', '01/2026', '', '04/2025', '', '5/28'],
			['Hughes', '', '11/2025', '', '10/2025', '12/2025', '07/2025', '5/19'],
			['Simmons', '01/2026', '04/2026', '01/2026', '10/2025', '03/2026', '', '5/19'],
			['Watts', '03/2026', '', '01/2026', 'TBD', '11/2025', '', '4/30'],
			['Coleman', 'ask 1SG', '', '', '', '', '', ''],
			['Ellis', '12/2025', '10/2025', '01/2026', '10/2025', '01/2026', '', '4/30'],
			['Ramsey', '03/2026', '04/2026', '#N/A', '10/2025', '05/2026', '08/2025', '4/30']
		],
		selected: { col: 1, row: 8 },
		flagged: { col: 5, row: 4 },
		tabs: ['Tracker', 'OLD DO NOT USE', 'Sheet3'],
		banner: 'File in use. Locked for editing by SFC Powell.'
	};

	const LEAVE = {
		file: 'LEAVE_2026_master.xlsx',
		widths: [6.4, 4, 4.2, 4.2, 3.6, 4.4, 5, 9],
		rows: [
			['NAME', 'TYPE', 'START', 'END', 'DAYS', 'DA 31', 'APPROVED', 'NOTES'],
			['Navarro', 'ORD', '7/3', '7/18', '16', 'signed', 'Y', 'roster says 7/14'],
			['Ellis', 'EMER', '7/9', '???', '', 'no', '', 'called 1SG'],
			['Watts', 'PASS', '6/27', '6/30', '4', 'n/a', 'Y', ''],
			['Park', 'ORD', '7/20', '8/2', '14', 'signed', 'pending', 'PCS leave?'],
			['Murphy', 'ORD', '8/10', '8/21', '12', '', '', 'DRAFT'],
			['Bryant', 'CONV', '7/13', '7/15', '3', 'signed', 'Y', ''],
			['Holland', 'ORD', '7/27', '8/7', '12', 'signed', 'Y', ''],
			['Long', 'PASS', '7/3', '7/6', '4', '', 'Y', 'old'],
			['Fisher', 'ORD', '9/1', '9/12', '12', '', '', 'TBD'],
			['Navarro', 'ORD', '7/3', '7/14', '12', 'signed', 'Y', 'dup?'],
			['Vega', '?', '', '', '', '', '', 'ask']
		],
		selected: { col: 3, row: 1 },
		tabs: ['2026', '2025', 'Sheet1 (2)']
	};
</script>

<!--
	The pile: yesterday's tools, accumulating as the inherited `--p` advances.
	Fills its positioned parent (the pinned stage frame); decorative, so hidden from assistive tech.
	Each slot arrives over 0.05 of progress from its `--in`, then drifts with `--p`.
	Slots that rest at the edges while the hero holds (`--rest`) close in from `--ox`/`--oy`.
	DOM order is stacking order: later arrivals land on top.
-->
<div class="pile" aria-hidden="true">
	<div class="slot leave"><Spreadsheet {...LEAVE} /></div>
	<div class="slot whiteboard"><Whiteboard /></div>
	<div class="slot inbox"><Inbox /></div>
	<div class="slot roster"><Spreadsheet {...ROSTER} /></div>
	<div class="slot readiness"><BriefSlide kind="readiness" /></div>
	<div class="slot tracker"><Spreadsheet {...TRACKER} /></div>
	<div class="slot personnel"><BriefSlide kind="personnel" /></div>
	<div class="slot thread"><TextThread /></div>
	<div class="slot pt"><StickyNote text="PT test: who's missing?" /></div>
	<div class="slot hughes"><StickyNote text="Hughes appt Thurs?? ask" tone="orange" /></div>
	<div class="slot acft"><StickyNote text="ACFT roster... 1SG has it" /></div>
	<div class="slot griffin"><StickyNote text="call Griffin re: school dates" tone="orange" /></div>
	<div class="slot ncoer"><StickyNote text="NCOER due 30 JUN!!" urgent /></div>
	<div class="slot range"><StickyNote text="range roster to S3 by Fri" /></div>
</div>

<style>
	.pile {
		position: absolute;
		inset: 0;
		overflow: clip;
		container-type: size;
		pointer-events: none;
		user-select: none;
		/* One scale for every artifact: set by width on landscape frames, by height on phones. */
		font-size: max(0.9cqw, 1cqh);
		line-height: 1.2;
	}

	.slot {
		--t: clamp(0, calc((var(--p) - var(--in)) / 0.05), 1);
		--e: calc(var(--t) * var(--t) * (3 - 2 * var(--t)));
		/* Presence resolves in the first 0.02 so paper lands solid instead of passing through a muddy half-fade. */
		--o: clamp(0, calc((var(--p) - var(--in)) / 0.02), 1);
		position: absolute;
		left: var(--x);
		top: var(--y);
		font-size: calc(var(--depth, 1) * 1em);
		opacity: calc(var(--rest, 0) + (var(--peak) - var(--rest, 0)) * var(--o));
		transform: translate3d(
				calc((1 - var(--e)) * var(--ox, 0) * 1cqw),
				calc((1 - var(--e)) * var(--oy, 0) * 1cqh + var(--p) * var(--drift) * 1cqh),
				0
			)
			rotate(calc((var(--rot, 0) + (1 - var(--e)) * var(--spin, 0)) * 1deg))
			scale(calc(var(--s0, 1.1) + (1 - var(--s0, 1.1)) * var(--e)));
	}

	/*
		Placement is the top-left corner at p = 0; the drift then carries each slot
		up by `--drift` percent of the frame per unit of progress (about 0.58 of it by peak).
		Paper lands (scales down from 1.1 and settles its spin); windows open (scale up from 0.94).
		Resting slots brighten from `--rest` over the same 0.02 while they close in over 0.05.
	*/

	/* Resting at the edges while the hero holds. */
	.leave {
		--x: -5%;
		--y: -10%;
		--in: 0.06;
		--rest: 0.3;
		--peak: 0.55;
		--ox: -4;
		--oy: -9;
		--s0: 1;
		--depth: 0.92;
		--rot: -1;
		--drift: -4;
	}

	.whiteboard {
		--x: 68%;
		--y: 31%;
		--in: 0.07;
		--rest: 0.3;
		--peak: 0.7;
		--ox: 21;
		--s0: 1;
		--rot: 1;
		--drift: -6;
	}

	.inbox {
		--x: 2%;
		--y: 83%;
		--in: 0.08;
		--rest: 0.3;
		--peak: 0.75;
		--oy: 3;
		--s0: 1;
		--drift: -8;
	}

	.pt {
		--x: 90%;
		--y: 86%;
		--in: 0.09;
		--rest: 0.32;
		--peak: 0.85;
		--ox: 3;
		--oy: 2;
		--s0: 1;
		--rot: 5;
		--drift: -10;
	}

	/* Who's here? */
	.roster {
		--x: 29%;
		--y: 9.5%;
		--in: 0.11;
		--peak: 0.75;
		--s0: 0.94;
		--rot: 0.8;
		--drift: -4;
	}

	/* Top-edge slots stay below the 56px nav band even after their drift. */
	.hughes {
		--x: 55%;
		--y: 12.5%;
		--in: 0.15;
		--peak: 0.85;
		--rot: 6;
		--spin: 8;
		--drift: -8;
	}

	/* Who's trained? */
	.tracker {
		--x: 60%;
		--y: 67%;
		--in: 0.21;
		--peak: 0.8;
		--s0: 0.94;
		--rot: -1;
		--drift: -8;
	}

	.acft {
		--x: 84%;
		--y: 63%;
		--in: 0.25;
		--peak: 0.85;
		--rot: -5;
		--spin: -8;
		--drift: -12;
	}

	.griffin {
		--x: 16%;
		--y: 13%;
		--in: 0.28;
		--peak: 0.8;
		--rot: 4;
		--spin: 7;
		--drift: -8;
	}

	/* What does the commander need? */
	.personnel {
		--x: 33%;
		--y: 80%;
		--in: 0.32;
		--peak: 0.8;
		--rot: -3;
		--spin: -6;
		--drift: -10;
	}

	.readiness {
		--x: 44%;
		--y: 42%;
		--in: 0.37;
		--peak: 0.6;
		--depth: 0.9;
		--rot: 4;
		--spin: 6;
		--drift: -7;
	}

	/* What's due? */
	.ncoer {
		--x: 62%;
		--y: 56%;
		--in: 0.43;
		--peak: 0.85;
		--rot: -6;
		--spin: -9;
		--drift: -11;
	}

	.thread {
		--x: 64%;
		--y: 20%;
		--in: 0.46;
		--peak: 0.85;
		--s0: 1;
		--drift: -10;
	}

	.range {
		--x: 27%;
		--y: 93%;
		--in: 0.48;
		--peak: 0.85;
		--rot: -4;
		--spin: -7;
		--drift: -12;
	}

	/* Phones: a top pile and a bottom pile, with only dim paper behind the captions between them. */
	@container (orientation: portrait) {
		.pile {
			font-size: max(0.9cqw, 0.82cqh);
		}

		.leave {
			--x: -14%;
			--y: -2%;
		}

		/* Clear of the night clock at the top right. */
		.roster {
			--x: 2%;
			--y: 11%;
		}

		.griffin {
			--x: 2%;
			--y: 21%;
		}

		.thread {
			--x: 70%;
			--y: 23%;
		}

		.hughes {
			--x: 74%;
			--y: 31%;
		}

		.whiteboard {
			--x: 52%;
			--y: 40%;
			--ox: 36;
			--peak: 0.5;
		}

		.readiness {
			--x: -16%;
			--y: 56%;
			--peak: 0.5;
		}

		.inbox {
			--x: -4%;
			--y: 82.5%;
		}

		.tracker {
			--x: 40%;
			--y: 70.5%;
		}

		.personnel {
			--x: 8%;
			--y: 92%;
		}

		.ncoer {
			--x: 8%;
			--y: 70.5%;
		}

		.acft {
			--x: 80%;
			--y: 67%;
		}

		.pt {
			--x: 74%;
			--y: 90%;
		}

		.range {
			--x: 52%;
			--y: 97%;
		}
	}
</style>
