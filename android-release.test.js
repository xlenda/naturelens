const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const root = __dirname;
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function pluginConfig(name) {
  const plugin = (app.plugins || []).find((entry) =>
    Array.isArray(entry) ? entry[0] === name : entry === name
  );
  return Array.isArray(plugin) ? plugin[1] || {} : null;
}

test('release Android mantem pacote, AAB e versionamento remoto', () => {
  assert.equal(app.android.package, 'app.naturelens');
  assert.match(app.version, /^\d+\.\d+\.\d+$/);
  assert.match(pkg.dependencies.expo, /54\./, 'Expo SDK 54 e o que entrega targetSdk 36');
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
});

test('release Android limita cada permissao nativa ao recurso declarado', () => {
  const imagePicker = pluginConfig('expo-image-picker');
  const camera = pluginConfig('expo-camera');
  const location = pluginConfig('expo-location');
  const notifications = pluginConfig('expo-notifications');
  const audioStudio = pluginConfig('@siteed/audio-studio');
  assert.ok(imagePicker, 'expo-image-picker precisa de configuracao explicita');
  assert.match(imagePicker.microphonePermission, /NatureLens/);
  assert.match(imagePicker.cameraPermission, /NatureLens/);
  assert.match(imagePicker.photosPermission, /NatureLens/);
  assert.ok(camera, 'o visor nativo precisa do plugin de camera');
  assert.match(camera.cameraPermission, /NatureLens/);
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

test('visor cinematografico fica no binario nativo sem entrar no bundle web', () => {
  const webCamera = fs.readFileSync(path.join(root, 'components', 'NativeLensCamera.js'), 'utf8');
  const nativeCamera = fs.readFileSync(path.join(root, 'components', 'NativeLensCamera.native.js'), 'utf8');
  assert.doesNotMatch(webCamera, /from ['"]expo-camera['"]/);
  assert.match(nativeCamera, /from ['"]expo-camera['"]/);
  assert.match(nativeCamera, /CameraView/);
  assert.match(nativeCamera, /takePictureAsync/);
  assert.match(nativeCamera, /requestPermission/);
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
