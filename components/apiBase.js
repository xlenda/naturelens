import { Platform } from 'react-native';

// Single source of truth for where the backend lives.
//
// This exists because seven modules had each declared their own copy of this
// line, and they had DRIFTED: identify.js, restore.js and herbDetails.js still
// pointed at the original Vercel-assigned alias (dist-coral-seven-83) while
// subscription.js, pushNotifications.js and speciesDetails.js pointed at the
// real domain. Harmless today - the app only ships on web, where the value is
// '' and the browser uses the current origin either way - but the moment a
// native build exists (App Store / Play Store), half the app would talk to one
// host and half to another.
//
// On web the empty string is deliberate: a relative URL keeps requests on
// whatever origin is actually serving the app, which is what makes preview
// deployments and local `dist` servers work without any config.
export const API_BASE = Platform.OS === 'web' ? '' : 'https://naturelensapp.cloud';
