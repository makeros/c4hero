import { describe, expect, it } from 'vitest'
import { renderMarkdownToSafeHtml } from './markdown'

describe('renderMarkdownToSafeHtml', () => {
  it('renders a heading as an <h1> element', () => {
    const html = renderMarkdownToSafeHtml('# Hello world')
    expect(html).toContain('>Hello world</h1>')
  })

  it('renders a link as an <a> element with its href preserved', () => {
    const html = renderMarkdownToSafeHtml('[c4hero](https://c4hero.com)')
    expect(html).toContain('<a href="https://c4hero.com">c4hero</a>')
  })

  it('renders a fenced code block as <pre><code>', () => {
    const html = renderMarkdownToSafeHtml('```\nconst x = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('<code>')
    expect(html).toContain('const x = 1')
  })

  it('turns a mermaid code fence into a <pre class="mermaid"> with the raw diagram source', () => {
    const html = renderMarkdownToSafeHtml('```mermaid\ngraph TD\nA --> B\n```')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const pre = doc.querySelector('pre.mermaid')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toBe('graph TD\nA --> B')
    expect(doc.querySelector('code')).toBeNull()
  })

  it('leaves a non-mermaid fenced code block untouched', () => {
    const html = renderMarkdownToSafeHtml('```js\nconst x = 1\n```')
    expect(html).not.toContain('class="mermaid"')
    expect(html).toContain('language-js')
  })

  it('strips a raw <script> tag embedded in the source markdown', () => {
    const html = renderMarkdownToSafeHtml(
      '# Title\n\n<script>alert("xss")</script>\n\nSome text',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(')
    expect(html).toContain('>Title</h1>')
    expect(html).toContain('Some text')
  })

  it('gives headings prefixed, deduped slug ids', () => {
    const html = renderMarkdownToSafeHtml('# Hello, World!\n\n## Intro\n\n## Intro')
    expect(html).toContain('<h1 id="user-content-hello-world">')
    expect(html).toContain('<h2 id="user-content-intro">')
    expect(html).toContain('<h2 id="user-content-intro-1">')
  })

  it('rewrites links only when a docPath is given', () => {
    const md = '[a](sub/b%20c.md#frag) [x](https://x.io) [t](#intro) [i](img.png)'
    const html = renderMarkdownToSafeHtml(md, { docPath: 'docs/a.md' })
    expect(html).toContain('href="/document-view?path=docs%2Fsub%2Fb+c.md&amp;title=a#frag"')
    expect(html).toContain('<a href="https://x.io" target="_blank" rel="noopener noreferrer">')
    expect(html).toContain('href="#user-content-intro"')
    expect(html).toContain('<a href="img.png">')
  })

  it('rewrites a markdown link to an html document', () => {
    const html = renderMarkdownToSafeHtml('[x](r.html)', { docPath: 'a.md', index: ['a.md', 'r.html'] })
    expect(html).toContain('<a href="/document-view?path=r.html')
  })

  describe('inline-code document mentions', () => {
    const render = (md: string) => renderMarkdownToSafeHtml(md, { docPath: 'docs/a.md' })
    const link = (href: string, text: string) =>
      `<a href="${href}" class="doc-code-link"><code>${text}</code></a>`

    it.each([
      ['audit-questions.md', '/document-view?path=docs%2Faudit-questions.md&amp;title=audit-questions'],
      ['docs/x.md', '/document-view?path=docs%2Fdocs%2Fx.md&amp;title=x'],
      ['../up.md', '/document-view?path=up.md&amp;title=up'],
      ['with space.md', '/document-view?path=docs%2Fwith+space.md&amp;title=with+space'],
      ['a.md#frag', '/document-view?path=docs%2Fa.md&amp;title=a#frag'],
      ['README.markdown', '/document-view?path=docs%2FREADME.markdown&amp;title=README'],
    ])('links `%s`', (text, href) => {
      expect(render(`See \`${text}\` here`)).toContain(link(href, text))
    })

    it.each([
      ['foo.mdx'],
      ['file.md.bak'],
      ['https://x/y.md'],
      ['npm run x'],
      ['index.html'],
    ])('does not link `%s`', (text) => {
      expect(render(`See \`${text}\` here`)).not.toContain('doc-code-link')
    })

    it('does not link code in a fenced block or already inside a link', () => {
      expect(render('```\naudit-questions.md\n```')).not.toContain('doc-code-link')
      const html = render('[`audit-questions.md`](other.md)')
      expect(html).not.toContain('doc-code-link')
      expect(html).toContain('<a href="/document-view?path=docs%2Fother.md')
    })

    it('does not link without a docPath', () => {
      expect(renderMarkdownToSafeHtml('`a.md`')).not.toContain('<a')
    })
  })
})

describe('wikilinks', () => {
  const index = ['Best practice Standards.md', 'standards/Cloud.md', 'standards/CI-CD and supply chain.md', 'standards/Data integrity.md']
  const render = (md: string, docPath = 'Best practice Standards.md') => renderMarkdownToSafeHtml(md, { docPath, index })
  const anchors = (html: string) => Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a'))

  it('renders [[target]] as a document-view link showing the target name', () => {
    const [a] = anchors(render('See [[Cloud]].'))
    expect(a.textContent).toBe('Cloud')
    expect(a.getAttribute('href')).toBe('/document-view?path=standards%2FCloud.md&title=Cloud')
    expect(a.getAttribute('data-wikilink')).toBe('Cloud')
  })

  it('uses the alias, with a plain or an escaped pipe', () => {
    const links = anchors(render('[[Cloud|the cloud]] and [[Data integrity\\|Data integrity (if GxP applies)]]'))
    expect(links.map((a) => a.textContent)).toEqual(['the cloud', 'Data integrity (if GxP applies)'])
    expect(links[1].getAttribute('href')).toContain('path=standards%2FData+integrity.md')
  })

  it('keeps an escaped pipe inside a GFM table cell as one wikilink', () => {
    const md = '| Area | Standard |\n| --- | --- |\n| CI | [[CI-CD and supply chain\\|CI/CD and supply chain]] |\n| Cloud | [[Cloud]] |'
    const html = render(md)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const cells = Array.from(doc.querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td').length)
    expect(cells).toEqual([2, 2])
    const links = anchors(html)
    expect(links.map((a) => a.textContent)).toEqual(['CI/CD and supply chain', 'Cloud'])
    expect(links[0].getAttribute('href')).toContain('CI-CD+and+supply+chain.md')
  })

  it('handles headings, in-page anchors and embeds', () => {
    const html = render('# My Heading\n\n[[Cloud#Storage Tiers]] [[Cloud#Storage Tiers|tiers]] [[#My Heading]] ![[Cloud]]')
    const links = anchors(html)
    expect(links.map((a) => a.textContent)).toEqual(['Cloud > Storage Tiers', 'tiers', 'My Heading', 'Cloud'])
    expect(links[0].getAttribute('href')).toBe('/document-view?path=standards%2FCloud.md&title=Cloud+%3E+Storage+Tiers#storage-tiers')
    expect(links[2].getAttribute('href')).toBe('#user-content-my-heading')
    expect(links[3].getAttribute('href')).toBe('/document-view?path=standards%2FCloud.md&title=Cloud')
  })

  it('marks an unresolved wikilink', () => {
    const [a] = anchors(render('[[Company profile]]', 'standards/Data integrity.md'))
    expect(a.classList.contains('doc-link-unresolved')).toBe(true)
    expect(a.getAttribute('title')).toBe('Not found: Company profile')
    expect(a.getAttribute('href')).toBe('/document-view?path=standards%2FCompany+profile.md&title=Company+profile')
  })

  it('strips .html/.htm from a wikilink label', () => {
    const html = renderMarkdownToSafeHtml('[[report.html]] [[notes.htm]]', { docPath: 'a.md', index: ['report.html', 'notes.htm'] })
    expect(anchors(html).map((a) => a.textContent)).toEqual(['report', 'notes'])
  })

  it('falls back to the relative path without an index', () => {
    const html = renderMarkdownToSafeHtml('[[Cloud]]', { docPath: 'standards/x.md' })
    expect(anchors(html)[0].getAttribute('href')).toBe('/document-view?path=standards%2FCloud.md&title=Cloud')
  })

  it('does not touch wikilinks in code spans or blocks', () => {
    const html = render('`[[Cloud]]`\n\n```\n[[Cloud]]\n```')
    expect(anchors(html)).toHaveLength(0)
    expect(html).toContain('[[Cloud]]')
  })

  it('escapes hostile targets and still sanitizes everything else', () => {
    const html = render('[[x"><img src=x onerror=alert(1)>]] <img src=x onerror=alert(2)>')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('[onerror]')).toBeNull()
    expect(doc.querySelectorAll('img')).toHaveLength(1) // the raw <img>, with onerror stripped
    expect(doc.querySelector('a[data-wikilink]')?.textContent).toBe('x"><img src=x onerror=alert(1)>')
  })
})
