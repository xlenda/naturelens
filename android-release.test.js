const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const root = __dirname;
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let introspectedConfig;

function pluginConfig(name) {
  const plugin = (app.plugins || []).find((entry) =>
    Array.isArray(entry) ? entry[0] === name : entry === name
  );
  return Array.isArray(plugin) ? plugin[1] || {} : null;
}

function expoIntrospect() {
  if (introspectedConfig) return introspectedConfig;
  const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
  const result = spawnSync(
    process.execPath,
    [expoCli, 'config', '--type', 'introspect', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }
  );
  assert.equal(
    result.status,
    0,
    `expo config --type introspect failed: ${result.stderr || result.error?.message || ''}`
  );
  introspectedConfig = JSON.parse(result.stdout);
  return introspectedConfig;
}

test('release Android mantem pacote, AAB e versionamento remoto', () => {
  assert.equal(app.android.package, 'app.naturelens');
  assert.match(app.version, /^\d+\.\d+\.\d+$/);
  assert.match(pkg.dependencies.expo, /54\./, 'Expo SDK 54 e o que entrega targetSdk 36');
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
});

test('release iOS mantem bundle, versao remota e permissoes minimas', () => {
  assert.equal(app.ios.bundleIdentifier, 'app.naturelens');
  assert.equal(
    app.ios.supportsTablet,
    false,
    'o lancamento inicial e somente iPhone ate existir prova real de layout e capturas para iPad'
  );
  assert.equal(app.ios.config.usesNonExemptEncryption, false);
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.match(pkg.dependencies['expo-dev-client'], /6\.0\./);
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.distribution, 'internal');
  assert.equal(eas.build['development-simulator'].extends, 'development');
  assert.equal(eas.build['development-simulator'].ios.simulator, true);
  assert.equal(pkg.dependencies['expo-build-properties'], '~1.0.10');
  assert.deepEqual(pluginConfig('expo-build-properties'), {
    ios: { deploymentTarget: '16.4' },
  });
  assert.match(app.ios.infoPlist.NSCameraUsageDescription, /NatureLens/);
  assert.match(app.ios.infoPlist.NSPhotoLibraryUsageDescription, /photos you choose/i);
  assert.match(app.ios.infoPlist.NSLocationWhenInUseUsageDescription, /approximate location/i);
  assert.match(app.ios.infoPlist.NSMicrophoneUsageDescription, /only when you choose to record/i);
  assert.equal(app.ios.infoPlist.CFBundleAllowMixedLocalizations, true);
  assert.equal(Object.keys(app.locales || {}).length, 17);
  const nativeIosPurposeKeys = [
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSMicrophoneUsageDescription',
  ];
  for (const [locale, localePath] of Object.entries(app.locales || {})) {
    const localized = JSON.parse(fs.readFileSync(path.join(root, localePath), 'utf8'));
    for (const key of nativeIosPurposeKeys) {
      assert.match(
        localized.ios?.[key] || '',
        /NatureLens/,
        `${locale} precisa localizar a finalidade nativa de ${key}`
      );
    }
  }
  assert.match(
    pluginConfig('expo-image-picker').microphonePermission,
    /only when you choose to record/i
  );
  assert.equal(
    app.plugins[0],
    './plugins/withNatureLensLeastPrivilege',
    'mods Expo executam em LIFO: o portao precisa ser declarado primeiro para executar por ultimo'
  );
  const leastPrivilege = fs.readFileSync(path.join(root, 'plugins', 'withNatureLensLeastPrivilege.js'), 'utf8');
  assert.doesNotMatch(leastPrivilege, /delete mod\.modResults\.NSMicrophoneUsageDescription/);
  assert.match(leastPrivilege, /mod\.modResults\.NSMicrophoneUsageDescription\s*=/);
  assert.match(leastPrivilege, /delete mod\.modResults\.NSLocationAlwaysUsageDescription/);
  assert.match(leastPrivilege, /NSAllowsArbitraryLoads: false/);
  assert.match(leastPrivilege, /android\.permission\.RECORD_AUDIO/);
  assert.match(pkg.dependencies['expo-video'], /3\.0\./);
  const audioPodspec = fs.readFileSync(
    path.join(root, 'node_modules', '@siteed', 'audio-studio', 'ios', 'AudioStudio.podspec'),
    'utf8'
  );
  assert.match(audioPodspec, /:ios\s*=>\s*'16\.4'/);
});

test('arquivo enviado ao EAS exclui segredos, dossies e auditorias locais', () => {
  const easIgnore = fs.readFileSync(path.join(root, '.easignore'), 'utf8');
  for (const pattern of [
    '.env',
    '.env.*',
    'node_modules/',
    '.vercel',
    '/android/',
    '/ios/',
    'CONTEXTO/',
    'audits/',
  ]) {
    assert.ok(easIgnore.split(/\r?\n/).includes(pattern), `${pattern} precisa ficar fora do upload EAS`);
  }
  assert.match(easIgnore, /!\.env\.example/);
});

test('release Android limita cada permissao nativa ao recurso declarado', () => {
  const imagePicker = pluginConfig('expo-image-picker');
  const camera = pluginConfig('expo-camera');
  const location = pluginConfig('expo-location');
  const notifications = pluginConfig('expo-notifications');
  const audioStudio = pluginConfig('@siteed/audio-studio');
  assert.ok(imagePicker, 'expo-image-picker precisa de configuracao explicita');
  assert.match(imagePicker.microphonePermission, /only when you choose to record/i);
  assert.match(imagePicker.cameraPermission, /NatureLens/);
  assert.match(imagePicker.photosPermission, /NatureLens/);
  assert.ok(camera, 'o visor nativo precisa do plugin de camera');
  assert.match(camera.cameraPermission, /NatureLens/);
  assert.match(camera.microphonePermission, /only when you choose to record/i);
  assert.equal(camera.recordAudioAndroid, false);
  assert.ok(location, 'clima e identificacao aproximada precisam do plugin de localizacao');
  assert.match(location.locationWhenInUsePermission, /approximate location/);
  assert.ok(app.android.blockedPermissions.includes('android.permission.ACCESS_FINE_LOCATION'));
  assert.ok(notifications, 'lembretes locais precisam do plugin nativo');
  assert.equal(notifications.defaultChannel, 'naturelens-reminders-v1');
  assert.match(notifications.color, /^#[0-9A-F]{6}$/i);
  assert.match(pkg.dependencies['expo-notifications'], /0\.32\./);
  assert.equal(pkg.dependencies['@siteed/audio-studio'], '3.2.1');
  assert.deepEqual(audioStudio, {
    enablePhoneStateHandling: false,
    enableNotifications: false,
    enableBackgroundAudio: false,
    enableDeviceDetection: false,
    iosConfig: {
      microphoneUsageDescription: 'NatureLens uses the microphone only when you choose to record a nature sound for identification.',
    },
  });
  const notificationsManifest = fs.readFileSync(
    path.join(root, 'node_modules', 'expo-notifications', 'android', 'src', 'main', 'AndroidManifest.xml'),
    'utf8'
  );
  assert.match(notificationsManifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(notificationsManifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/);

  assert.equal(app.android.allowBackup, false);
  assert.ok(
    app.android.blockedPermissions.includes('android.permission.SYSTEM_ALERT_WINDOW'),
    'o app nao usa sobreposicao sobre outros apps'
  );
  for (const permission of [
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.USE_EXACT_ALARM',
  ]) {
    assert.ok(
      app.android.blockedPermissions.includes(permission),
      `${permission} nao e necessario para lembretes tolerantes ao sistema`
    );
  }

  const explicitPermissions = app.android.permissions || [];
  for (const permission of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ]) {
    assert.ok(!explicitPermissions.includes(permission), `${permission} nao deve ser solicitado`);
  }
});

test('Expo introspect resolve o microfone minimo sem declarar audio em background', () => {
  const resolved = expoIntrospect();
  const modResults = resolved._internal?.modResults;
  assert.ok(modResults?.ios && modResults?.android, 'Expo introspect nao resolveu os mods nativos');

  assert.match(
    modResults.ios.infoPlist.NSMicrophoneUsageDescription || '',
    /only when you choose to record/i
  );
  assert.equal(modResults.ios.podfileProperties['ios.deploymentTarget'], '16.4');
  assert.ok(
    !(modResults.ios.infoPlist.UIBackgroundModes || []).includes('audio'),
    'o binario iOS nao grava audio em background'
  );

  const expectedLocales = [
    'ar', 'cs', 'da', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pl',
    'pt', 'sv', 'tr', 'zh', 'zh-Hant',
  ];
  assert.deepEqual(Object.keys(resolved.locales || {}).sort(), expectedLocales.sort());
  for (const localePath of Object.values(resolved.locales || {})) {
    assert.ok(fs.existsSync(path.join(root, localePath)), `${localePath} nao foi resolvido`);
  }

  const manifest = modResults.android.manifest.manifest;
  const permissions = manifest['uses-permission'] || [];
  const recordAudio = permissions.filter(
    (entry) => entry.$?.['android:name'] === 'android.permission.RECORD_AUDIO'
  );
  assert.equal(recordAudio.length, 1, 'o manifest resolvido precisa de exatamente um RECORD_AUDIO');
  assert.equal(
    (resolved.android.permissions || []).filter(
      (permission) => permission === 'android.permission.RECORD_AUDIO'
    ).length,
    1
  );

  const application = manifest.application?.[0] || {};
  const backgroundComponents = [
    ...(application.service || []),
    ...(application.receiver || []),
  ].filter((entry) => /audiostudio/i.test(entry.$?.['android:name'] || ''));
  assert.ok(backgroundComponents.length >= 2, 'os componentes nativos de background nao foram inspecionados');
  assert.ok(
    backgroundComponents.every((entry) => entry.$?.['tools:node'] === 'remove'),
    'servico e receiver de gravacao precisam ser removidos do manifest final'
  );
});

test('patch-package preserva o caminho absoluto do cache no Android e iOS', () => {
  assert.equal(pkg.scripts.postinstall, 'patch-package');
  assert.match(pkg.devDependencies['patch-package'], /^\^8\.0\.1$/);
  assert.equal(pkg.dependencies['@siteed/audio-studio'], '3.2.1');

  const patchPath = path.join(root, 'patches', '@siteed+audio-studio+3.2.1.patch');
  assert.ok(fs.existsSync(patchPath), 'o patch precisa acompanhar a versao fixada da dependencia');
  const patch = fs.readFileSync(patchPath, 'utf8');
  assert.match(patch, /android\/src\/main\/java\/net\/siteed\/audiostudio\/RecordingConfig\.kt/);
  assert.match(patch, /ios\/RecordingSettings\.swift/);
  assert.match(patch, /^-\s*\.trim\('\/'\)/m);
  assert.match(patch, /^-\s*\.trimmingCharacters\(/m);
  const additions = patch.split(/\r?\n/).filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  assert.ok(additions.every((line) => !/trim\('\/'\)|trimmingCharacters/.test(line)));

  const androidSource = fs.readFileSync(
    path.join(
      root,
      'node_modules',
      '@siteed',
      'audio-studio',
      'android',
      'src',
      'main',
      'java',
      'net',
      'siteed',
      'audiostudio',
      'RecordingConfig.kt'
    ),
    'utf8'
  );
  const iosSource = fs.readFileSync(
    path.join(root, 'node_modules', '@siteed', 'audio-studio', 'ios', 'RecordingSettings.swift'),
    'utf8'
  );
  assert.doesNotMatch(androidSource, /\.trim\('\/'\)/);
  assert.doesNotMatch(iosSource, /trimmingCharacters\(in: CharacterSet\(charactersIn: "\/"\)\)/);
});

test('foto salva usa armazenamento persistente no Android e iOS', () => {
  const nativePhoto = fs.readFileSync(
    path.join(root, 'components', 'persistentCollectionPhoto.native.js'),
    'utf8'
  );
  const identify = fs.readFileSync(path.join(root, 'screens', 'IdentifyScreen.js'), 'utf8');
  assert.match(nativePhoto, /FileSystem\.documentDirectory/);
  assert.match(nativePhoto, /FileSystem\.copyAsync/);
  assert.match(nativePhoto, /Crypto\.randomUUID/);
  assert.match(identify, /await persistCollectionPhoto\(primaryPhoto\.uri\)/);
  assert.match(identify, /if \(!savedEntry\)/, 'falha de auto-save precisa ser visivel');
  assert.doesNotMatch(identify, /plant:\s*savedEntry\s*\|\|/, 'resultado nao pode fingir auto-save');
});

test('visor cinematografico fica no binario nativo sem entrar no bundle web', () => {
  const webCamera = fs.readFileSync(path.join(root, 'components', 'NativeLensCamera.js'), 'utf8');
  const nativeCamera = fs.readFileSync(path.join(root, 'components', 'NativeLensCamera.native.js'), 'utf8');
  assert.doesNotMatch(webCamera, /from ['"]expo-camera['"]/);
  assert.match(nativeCamera, /from ['"]expo-camera['"]/);
  assert.match(nativeCamera, /CameraView/);
  assert.match(nativeCamera, /takePictureAsync/);
  assert.match(nativeCamera, /requestPermission/);
});

test('video de abertura tem player nativo e respeita reducao de movimento', () => {
  const onboarding = fs.readFileSync(path.join(root, 'screens', 'OnboardingScreen.js'), 'utf8');
  const nativeVideo = fs.readFileSync(path.join(root, 'components', 'IntroMascotVideo.native.js'), 'utf8');
  const webVideo = fs.readFileSync(path.join(root, 'components', 'IntroMascotVideo.js'), 'utf8');
  assert.match(onboarding, /<IntroMascotVideo reduceMotion=\{reduceMotion\}/);
  assert.match(nativeVideo, /from 'expo-video'/);
  assert.match(nativeVideo, /instance\.loop = true/);
  assert.match(nativeVideo, /instance\.muted = true/);
  assert.match(nativeVideo, /!reduceMotion/);
  assert.match(webVideo, /loop: true/);
  assert.match(webVideo, /navigator\.connection\?\.saveData/);
});

test('fontes dos icones Android tem resolucao segura para gerar os assets', async () => {
  for (const asset of [app.icon, app.android.adaptiveIcon.foregroundImage]) {
    const absolute = path.join(root, asset);
    assert.ok(fs.existsSync(absolute), `${asset} nao existe`);
    const metadata = await sharp(absolute).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, metadata.height, `${asset} precisa ser quadrado`);
    assert.ok(metadata.width >= 1024, `${asset} precisa ter pelo menos 1024 px`);
  }

  assert.match(app.android.adaptiveIcon.backgroundColor, /^#[0-9A-F]{6}$/i);
  assert.match(app.splash.backgroundColor, /^#[0-9A-F]{6}$/i);
});

test('pacote visual da Play atende aos limites obrigatorios', async () => {
  const iconPath = path.join(root, 'store-assets', 'play-icon-512.png');
  const icon = await sharp(iconPath).metadata();
  assert.equal(icon.format, 'png');
  assert.equal(icon.width, 512);
  assert.equal(icon.height, 512);
  assert.equal(icon.hasAlpha, true, 'icone da Play precisa ser PNG 32-bit com alpha');
  assert.ok(fs.statSync(iconPath).size <= 1024 * 1024, 'icone da Play excede 1024 KB');

  const featurePath = path.join(root, 'store-assets', 'feature-graphic-1024x500.png');
  const feature = await sharp(featurePath).metadata();
  assert.equal(feature.width, 1024);
  assert.equal(feature.height, 500);
  assert.equal(feature.hasAlpha, false, 'feature graphic precisa ser PNG 24-bit sem alpha');

  const sourceHashes = {};
  const expectedScreens = [
    '01-identificar.png',
    '02-resultado.png',
    '03-meu-registro.png',
    '04-descobrir.png',
    '05-diario.png',
  ];
  for (const locale of ['pt-BR', 'en-US']) {
    const screenshotsDir = path.join(root, 'store-assets', 'screenshots-ready', locale);
    const screenshots = fs.readdirSync(screenshotsDir)
      .filter((name) => /\.(png|jpe?g)$/i.test(name))
      .sort();
    assert.deepEqual(screenshots, expectedScreens, `${locale}: fontes da ficha incompletas`);

    sourceHashes[locale] = {};
    const hashes = new Set();
    for (const name of screenshots) {
      const screenshotPath = path.join(screenshotsDir, name);
      const bytes = fs.readFileSync(screenshotPath);
      const metadata = await sharp(bytes).metadata();
      const shorter = Math.min(metadata.width, metadata.height);
      const longer = Math.max(metadata.width, metadata.height);
      assert.ok(['jpeg', 'png'].includes(metadata.format), `${locale}/${name}: formato nao aceito`);
      assert.equal(metadata.hasAlpha, false, `${locale}/${name}: screenshot nao pode ter alpha`);
      assert.ok(shorter >= 320 && longer <= 3840, `${locale}/${name}: dimensoes fora de 320-3840 px`);
      assert.ok(longer <= shorter * 2, `${locale}/${name}: lado maior nao pode passar de 2x o menor`);
      const bottomHeight = Math.min(120, metadata.height);
      const bottomStats = await sharp(bytes)
        .extract({ left: 0, top: metadata.height - bottomHeight, width: metadata.width, height: bottomHeight })
        .stats();
      const rgb = bottomStats.channels.slice(0, 3);
      const uniformMidGray = rgb.every((channel) => channel.stdev < 2 && channel.mean > 90 && channel.mean < 180)
        && Math.max(...rgb.map((channel) => channel.mean)) - Math.min(...rgb.map((channel) => channel.mean)) < 15;
      assert.equal(uniformMidGray, false, `${locale}/${name}: faixa cinza uniforme no fim da captura`);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      hashes.add(hash);
      sourceHashes[locale][name] = hash;
    }
    assert.equal(hashes.size, screenshots.length, `${locale}: capturas precisam ser distintas`);
  }

  for (const name of expectedScreens) {
    assert.notEqual(
      sourceHashes['pt-BR'][name],
      sourceHashes['en-US'][name],
      `${name}: a interface en-US nao pode reutilizar a captura em portugues`
    );
  }

  for (const locale of ['pt-BR', 'en-US']) {
    const listingDir = path.join(root, 'store-assets', 'screenshots-listing', locale);
    const listing = fs.readdirSync(listingDir).filter((name) => /\.png$/i.test(name));
    assert.equal(listing.length, 5, `${locale}: a ficha precisa das cinco pecas diagramadas`);
    const listingHashes = new Set();
    for (const name of listing) {
      const bytes = fs.readFileSync(path.join(listingDir, name));
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, 1080, `${locale}/${name}: largura inesperada`);
      assert.equal(metadata.height, 1920, `${locale}/${name}: altura inesperada`);
      assert.equal(metadata.hasAlpha, false, `${locale}/${name}: a Play nao aceita alpha`);
      listingHashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
    }
    assert.equal(listingHashes.size, 5, `${locale}: as cinco pecas precisam ser distintas`);
  }
});

test('capturas editoriais nao fabricam score do identificador', () => {
  const capture = fs.readFileSync(path.join(root, 'scripts', 'capture-play-result.js'), 'utf8');
  const listing = fs.readFileSync(path.join(root, 'scripts', 'build-play-listing.js'), 'utf8');
  assert.doesNotMatch(capture, /confidence:\s*\d+/);
  assert.doesNotMatch(listing, /confian[cç]a|confidence/i);
  assert.match(capture, /STORE_LOCALE/);
  assert.match(capture, /Network\.setBlockedURLs/);
  assert.match(capture, /if \(!\(await scrollToText/);
  assert.match(capture, /window\.scrollY \|\| document\.documentElement\.scrollTop/);
});

test('pacote iOS tem icone sem alpha e capturas 6,7 polegadas', async () => {
  const icon = await sharp(path.join(root, app.icon)).metadata();
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.equal(icon.hasAlpha, false);
  for (const locale of ['pt-BR', 'en-US']) {
    const directory = path.join(root, 'store-assets', 'app-store-screenshots', locale);
    const files = fs.readdirSync(directory).filter((name) => /\.png$/i.test(name)).sort();
    assert.equal(files.length, 5);
    for (const file of files) {
      const metadata = await sharp(path.join(directory, file)).metadata();
      assert.equal(metadata.width, 1290);
      assert.equal(metadata.height, 2796);
      assert.equal(metadata.hasAlpha, false);
    }
  }
});

test('ASO localizado respeita limites e cobre os 17 idiomas do app', () => {
  const metadataRoot = path.join(root, 'store-assets', 'metadata');
  const expectedLocales = [
    'ar', 'cs-CZ', 'da-DK', 'de-DE', 'en-US', 'es-419', 'fr-FR', 'hi-IN',
    'it-IT', 'ko-KR', 'nl-NL', 'pl-PL', 'pt-BR', 'sv-SE', 'tr-TR',
    'zh-CN', 'zh-TW',
  ];
  const actualLocales = fs.readdirSync(metadataRoot)
    .filter((entry) => fs.statSync(path.join(metadataRoot, entry)).isDirectory())
    .sort();
  assert.deepEqual(actualLocales, expectedLocales);

  for (const locale of expectedLocales) {
    const readMetadata = (file) => fs.readFileSync(path.join(metadataRoot, locale, file), 'utf8').trim();
    const title = readMetadata('title.txt');
    const shortDescription = readMetadata('short-description.txt');
    const fullDescription = readMetadata('full-description.txt');
    const count = (value) => Array.from(value).length;

    assert.ok(count(title) <= 30, `${locale}: titulo excede 30 caracteres`);
    assert.ok(count(shortDescription) <= 80, `${locale}: descricao curta excede 80 caracteres`);
    assert.ok(count(fullDescription) <= 4000, `${locale}: descricao completa excede 4000 caracteres`);
    assert.match(title, /^NatureLens[:：]/, `${locale}: marca ausente do titulo`);
    assert.ok(fullDescription.includes('NatureLens'), `${locale}: marca ausente da descricao completa`);
  }
});
