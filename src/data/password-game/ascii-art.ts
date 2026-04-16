/**
 * Small ASCII art subjects for the "identify the drawing" rule. Each entry
 * provides the art as an array of lines plus the accepted answers (usually
 * just one noun, but a few include common synonyms).
 */
export interface AsciiArt {
  id: string;
  art: readonly string[];
  answers: readonly string[];
}

export const ASCII_ART: readonly AsciiArt[] = Object.freeze([
  {
    id: "cat",
    art: [
      " /\\_/\\  ",
      "( o.o ) ",
      " > ^ <  ",
    ],
    answers: ["cat", "kitten"],
  },
  {
    id: "dog",
    art: [
      "  __      _",
      "o'')}____//",
      " `_/      )",
      " (_(_/-(_/ ",
    ],
    answers: ["dog", "puppy"],
  },
  {
    id: "fish",
    art: [
      "   ><(((°>",
    ],
    answers: ["fish"],
  },
  {
    id: "house",
    art: [
      "   ___  ",
      "  /   \\ ",
      " /_____\\",
      " | [ ] |",
      " |_[_]_|",
    ],
    answers: ["house", "home"],
  },
  {
    id: "boat",
    art: [
      "    |    ",
      "    |~~~ ",
      "    |    ",
      "\\___|___/",
      " \\_____/ ",
    ],
    answers: ["boat", "ship", "sailboat"],
  },
  {
    id: "tree",
    art: [
      "   /\\   ",
      "  /\\/\\  ",
      " /\\/\\/\\ ",
      "/\\/\\/\\/\\",
      "   ||   ",
    ],
    answers: ["tree"],
  },
  {
    id: "rocket",
    art: [
      "    /\\    ",
      "   /  \\   ",
      "  |    |  ",
      "  | [] |  ",
      " /|    |\\ ",
      "/_|____|_\\",
      "   /\\/\\   ",
    ],
    answers: ["rocket"],
  },
  {
    id: "heart",
    art: [
      " ♥♥   ♥♥ ",
      "♥♥♥♥ ♥♥♥♥",
      " ♥♥♥♥♥♥♥ ",
      "  ♥♥♥♥♥  ",
      "   ♥♥♥   ",
      "    ♥    ",
    ],
    answers: ["heart", "love"],
  },
  {
    id: "umbrella",
    art: [
      "   ___   ",
      "  /___\\  ",
      "   | |   ",
      "   | J   ",
    ],
    answers: ["umbrella"],
  },
  {
    id: "sword",
    art: [
      " /|",
      "( |",
      " \\|",
      "  |",
      "  |",
      "  *",
    ],
    answers: ["sword", "blade"],
  },
  {
    id: "coffee",
    art: [
      "  ~    ",
      "  ~   ~",
      " (   )~",
      " |   |_",
      " |   |/",
      " '---' ",
    ],
    answers: ["coffee", "cup", "mug"],
  },
  {
    id: "skull",
    art: [
      "  .-.   ",
      " (o.o)  ",
      "  |=|   ",
      "  |_|   ",
    ],
    answers: ["skull"],
  },
]);
