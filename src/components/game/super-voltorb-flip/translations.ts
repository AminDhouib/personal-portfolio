// Instructions copy (en and pt-BR), moved out of super-voltorb-flip.tsx unchanged.

export type Language = "en" | "pt-BR";

type Translations = {
  howToPlayTitle: string;
  instructions: string[];
  tipsTitle: string;
  tips: string[];
};

export const translations: Record<Language, Translations> = {
  en: {
    howToPlayTitle: "How to play",
    instructions: [
      "Click on the cards to reveal them.",
      "The colored cards show how many Coins and Voltorbs are there per row or column.",
      "The goal is to find all the x2 and x3 Coins on each Level while avoiding Voltorbs.",
      "There are 8 Levels. Clearing a round moves you up one Level, and five good rounds in a row open Level 8.",
      "Hit a Voltorb and you drop to the number of cards you flipped. Press Quit to stop and keep your Coins, which drops you the same way.",
      "Have fun!",
    ],
    tipsTitle: "Tips:",
    tips: [
      "Avoid the rows and columns you know that can only have either a x1 Coin or a Voltorb.",
      "Reveal the rows and columns with 0 Voltorbs first.",
    ],
  },
  "pt-BR": {
    howToPlayTitle: "Como jogar",
    instructions: [
      "Clique nos cards para revelá-los.",
      "Os cards coloridos mostram quantas Moedas e Voltorbs existem em cada linha e coluna.",
      "O objetivo é achar todas as Moedas x2 e x3 em cada Level, evitando achar os Voltorbs.",
      "Sao 8 Levels. Vencer uma rodada sobe um Level, e cinco boas rodadas seguidas abrem o Level 8.",
      "Se achar um Voltorb, voce desce para o numero de cards que virou. Use Quit para parar e ficar com as Moedas, descendo do mesmo jeito.",
      "Divirta-se!",
    ],
    tipsTitle: "Dicas:",
    tips: [
      "Evite linhas e colunas que podem ter apenas uma Moeda x1 ou um Voltorb.",
      "Revele todas as linhas e colunas com 0 Voltorbs primeiro.",
    ],
  },
};
