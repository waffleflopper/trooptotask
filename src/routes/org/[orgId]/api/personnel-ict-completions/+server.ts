import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = entityHandlers(PersonnelIctCompletionEntity);
