export interface Source {
  id: string;
  title: string;
  author: string;
  authorDied: number;
  published: number;
  /** Project Gutenberg ebook number. */
  gutenberg: number;
}

// Every author died before 1926 and every work was published before 1929, so
// each is public domain in the US and under life+100 terms. Project Gutenberg
// is cited as the publication source only.
export const SOURCES: readonly Source[] = [
  {
    id: "austen-pp",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    authorDied: 1817,
    published: 1813,
    gutenberg: 1342,
  },
  {
    id: "austen-emma",
    title: "Emma",
    author: "Jane Austen",
    authorDied: 1817,
    published: 1815,
    gutenberg: 158,
  },
  {
    id: "melville",
    title: "Moby Dick",
    author: "Herman Melville",
    authorDied: 1891,
    published: 1851,
    gutenberg: 2701,
  },
  {
    id: "carroll",
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    authorDied: 1898,
    published: 1865,
    gutenberg: 11,
  },
  {
    id: "shelley",
    title: "Frankenstein",
    author: "Mary Shelley",
    authorDied: 1851,
    published: 1818,
    gutenberg: 84,
  },
  {
    id: "dickens-tale",
    title: "A Tale of Two Cities",
    author: "Charles Dickens",
    authorDied: 1870,
    published: 1859,
    gutenberg: 98,
  },
  {
    id: "dickens-ge",
    title: "Great Expectations",
    author: "Charles Dickens",
    authorDied: 1870,
    published: 1861,
    gutenberg: 1400,
  },
  {
    id: "thoreau",
    title: "Walden",
    author: "Henry David Thoreau",
    authorDied: 1862,
    published: 1854,
    gutenberg: 205,
  },
  {
    id: "twain",
    title: "Adventures of Huckleberry Finn",
    author: "Mark Twain",
    authorDied: 1910,
    published: 1884,
    gutenberg: 76,
  },
  {
    id: "wilde",
    title: "The Picture of Dorian Gray",
    author: "Oscar Wilde",
    authorDied: 1900,
    published: 1890,
    gutenberg: 174,
  },
  {
    id: "stevenson-ti",
    title: "Treasure Island",
    author: "Robert Louis Stevenson",
    authorDied: 1894,
    published: 1883,
    gutenberg: 120,
  },
  {
    id: "stevenson-jh",
    title: "The Strange Case of Dr Jekyll and Mr Hyde",
    author: "Robert Louis Stevenson",
    authorDied: 1894,
    published: 1886,
    gutenberg: 43,
  },
  {
    id: "bronte",
    title: "Jane Eyre",
    author: "Charlotte Bronte",
    authorDied: 1855,
    published: 1847,
    gutenberg: 1260,
  },
  {
    id: "stoker",
    title: "Dracula",
    author: "Bram Stoker",
    authorDied: 1912,
    published: 1897,
    gutenberg: 345,
  },
  {
    id: "conrad",
    title: "Heart of Darkness",
    author: "Joseph Conrad",
    authorDied: 1924,
    published: 1899,
    gutenberg: 219,
  },
  {
    id: "london",
    title: "The Call of the Wild",
    author: "Jack London",
    authorDied: 1916,
    published: 1903,
    gutenberg: 215,
  },
  {
    id: "eliot",
    title: "Middlemarch",
    author: "George Eliot",
    authorDied: 1880,
    published: 1872,
    gutenberg: 145,
  },
  {
    id: "alcott",
    title: "Little Women",
    author: "Louisa May Alcott",
    authorDied: 1888,
    published: 1868,
    gutenberg: 514,
  },
];

export function sourceUrl(s: Source): string {
  return `https://www.gutenberg.org/ebooks/${s.gutenberg}`;
}
