import { CATEGORIES } from './categories';
import { saveToCollection } from './storage';
import { trackResultSaved } from './tracking';

// A identificacao paga ja terminou aqui. Persistir antes de abrir a ficha evita
// perder o achado se a pessoa fechar a tela, apertar Voltar ou o sistema matar o
// app logo depois. Audio bruto e base64 nunca entram em `entity`: as duas telas
// chamadoras passam somente o resultado visual que a Colecao ja sabe guardar.
export async function saveIdentificationAutomatically(entity, category) {
  const safeCategory = CATEGORIES[category]?.key;
  if (!safeCategory || !entity || typeof entity !== 'object' || Array.isArray(entity)) return null;

  const entry = await saveToCollection({ ...entity, category: safeCategory });
  if (!entry) return null;

  // Telemetria e recompensa nunca decidem se o exemplar foi salvo. O retorno
  // depende somente da leitura persistida; servicos auxiliares podem falhar sem
  // transformar um sucesso local em falso erro para a pessoa.
  try {
    trackResultSaved({ category: safeCategory });
  } catch (e) {
    // sem telemetria, o exemplar continua salvo
  }
  return entry;
}
