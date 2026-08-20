import { colors } from './theme';

// The four "Books of Nature". Each one packages an existing Discover
// collection whose species already carry full field-guide prose in
// {lang}-species.json (insectDetails/fungiDetails/cropDetails/soundDetails,
// translated in all 17 languages) - so a book is a DOOR to content that
// already ships, never new content.
//
// - group: the {lang}-species.json group the chapters' prose lives in.
// - topicKey: the discover.topics key, so title/species names come from the
//   locale bundle already loaded at boot - nothing here is displayable text.
// - coverSci: scientific name of the group's first species. Language-
//   independent, so the cover photo resolves through the same speciesPhoto
//   cache in every locale, and FindThumb degrades to the icon if it fails.
// - icon/color mirror the collection's own Discover card, so a book is
//   recognisably "the mushroom one" before its title is read.
//
// The first book costs 0 on purpose (possession effect): redeeming one book
// for free teaches the redeem gesture and makes the other three wanted.
export const BOOKS = [
  { id: 'bookInsects', group: 'insectDetails', topicKey: 'gardenInsects', cost: 0, coverSci: 'Coccinella septempunctata', icon: 'bug-outline', color: colors.warning },
  { id: 'bookFungi', group: 'fungiDetails', topicKey: 'fungiOfTheWorld', cost: 30, coverSci: 'Amanita muscaria', icon: 'mushroom-outline', color: colors.purple },
  { id: 'bookCrops', group: 'cropDetails', topicKey: 'fromFieldToPlate', cost: 30, coverSci: 'Zea mays', icon: 'nutrition-outline', color: colors.info },
  { id: 'bookSounds', group: 'soundDetails', topicKey: 'heardNotSeen', cost: 30, coverSci: 'Strix aluco', icon: 'mic-outline', color: '#9A7FC7' },
];

export function getBook(id) {
  return BOOKS.find((b) => b.id === id) || null;
}
