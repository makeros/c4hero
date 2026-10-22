import { describe, expect, it } from 'vitest'
import { createSlugger, extractDocLinks, parseWikilink, resolveDocLink, resolveWikilink, slugify } from './docLinks'

describe('resolveDocLink', () => {
  const cur = 'docs/guide/intro.md'
  it('resolves a sibling', () => {
    expect(resolveDocLink(cur, 'other.md')).toEqual({ kind: 'doc', path: 'docs/guide/other.md', fragment: '' })
    expect(resolveDocLink(cur, './other.md')).toEqual({ kind: 'doc', path: 'docs/guide/other.md', fragment: '' })
  })
  it('resolves a subfolder', () => {
    expect(resolveDocLink(cur, 'sub/x.markdown')).toEqual({ kind: 'doc', path: 'docs/guide/sub/x.markdown', fragment: '' })
  })
  it('resolves an html/htm target', () => {
    expect(resolveDocLink('docs/a.md', 'r.html#x')).toEqual({ kind: 'doc', path: 'docs/r.html', fragment: 'x' })
    expect(resolveDocLink(cur, 'sub/x.htm')).toEqual({ kind: 'doc', path: 'docs/guide/sub/x.htm', fragment: '' })
  })
  it('resolves ../', () => {
    expect(resolveDocLink(cur, '../x.md')).toEqual({ kind: 'doc', path: 'docs/x.md', fragment: '' })
  })
  it('resolves root-relative from the project root', () => {
    expect(resolveDocLink(cur, '/top.md')).toEqual({ kind: 'doc', path: 'top.md', fragment: '' })
  })
  it('decodes encoded spaces', () => {
    expect(resolveDocLink('a.md', 'audit%20questions.md')).toEqual({ kind: 'doc', path: 'audit questions.md', fragment: '' })
  })
  it('keeps a decoded fragment', () => {
    expect(resolveDocLink('a.md', 'b.md#some-section')).toEqual({ kind: 'doc', path: 'b.md', fragment: 'some-section' })
  })
  it('keeps leading .. when escaping the root', () => {
    expect(resolveDocLink('a.md', '../../x.md')).toEqual({ kind: 'doc', path: '../../x.md', fragment: '' })
    expect(resolveDocLink('docs/a.md', '../../x.md')).toEqual({ kind: 'doc', path: '../x.md', fragment: '' })
  })
  it('classifies external, mailto, anchor and other', () => {
    expect(resolveDocLink(cur, 'https://c4hero.com')).toEqual({ kind: 'external' })
    expect(resolveDocLink(cur, 'mailto:a@b.c')).toEqual({ kind: 'external' })
    expect(resolveDocLink(cur, '#intro')).toEqual({ kind: 'anchor', fragment: 'intro' })
    expect(resolveDocLink(cur, 'img.png')).toEqual({ kind: 'other' })
    expect(resolveDocLink(cur, 'javascript:alert(1)')).toEqual({ kind: 'other' })
    expect(resolveDocLink(cur, '')).toEqual({ kind: 'other' })
  })
})

describe('slugify / createSlugger', () => {
  it('strips punctuation and lowercases', () => {
    expect(slugify('Hello, World! (v2) - ok_1')).toBe('hello-world-v2---ok_1')
  })
  it('keeps unicode letters', () => {
    expect(slugify('Zażółć gęślą jaźń')).toBe('zażółć-gęślą-jaźń')
  })
  it('dedupes with -1, -2', () => {
    const s = createSlugger()
    expect([s('Intro'), s('Intro'), s('Intro'), s('Intro 1')]).toEqual(['intro', 'intro-1', 'intro-2', 'intro-1-1'])
  })
})

describe('parseWikilink', () => {
  it('splits target, heading and alias, accepting an escaped pipe', () => {
    expect(parseWikilink('Cloud')).toEqual({ target: 'Cloud', heading: '', alias: '' })
    expect(parseWikilink('Cloud|The cloud')).toEqual({ target: 'Cloud', heading: '', alias: 'The cloud' })
    expect(parseWikilink('CI-CD and supply chain\\|CI/CD and supply chain')).toEqual({
      target: 'CI-CD and supply chain',
      heading: '',
      alias: 'CI/CD and supply chain',
    })
    expect(parseWikilink('Cloud#Some Heading|alias')).toEqual({ target: 'Cloud', heading: 'Some Heading', alias: 'alias' })
    expect(parseWikilink('#Only heading')).toEqual({ target: '', heading: 'Only heading', alias: '' })
  })
})

describe('resolveWikilink', () => {
  // Mirrors nagi-audit: a root note, standards/*.md, and a doc with an unresolved link.
  const index = [
    'Best practice Standards.md',
    'audit-questions.md',
    'standards/Cloud.md',
    'standards/Containers.md',
    'standards/Code quality.md',
    'standards/CI-CD and supply chain.md',
    'standards/Data integrity.md',
  ]
  const root = 'Best practice Standards.md'

  it('finds a name in a subfolder from the root note', () => {
    expect(resolveWikilink(root, 'Cloud', index)).toEqual({ kind: 'doc', path: 'standards/Cloud.md', fragment: '' })
    expect(resolveWikilink(root, 'Code quality', index)).toEqual({ kind: 'doc', path: 'standards/Code quality.md', fragment: '' })
  })
  it('ignores the alias, escaped pipe included', () => {
    expect(resolveWikilink(root, 'CI-CD and supply chain\\|CI/CD and supply chain', index)).toEqual({
      kind: 'doc',
      path: 'standards/CI-CD and supply chain.md',
      fragment: '',
    })
    expect(resolveWikilink(root, 'Data integrity|Data integrity (if GxP applies)', index)).toMatchObject({
      path: 'standards/Data integrity.md',
    })
  })
  it('reports an unresolved target with the guessed path next to the current doc', () => {
    expect(resolveWikilink('standards/Data integrity.md', 'Company profile', index)).toEqual({
      kind: 'unresolved',
      target: 'Company profile',
      path: 'standards/Company profile.md',
    })
  })
  it('keeps an explicit .md extension and does not double it', () => {
    expect(resolveWikilink(root, 'Cloud.md', index)).toMatchObject({ path: 'standards/Cloud.md' })
    expect(resolveWikilink(root, 'cloud.MD', index)).toMatchObject({ path: 'standards/Cloud.md' })
  })
  it('resolves subfolder targets relative to the doc, then from the root', () => {
    expect(resolveWikilink(root, 'standards/Cloud', index)).toMatchObject({ path: 'standards/Cloud.md' })
    expect(resolveWikilink('standards/Cloud.md', '../audit-questions', index)).toMatchObject({ path: 'audit-questions.md' })
    expect(resolveWikilink('standards/Cloud.md', 'standards/Containers', index)).toMatchObject({ path: 'standards/Containers.md' })
  })
  it('prefers a relative match over a root match over a name match', () => {
    const idx = ['a/x.md', 'a/b/x.md', 'x.md', 'z/x.md']
    expect(resolveWikilink('a/b/doc.md', 'x', idx)).toMatchObject({ path: 'a/b/x.md' })
    expect(resolveWikilink('a/doc.md', 'b/x', idx)).toMatchObject({ path: 'a/b/x.md' })
    expect(resolveWikilink('q/doc.md', 'x', idx)).toMatchObject({ path: 'x.md' })
  })
  it('breaks name ties by fewest segments, then alphabetical; exact case first', () => {
    expect(resolveWikilink('top.md', 'n', ['b/c/n.md', 'z/n.md', 'a/n.md'])).toMatchObject({ path: 'a/n.md' })
    expect(resolveWikilink('top.md', 'n', ['b/n.md', 'a/c/n.md'])).toMatchObject({ path: 'b/n.md' })
    expect(resolveWikilink('top.md', 'Name', ['a/name.md', 'b/c/Name.md'])).toMatchObject({ path: 'b/c/Name.md' })
  })
  it('prefers a match in the same folder as the current doc', () => {
    expect(resolveWikilink('s/t/doc.md', 'n', ['a/n.md', 's/t/u/n.md'])).toMatchObject({ path: 'a/n.md' })
    expect(resolveWikilink('s/t/doc.md', 'n', ['a/n.md', 's/t/n.md'])).toMatchObject({ path: 's/t/n.md' })
  })
  it('turns a heading into a slug fragment', () => {
    expect(resolveWikilink(root, 'Cloud#Storage & Backups|alias', index)).toEqual({
      kind: 'doc',
      path: 'standards/Cloud.md',
      fragment: 'storage--backups',
    })
  })
  it('resolves [[#heading]] as an in-page anchor', () => {
    expect(resolveWikilink(root, '#My Heading', index)).toEqual({ kind: 'anchor', fragment: 'my-heading' })
  })
  it('guesses the relative path when the index is unavailable', () => {
    expect(resolveWikilink('standards/Cloud.md', 'Containers', null)).toEqual({
      kind: 'doc',
      path: 'standards/Containers.md',
      fragment: '',
    })
  })
  it('falls back to .html only when no .md candidate matches', () => {
    expect(resolveWikilink('a.md', 'r', ['r.md', 'r.html'])).toEqual({ kind: 'doc', path: 'r.md', fragment: '' })
    expect(resolveWikilink('a.md', 'r', ['r.html'])).toEqual({ kind: 'doc', path: 'r.html', fragment: '' })
    expect(resolveWikilink('a.md', 'r.html', ['r.md', 'r.html'])).toEqual({ kind: 'doc', path: 'r.html', fragment: '' })
  })
  it('never resolves above the root', () => {
    const escaped = resolveWikilink('a.md', '../../etc/passwd', index)
    expect(escaped.kind).toBe('unresolved')
    expect((escaped as { path: string }).path.split('/')[0]).toBe('..')
    expect(resolveWikilink('a.md', '../x', null)).toMatchObject({ kind: 'doc', path: '../x.md' })
  })
})

describe('extractDocLinks', () => {
  it('finds markdown links, autolinks, definitions, mentions and wikilinks', () => {
    const md = [
      '[a](a.md#f) and [b](<sub dir/b.md>) and ![i](img.png) <c.md>',
      '',
      '[ref]: d.md',
      '',
      'See `e.md` and `not a path`. [[W]] ![[Emb#H|x]] [[A\\|B]]',
    ].join('\n')
    const { hrefs, wikilinks } = extractDocLinks(md)
    expect(hrefs).toEqual(expect.arrayContaining(['e.md', 'a.md#f', 'sub dir/b.md', 'img.png', 'd.md', 'c.md']))
    expect(wikilinks).toEqual(['W', 'Emb#H|x', 'A\\|B'])
  })
  it('matches <x.html> autolinks too', () => {
    const { hrefs } = extractDocLinks('See <report.html> and <page.htm#frag>')
    expect(hrefs).toEqual(expect.arrayContaining(['report.html', 'page.htm#frag']))
  })
  it('skips fenced code, and inline code for links and wikilinks', () => {
    const md = ['```', '[x](fenced.md) [[Fenced]] `f.md`', '```', '', '~~~md', '[[Tilde]]', '~~~', '', '`[[Inline]]` `[y](inline.md)` [z](real.md)'].join('\n')
    const { hrefs, wikilinks } = extractDocLinks(md)
    expect(wikilinks).toEqual([])
    expect(hrefs).toEqual(['real.md'])
  })
})
