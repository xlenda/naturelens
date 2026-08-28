const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

module.exports = function withNatureLensLeastPrivilege(config) {
  config = withInfoPlist(config, (mod) => {
    // Camera, microfone e localizacao aproximada sao descritos explicitamente
    // em app.json. Permissoes permanentes de localizacao continuam proibidas.
    mod.modResults.NSMicrophoneUsageDescription =
      'NatureLens uses the microphone only when you choose to record a nature sound for identification.';
    delete mod.modResults.NSLocationAlwaysUsageDescription;
    delete mod.modResults.NSLocationAlwaysAndWhenInUseUsageDescription;
    mod.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSExceptionDomains: {
        localhost: { NSExceptionAllowsInsecureHTTPLoads: true },
      },
    };
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const permissions = mod.modResults.manifest['uses-permission'] || [];
    mod.modResults.manifest['uses-permission'] = permissions
      .filter((entry) => entry.$?.['android:name'] !== 'android.permission.RECORD_AUDIO');
    mod.modResults.manifest['uses-permission'].push({
      $: { 'android:name': 'android.permission.RECORD_AUDIO' },
    });
    return mod;
  });
};
