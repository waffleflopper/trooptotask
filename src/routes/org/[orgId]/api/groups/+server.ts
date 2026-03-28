import { GroupEntity } from '$lib/server/entities/group';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = entityHandlers(GroupEntity);
