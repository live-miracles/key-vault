// The one place the app's data and the changes to it are created, so every screen asks the
// same store and the same actions.

import { createActions } from './actions.ts';
import { app } from './store.ts';

export { app };
export const actions = createActions(app);
