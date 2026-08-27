const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

module.exports = function withNatureLensLeastPrivilege(config) {
  config = withInfoPlist(config, (mod) => {
    // O gravador PCM foi validado apenas no Android e a categoria fica oculta
    // no iOS. O plugin da biblioteca inclui microfone por padrao; removemos a
    // finalidade para o binario iOS nao declarar um acesso sem interface.
    delete mod.modResults.NSMicrophoneUsageDescription;
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
