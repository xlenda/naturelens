// Regressao do ritmo visual compartilhado e da acessibilidade no Android.
// Rode com: node --test premium-layout.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');

function color(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*'(#[0-9A-Fa-f]{6})'`));
  assert.ok(match, `token de cor ausente: ${key}`);
  return match[1];
}

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('muted text keeps AA contrast on every core dark surface', () => {
  const theme = read('components/theme.js');
  const muted = color(theme, 'textMuted');
  for (const surface of ['background', 'surface', 'card']) {
    assert.ok(
      contrast(muted, color(theme, surface)) >= 4.5,
      `textMuted precisa de contraste AA sobre ${surface}`
    );
  }
});

test('theme exposes one spacing, radius, control and line-height contract', () => {
  const theme = read('components/theme.js');
  assert.match(theme, /export const space\s*=\s*\{/);
  assert.match(theme, /export const radius\s*=\s*\{/);
  assert.match(theme, /export const control\s*=\s*\{[\s\S]*minTouch:\s*44/);
  assert.match(theme, /export const lineHeight\s*=\s*\{/);
  assert.match(theme, /screenTitle:[\s\S]*lineHeight:\s*lineHeight\.screen/);
  assert.match(theme, /caption:[\s\S]*lineHeight:\s*lineHeight\.caption/);
});

test('shared headers and section titles own semantics and touch targets', () => {
  const topBar = read('components/TopBar.js');
  const main = read('components/MainScreenHeader.js');
  const section = read('components/SectionHeading.js');
  const card = read('components/SectionCard.js');

  assert.match(topBar, /width:\s*control\.minTouch/);
  assert.match(topBar, /height:\s*control\.minTouch/);
  assert.match(main, /accessibilityRole="header"/);
  assert.match(section, /accessibilityRole="header"/);
  assert.match(card, /accessibilityRole="header"/);
});

test('category picker replaces the hidden horizontal rail with an accessible two-column grid', () => {
  const tabBar = read('components/TwoRowTabBar.js');
  const picker = read('components/CategoryPickerModal.js');

  assert.doesNotMatch(tabBar, /<ScrollView\b/);
  assert.match(tabBar, /<CategoryPickerModal\b/);
  assert.match(tabBar, /const pickerOptions = scan\.map/);
  assert.match(tabBar, /onSelect=\{selectCategory\}/);
  assert.match(tabBar, /setPickerVisible\(false\)[\s\S]*navigation\.navigate\(option\.route\.name\)/);
  assert.match(tabBar, /categoryTrigger:\s*\{[\s\S]*minHeight:\s*control\.minTouch/);
  assert.match(tabBar, /const BOTTOM_ROW = new Set\(\['Collection', 'Profile', 'Discover', 'Botanist'\]\)/);
  assert.match(tabBar, /hiddenDock:\s*\{ height:\s*0 \}/);

  assert.match(picker, /flexWrap:\s*'wrap'/);
  assert.match(picker, /option:\s*\{[\s\S]*flexBasis:\s*'46%'[\s\S]*flexGrow:\s*1[\s\S]*minHeight:\s*control\.minTouch/);
  assert.match(picker, /accessibilityState=\{\{ selected:\s*option\.selected \}\}/);
  assert.match(picker, /accessibilityViewIsModal=\{true\}/);
  assert.match(picker, /t\('identify\.switchCategoryTitle'\)/);
  assert.match(picker, /t\('identify\.switchCategoryMessage'\)/);
  assert.match(picker, /t\('common\.cancel'\)/);
});

test('identification entry reviews a vertical 1-to-3 photo plan before upload', () => {
  const identify = read('screens/IdentifyScreen.js');

  assert.match(identify, /const \[photoSlots, setPhotoSlots\] = useState\(\[null, null, null\]\)/);
  assert.match(identify, /const visiblePhotoSlots = supportsMultiplePhotos \? MAX_PHOTOS : 1/);
  assert.match(identify, /const capturePhotoForSlot = async \(slot\)/);
  assert.match(identify, /const choosePhotoForSlot = async \(slot\)/);
  assert.match(identify, /<LensPulseButton[\s\S]*onComplete=\{requestPhotoConsent\}/);
  assert.match(identify, /photos\.map\(\(photo\) => photo\.base64\)/);
  assert.doesNotMatch(identify, /extraPhotos|handleAddAngle|handleUpload/);
  assert.match(identify, /photoSlotRow:\s*\{[\s\S]*minHeight:\s*66/);
  assert.match(identify, /slotAction:\s*\{[\s\S]*width:\s*44[\s\S]*height:\s*44/);
  assert.match(identify, /photoSlotThumbButton:\s*\{ width:\s*46, height:\s*46 \}/);
  assert.match(identify, /recentGrid:\s*\{[^}]*flexWrap:\s*'wrap'/);
  assert.doesNotMatch(identify, /<ScrollView\s+horizontal/);
  assert.match(identify, /expo-file-system\/legacy/);
  assert.match(identify, /photo\.uri\.startsWith\(FileSystem\.cacheDirectory\)/);
  assert.match(identify, /photos\.slice\(1\)\.forEach\(discardPreparedPhoto\)/);
});

test('the large identification stage captures the primary photo then reveals intentionally', () => {
  const identify = read('screens/IdentifyScreen.js');
  const stageStart = identify.indexOf('<ViewfinderContainer\n          style={styles.viewfinder}');
  const stageEnd = identify.indexOf('</ViewfinderContainer>', stageStart);
  const stage = identify.slice(stageStart, stageEnd);

  assert.ok(stageStart >= 0 && stageEnd > stageStart, 'o palco precisa ter um container explicito');
  assert.match(identify, /const ViewfinderContainer = primaryPhoto \? View : TouchableOpacity/);
  assert.match(stage, /onPress=\{primaryPhoto \? undefined : \(\) => capturePhotoForSlot\(0\)\}/);
  assert.match(stage, /disabled=\{primaryPhoto \? undefined : scanning\}/);
  assert.match(stage, /activeOpacity=\{primaryPhoto \? undefined : 0\.86\}/);
  assert.match(stage, /accessibilityRole=\{scanning \? 'progressbar' : primaryPhoto \? undefined : 'button'\}/);
  assert.match(stage, /identify\.takePhotoLabel/);
  assert.match(stage, /accessibilityHint=\{scanning \|\| primaryPhoto \? undefined : t\(`categories\.\$\{category\}\.scanHint`\)\}/);
  assert.match(stage, /<LensPulseButton[\s\S]*onComplete=\{requestPhotoConsent\}/);
  assert.doesNotMatch(stage, /onPress=\{requestPhotoConsent\}|runIdentification|await identify/,
    'toque comum abre a camera; somente o LensPulse pode pedir consentimento');
  assert.match(identify, /cameraPrompt:\s*\{[\s\S]*minHeight:\s*44/);
  assert.match(identify, /stagePulse:\s*\{[\s\S]*zIndex:\s*4/);
});

test('long consent keeps its actions reachable and isolates assistive focus', () => {
  const modal = read('components/AlertModal.js');

  assert.match(modal, /<Modal\b[\s\S]*onRequestClose=\{onRequestClose\}/);
  assert.match(modal, /accessibilityViewIsModal=\{true\}/);
  assert.match(modal, /onAccessibilityEscape=\{onRequestClose\}/);
  assert.match(modal, /<ScrollView[\s\S]*style=\{styles\.messageScroll\}/);
  assert.match(modal, /card:\s*\{[\s\S]*maxHeight:\s*'88%'/);
  assert.ok(modal.indexOf('style={styles.messageScroll}') < modal.indexOf('style={styles.buttons}'));
});

test('quick facts preserve the supporting label in narrow English cards', () => {
  const quickFacts = read('components/QuickFactGrid.js');
  assert.match(quickFacts, /style=\{styles\.label\} numberOfLines=\{2\}/);
  assert.match(quickFacts, /label:\s*\{[^}]*lineHeight:\s*15/);
});

test('TopBar reserves two touch targets, their gap and outer padding for a long title', () => {
  const topBar = read('components/TopBar.js');

  assert.match(
    topBar,
    /const TWO_ACTION_SIDE_RESERVE\s*=\s*control\.minTouch\s*\*\s*2\s*\+\s*space\.xs\s*\+\s*space\.md\s*;/,
    'a reserva precisa cobrir 2 acoes, o gap entre elas e o padding externo'
  );
  assert.match(
    topBar,
    /titleLayer:\s*\{[\s\S]*paddingHorizontal:\s*TWO_ACTION_SIDE_RESERVE/,
    'o titulo precisa consumir a reserva segura dos dois lados'
  );
});

test('the four core screens consume the shared rhythm primitives', () => {
  for (const screen of ['IdentifyScreen.js', 'DiscoverScreen.js', 'CollectionScreen.js']) {
    assert.match(read(`screens/${screen}`), /<MainScreenHeader\b/, `${screen} precisa do header comum`);
  }
  for (const screen of ['DiscoverScreen.js', 'SpecimenScreen.js']) {
    assert.match(read(`screens/${screen}`), /<SectionHeading\b/, `${screen} precisa do titulo de secao comum`);
  }

  const collection = read('screens/CollectionScreen.js');
  const specimen = read('screens/SpecimenScreen.js');
  assert.match(collection, /chip:[\s\S]*minHeight:\s*control\.minTouch/);
  assert.match(collection, /removeBtn:[\s\S]*minHeight:\s*control\.minTouch/);
  for (const controlName of [
    'heroPersonalizeButton',
    'careButton',
    'roomChip',
    'secondaryButton',
    'primarySmallButton',
    'editNoteButton',
    'removeNoteButton',
    'guideButton',
  ]) {
    assert.match(
      specimen,
      new RegExp(`${controlName}: \\{[\\s\\S]*?minHeight:\\s*control\\.minTouch[\\s\\S]*?\\n  \\}`),
      `${controlName} precisa do alvo minimo compartilhado`
    );
  }

  assert.match(
    specimen,
    /modalCloseButton: \{[\s\S]*?width:\s*control\.minTouch[\s\S]*?height:\s*control\.minTouch[\s\S]*?\n  \}/,
    'fechar do modal precisa de alvo 44x44'
  );
});

test('Meu Registro usa capa fotografica e modal acessivel de personalizacao', () => {
  const specimen = read('screens/SpecimenScreen.js');
  const heroStart = specimen.indexOf('  hero: {');
  const heroEnd = specimen.indexOf('\n  },', heroStart);
  const heroStyle = specimen.slice(heroStart, heroEnd);
  const height = Number(heroStyle.match(/height:\s*(\d+)/)?.[1]);

  assert.ok(heroStart >= 0 && heroEnd > heroStart);
  assert.ok(height >= 190 && height <= 210, `capa precisa ter 190-210px, recebeu ${height}`);
  assert.match(heroStyle, /marginHorizontal:\s*-20/);
  assert.match(specimen, /import \{ LinearGradient \} from 'expo-linear-gradient'/);
  assert.match(specimen, /<LinearGradient[\s\S]*style=\{styles\.heroGradient\}/);
  assert.match(specimen, /style=\{styles\.heroPersonalizeButton\}[\s\S]*onPress=\{openProfileModal\}/);

  const modalStart = specimen.indexOf('<Modal');
  const modalEnd = specimen.indexOf('</Modal>', modalStart);
  const modal = specimen.slice(modalStart, modalEnd);
  assert.ok(modalStart >= 0 && modalEnd > modalStart);
  assert.match(modal, /visible=\{profileModalVisible\}/);
  assert.match(modal, /onRequestClose=\{closeProfileModal\}/);
  assert.match(modal, /accessibilityViewIsModal=\{true\}/);
  assert.match(modal, /onAccessibilityEscape=\{closeProfileModal\}/);
  assert.match(modal, /accessibilityLabel=\{t\('common\.close'\)\}/);
});

test('Meu Registro preserva ordem quente, persistencia e cor da acao', () => {
  const specimen = read('screens/SpecimenScreen.js');
  const scrollStart = specimen.indexOf('<ScrollView');
  const scrollEnd = specimen.indexOf('</ScrollView>', scrollStart);
  const flow = specimen.slice(scrollStart, scrollEnd);
  const positions = [
    flow.indexOf('styles.hero'),
    flow.indexOf('{!!risk && ('),
    flow.indexOf('{!!wateringStatus && ('),
    flow.indexOf("t('specimen.observationTitle')"),
    flow.indexOf('{timeline.length > 0 && ('),
    flow.indexOf('{!!meta?.detailRoute && ('),
  ];

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.doesNotMatch(flow, /<SectionHeading>\{t\('specimen\.personalizeTitle'\)\}/);
  assert.match(specimen, /const saveProfile = async \(\) => \{[\s\S]*applyProfilePatch\(\{ nickname, room \}\)[\s\S]*if \(saved\) setProfileModalVisible\(false\)/);
  assert.match(specimen, /const applyProfilePatch = async \(patch\) => \{[\s\S]*showSaveError\(\)[\s\S]*setRoomDraft\(updated\.room \|\| null\)/);
  assert.match(specimen, /name="water-outline" size=\{23\} color=\{colors\.info\}/);
  assert.match(specimen, /careButton: \{[\s\S]*backgroundColor:\s*colors\.accent[\s\S]*?\n  \}/);
});
