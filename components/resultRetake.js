import { CATEGORIES } from './categories';

// A ficha pode estar no stack da camera, da Colecao ou do Aprender. Voltar so
// funciona no primeiro caso; nos outros, a nova captura precisa atravessar para
// a aba estavel da categoria. Arvore reutiliza a camera de Plantas por projeto.
export function retakeResult({ navigation, category, fromIdentify } = {}) {
  if (!navigation || !CATEGORIES[category]) return false;
  if (fromIdentify && typeof navigation.goBack === 'function') {
    navigation.goBack();
    return true;
  }

  const captureCategory = category === 'tree' ? 'plant' : category;
  const parent = typeof navigation.getParent === 'function' ? navigation.getParent() : null;
  if (!parent || typeof parent.navigate !== 'function') return false;

  parent.navigate(CATEGORIES[captureCategory].tabLabel, {
    screen: category === 'sound' ? 'SoundHome' : 'ScanHome',
    params: { category },
  });
  return true;
}
