import { IctTaskEntity } from '$features/critical-tasks/index.server';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT } = entityHandlers(IctTaskEntity);
