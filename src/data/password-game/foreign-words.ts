export interface ForeignWord {
  english: string;
  translation: string;
  language: string;
}

export const FOREIGN_WORDS: readonly ForeignWord[] = Object.freeze([
  { english: "house", translation: "casa", language: "Spanish" },
  { english: "book", translation: "libro", language: "Spanish" },
  { english: "dog", translation: "perro", language: "Spanish" },
  { english: "friend", translation: "amigo", language: "Spanish" },
  { english: "house", translation: "maison", language: "French" },
  { english: "bread", translation: "pain", language: "French" },
  { english: "water", translation: "eau", language: "French" },
  { english: "cheese", translation: "fromage", language: "French" },
  { english: "apple", translation: "apfel", language: "German" },
  { english: "night", translation: "nacht", language: "German" },
  { english: "street", translation: "strasse", language: "German" },
  { english: "child", translation: "kind", language: "German" },
  { english: "love", translation: "amore", language: "Italian" },
  { english: "sun", translation: "sole", language: "Italian" },
  { english: "moon", translation: "luna", language: "Italian" },
  { english: "wine", translation: "vino", language: "Italian" },
  { english: "cat", translation: "neko", language: "Japanese" },
  { english: "mountain", translation: "yama", language: "Japanese" },
  { english: "flower", translation: "hana", language: "Japanese" },
  { english: "fire", translation: "hi", language: "Japanese" },
]);
