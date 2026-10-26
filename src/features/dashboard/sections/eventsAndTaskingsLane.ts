import type { ProjectedEvent, ProjectedSuspense } from '$features/calendar/contracts';
import { formatDayMonth } from '$lib/utils/dates';
import type { DashboardInputs } from './dashboardInputs';
import type { ForecastLane } from './dashboardSections';
import type { ForecastLaneMark } from './forecastLanes';
import { orgPath } from './needsYouSources';

function eventMark(inputs: DashboardInputs, event: ProjectedEvent): ForecastLaneMark {
	const emphasis = event.cancelled ? 'cancelled' : event.hasWork ? 'strong' : 'quiet';
	const dates =
		event.startsOn === event.endsOn
			? `on ${formatDayMonth(event.startsOn)}`
			: `${formatDayMonth(event.startsOn)} to ${formatDayMonth(event.endsOn)}`;
	const standing = { strong: 'with Taskings for you', quiet: 'for awareness', cancelled: 'cancelled' }[emphasis];
	const detail = `${dates}, ${standing}`;
	return {
		kind: 'span',
		id: `event:${event.id}`,
		start: event.startsOn,
		end: event.endsOn,
		title: event.title,
		detail,
		label: `Event ${event.title}, ${detail}`,
		href: `${orgPath(inputs)}/calendar/events/${event.id}`,
		emphasis
	};
}

function suspenseMark(inputs: DashboardInputs, suspense: ProjectedSuspense): ForecastLaneMark {
	const detail = `due ${formatDayMonth(suspense.suspenseOn)}`;
	return {
		kind: 'point',
		id: `suspense:${suspense.taskingId}`,
		date: suspense.suspenseOn,
		title: suspense.title,
		detail,
		label: `Suspense ${suspense.title}, ${detail}`,
		href: `${orgPath(inputs)}/calendar/taskings/${suspense.taskingId}`
	};
}

/** Every Event the viewer can read over the forecast's days, and the suspenses of the Taskings in their scope. */
export const eventsAndTaskingsLane: ForecastLane = {
	id: 'events-and-taskings',
	label: 'Events and suspenses',
	empty: 'No Events or suspenses in the next 14 days.',
	legend: [
		{ kind: 'span', label: 'Event', plural: 'Events' },
		{ kind: 'point', label: 'Suspense', plural: 'Suspenses' }
	],
	read: (inputs) => {
		const { taskings } = inputs.page;
		switch (taskings.status) {
			case 'off':
				return null;
			case 'pending':
				return { state: 'pending' };
			case 'failed':
				return { state: 'failed', retry: (updates) => updates.retryTaskings() };
			case 'ready':
				return {
					state: 'ready',
					marks: [
						...taskings.forecast.events.map((event) => eventMark(inputs, event)),
						...taskings.forecast.suspenses.map((suspense) => suspenseMark(inputs, suspense))
					]
				};
		}
	}
};
