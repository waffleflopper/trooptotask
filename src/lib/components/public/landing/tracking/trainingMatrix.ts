/**
 * The illustrated training matrix for the "Who's trained?" scene: 8 Soldiers by
 * 6 training types. The readout under the grid is computed from these cells, so
 * the percentage and counts always agree with what the grid shows.
 *
 * Dates assume the page's Monday falls in late September 2026: an October
 * expiry is inside the warning window ("Expires in 21 days").
 */

export type Currency = 'current' | 'expiring' | 'expired' | 'none';

interface Cell {
	status: Currency;
	/** Expiry month as `MM/YYYY`, `Expired`, or empty when nothing is recorded. */
	label: string;
}

const current = (month: string): Cell => ({ status: 'current', label: month });
const expiring = (month: string): Cell => ({ status: 'expiring', label: month });
const expired: Cell = { status: 'expired', label: 'Expired' };
const blank: Cell = { status: 'none', label: '' };

export const trainingTypes = ['ACFT', 'M4 Qual', 'Cyber', 'SHARP', 'CBRN', "Driver's"];

// The last row is CPL Watts, who arrived from another unit: his annual Cyber, SHARP and CBRN
// all lapse together, which is what the callout under the grid brackets.
// prettier-ignore
export const roster = [
	{ rank: 'SFC', name: 'Powell', cells: [current('03/2027'), current('05/2027'), current('01/2027'), current('01/2027'), current('02/2027'), current('08/2027')] },
	{ rank: 'SSG', name: 'Griffin', cells: [current('12/2026'), current('04/2027'), current('01/2027'), current('01/2027'), current('02/2027'), blank] },
	{ rank: 'SSG', name: 'Navarro', cells: [current('02/2027'), expired, current('03/2027'), current('01/2027'), current('02/2027'), current('06/2027')] },
	{ rank: 'SSG', name: 'Turner', cells: [current('04/2027'), current('05/2027'), current('01/2027'), current('01/2027'), current('04/2027'), expired] },
	{ rank: 'SGT', name: 'Fletcher', cells: [current('03/2027'), current('04/2027'), current('01/2027'), current('03/2027'), current('02/2027'), current('11/2027')] },
	{ rank: 'SGT', name: 'Hughes', cells: [expired, current('04/2027'), current('01/2027'), current('01/2027'), current('02/2027'), current('07/2027')] },
	{ rank: 'SGT', name: 'Simmons', cells: [current('05/2027'), blank, blank, blank, current('04/2027'), current('09/2027')] },
	{ rank: 'CPL', name: 'Watts', cells: [current('12/2026'), current('05/2027'), expiring('10/2026'), expiring('10/2026'), expiring('10/2026'), current('01/2027')] }
];

const cells = roster.flatMap((soldier) => soldier.cells);
const count = (status: Currency) => cells.filter((cell) => cell.status === status).length;

export const counts: Record<Currency, number> = {
	current: count('current'),
	expiring: count('expiring'),
	expired: count('expired'),
	none: count('none')
};

/** Share of all requirements that are current, as the app's training report computes it. */
export const readyPercent = Math.round((counts.current / cells.length) * 100);

const lastRowExpiring = roster[roster.length - 1].cells.map((cell) => cell.status === 'expiring');

/** Columns of the last row's expiring cells, which the callout brackets. */
export const calloutColumns = {
	first: lastRowExpiring.indexOf(true),
	last: lastRowExpiring.lastIndexOf(true)
};
