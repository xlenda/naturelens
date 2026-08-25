// Uma chave canonica para buscar o manual e o dossie do grupo. As telas podem
// manter seus nomes de campo, mas nunca podem discordar sobre qual topico abre.
const TOPIC_ALIAS = {
  confusas: 'safety',
  overview: 'role',
  habitat: 'role',
  commonUses: 'uses',
  edibleParts: 'uses',
};

export function canonicalTopicKey(topicKey) {
  return TOPIC_ALIAS[topicKey] || topicKey;
}
