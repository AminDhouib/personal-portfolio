import { describe, it, expect } from 'vitest'
import { extractToc, getAllBlogSlugs } from '../blog'

describe('extractToc', () => {
  it('returns empty array for empty string', () => {
    expect(extractToc('')).toEqual([])
  })

  it('parses a single h2', () => {
    expect(extractToc('## Hello World')).toEqual([
      { id: 'hello-world', text: 'Hello World', level: 2 },
    ])
  })

  it('parses a single h3', () => {
    expect(extractToc('### Sub Section')).toEqual([
      { id: 'sub-section', text: 'Sub Section', level: 3 },
    ])
  })

  it('parses mixed h2 and h3', () => {
    const content = `## First Heading\n### Nested One\n### Nested Two\n## Second Heading`
    expect(extractToc(content)).toEqual([
      { id: 'first-heading', text: 'First Heading', level: 2 },
      { id: 'nested-one', text: 'Nested One', level: 3 },
      { id: 'nested-two', text: 'Nested Two', level: 3 },
      { id: 'second-heading', text: 'Second Heading', level: 2 },
    ])
  })

  it('strips special characters from IDs', () => {
    expect(extractToc('## Hello, World!')).toEqual([
      { id: 'hello-world', text: 'Hello, World!', level: 2 },
    ])
  })

  it('ignores h1 and h4+ headings', () => {
    expect(extractToc('# Ignored\n#### Also Ignored')).toEqual([])
  })
})

describe('getAllBlogSlugs', () => {
  it('returns an array (empty if content/blog dir missing)', () => {
    const result = getAllBlogSlugs()
    expect(Array.isArray(result)).toBe(true)
  })
})
