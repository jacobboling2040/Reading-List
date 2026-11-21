import type { Handle } from '@sveltejs/kit/hooks';
import { getDb } from './lib/server/db/client';
import { handleAuth } from './lib/server/auth/hook';

export const handle: Handle = ({ event, resolve }) => handleAuth(getDb(), event, resolve);
