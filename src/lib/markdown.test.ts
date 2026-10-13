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
