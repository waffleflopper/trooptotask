import { eventDateRange, type EventActivityFact, type EventHost, type MemberLabels } from '../eventModel';

export const hostLabel = (host: EventHost, orgName: string) => (host.kind === 'organization' ? orgName : host.name);

export const memberLabel = (userId: string | null, members: MemberLabels) =>
	(userId && members[userId]) || 'Former member';

/** One Activity line, with the cancellation reason kept apart so it reads as the canceller's own words. */
export function describeActivity(
	fact: EventActivityFact,
	members: MemberLabels,
	orgName: string
): { summary: string; note: string | null } {
	switch (fact.kind) {
		case 'created':
			return { summary: 'Created the event', note: null };
		case 'dates_changed':
			return {
				summary: `Changed the dates from ${eventDateRange(fact.from)} to ${eventDateRange(fact.to)}`,
				note: null
			};
		case 'coordination_changed': {
			const changes: string[] = [];
			const [fromHost, toHost] = [hostLabel(fact.from.host, orgName), hostLabel(fact.to.host, orgName)];
			if (fromHost !== toHost) changes.push(`the host from ${fromHost} to ${toHost}`);
			if (fact.from.coordinatorUserId !== fact.to.coordinatorUserId)
				changes.push(
					`the coordinator from ${memberLabel(fact.from.coordinatorUserId, members)} to ${memberLabel(fact.to.coordinatorUserId, members)}`
				);
			return { summary: `Changed ${changes.join(' and ') || 'the coordination'}`, note: null };
		}
		case 'cancelled':
			return { summary: 'Cancelled the event', note: fact.reason };
	}
}
