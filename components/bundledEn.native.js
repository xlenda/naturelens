// Native build: English ships inside the JS bundle. A store reviewer on an
// unstable network must never see raw i18n keys ('common.tabProfile') on a
// cold start - and unlike the web there is no service worker to cache the
// fetched locale. Bundled EN also exactly matches the code version, which the
// server copy can't guarantee.
export default require('../public/locales/en.json');
