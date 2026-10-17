import { randomUUID } from 'node:crypto';

export const AVAILABILITY_VOLUME_PEOPLE = 501;
export const AVAILABILITY_VOLUME_SEED = 1684;

const DAY = 86_400_000;

function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const dayNumber = (isoDate) => {
	const [year, month, day] = isoDate.split('-').map(Number);
	return Date.UTC(year, month - 1, day) / DAY;
};
const isoDate = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/**
 * A deterministic roster and availability history around the anchor month: the previous,
 * current and next month are populated, all inside the Calendar's initial buffered range.
 * Randomness is only the seed; entry and person ids come from `newId`.
 */
export function buildAvailabilityVolume({
	organizationId,
	groupIds,
	statusTypeIds,
	anchorDate,
	tag,
	size = AVAILABILITY_VOLUME_PEOPLE,
	seed = AVAILABILITY_VOLUME_SEED,
	newId = randomUUID
}) {
	if (statusTypeIds.length < 2) throw new Error('Availability volume needs at least two status types.');
	const random = mulberry32(seed);
	const between = (low, high) => low + Math.floor(random() * (high - low + 1));
	const [year, month] = anchorDate.split('-').map(Number);
	const windowStart = Date.UTC(year, month - 2, 1) / DAY;
	const windowEnd = Date.UTC(year, month + 1, 0) / DAY;
	const edges = [Date.UTC(year, month - 1, 1) / DAY, Date.UTC(year, month, 1) / DAY];

	const pad = (value) => String(value).padStart(3, '0');
	const personnel = Array.from({ length: size }, (_, index) => ({
		id: newId(),
		organization_id: organizationId,
		group_id: groupIds[index % 5 < 2 ? 0 : index % 5 < 4 ? 1 : 2] ?? null,
		first_name: 'Synthetic',
		last_name: `Volume${pad(index)}`,
		rank: 'SPC',
		clinic_role: '',
		slug: `map-volume-${tag}-${pad(index)}`
	}));

	const entries = [];
	const peopleWith = { overlap: new Set(), edge: new Set() };
	const status = () => statusTypeIds[random() < 0.6 ? 0 : between(1, statusTypeIds.length - 1)];
	const otherStatus = (than) => statusTypeIds.find((id) => id !== than);
	const span = () => {
		const roll = random();
		return roll < 0.25 ? 1 : roll < 0.65 ? between(2, 5) : between(7, 21);
	};
	const add = (person, start, end, statusTypeId) => {
		entries.push({
			id: newId(),
			organization_id: organizationId,
			personnel_id: person.id,
			status_type_id: statusTypeId,
			start_date: isoDate(start),
			end_date: isoDate(Math.min(end, windowEnd)),
			note: `Volume ${tag}`
		});
	};

	personnel.forEach((person, index) => {
		if (index % 50 === 11) {
			const edge = edges[Math.floor(index / 50) % 2];
			add(person, edge - between(2, 6), edge + between(1, 6), status());
			peopleWith.edge.add(index);
			return;
		}
		if (random() < 0.05) {
			const length = between(7, 21);
			const start = between(windowStart, windowEnd - length);
			const first = status();
			add(person, start, start + length - 1, first);
			const second = start + between(1, length - 1);
			add(person, second, second + between(2, 10), otherStatus(first));
			peopleWith.overlap.add(index);
			return;
		}
		const roll = random();
		const wanted = roll < 0.3 ? 0 : roll < 0.62 ? 1 : roll < 0.84 ? 2 : 3;
		const placed = [];
		for (let attempt = 0; placed.length < wanted && attempt < wanted * 6; attempt += 1) {
			const length = span();
			const start = between(windowStart, windowEnd - length + 1);
			const end = start + length - 1;
			if (placed.some((other) => start <= other.end + 1 && end >= other.start - 1)) continue;
			placed.push({ start, end });
			add(person, start, end, status());
		}
	});

	const perPerson = new Map();
	for (const entry of entries) perPerson.set(entry.personnel_id, (perPerson.get(entry.personnel_id) ?? 0) + 1);
	const histogram = {};
	for (const person of personnel) {
		const count = perPerson.get(person.id) ?? 0;
		histogram[count] = (histogram[count] ?? 0) + 1;
	}
	const lengths = entries.map((entry) => dayNumber(entry.end_date) - dayNumber(entry.start_date) + 1);
	return {
		personnel,
		entries,
		summary: {
			seed,
			people: size,
			entries: entries.length,
			window: { start: isoDate(windowStart), end: isoDate(windowEnd) },
			entriesPerPerson: histogram,
			oneDayEntries: lengths.filter((length) => length === 1).length,
			multiWeekEntries: lengths.filter((length) => length >= 7).length,
			overlappingPairPeople: peopleWith.overlap.size,
			monthEdgeSpanningPeople: peopleWith.edge.size,
			groups: personnel.reduce((counts, person) => {
				const key = person.group_id ?? 'unassigned';
				counts[key] = (counts[key] ?? 0) + 1;
				return counts;
			}, {})
		}
	};
}
