// Web build: locales are fetched on demand from the same origin and cached by
// the service worker - bundling English here would add the whole en.json to
// every visitor's first load for nothing. The .native.js sibling returns the
// real thing; Metro picks per platform, so this null never ships to Android.
export default null;
