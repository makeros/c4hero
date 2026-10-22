import { describe, expect, it } from 'vitest'

import { extractCssUrls, extractHtmlReferences, rewriteHtmlDocLinks } from './htmlDocLinks'

describe('extractHtmlReferences', () => {
  it('collects D4 subresources and D7 markdown hrefs, skipping data/blob/scheme/fragment URLs', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="styles/r.css">
          <script src="app.js"></script>
          <style>
            body { background: url(f.woff2); }
            @import "x.css";
          </style>
        </head>
        <body>
          <img srcset="a.png 1x, b.png 2x">
          <video poster="poster.png"></video>
          <img src="data:image/png;base64,xyz">
          <script src="https://cdn.example.com/lib.js"></script>
          <a href="#top">Top</a>
          <a href="n.md">N</a>
        </body>
      </html>
    `
    const { subresources, docHrefs } = extractHtmlReferences(html)
    expect([...subresources].sort()).toEqual(
      ['styles/r.css', 'app.js', 'f.woff2', 'x.css', 'a.png', 'b.png', 'poster.png'].sort(),
    )
    expect(docHrefs).toEqual(['n.md'])
  })

  it('collects assets from a style="" attribute', () => {
    const html = '<div style="background: url(bg.png)"></div>'
    expect(extractHtmlReferences(html).subresources).toEqual(['bg.png'])
  })

  it('ignores an <a href> to another .html page and to an external .md', () => {
    const html = '<a href="other.html">O</a><a href="https://example.com/n.md">E</a>'
    expect(extractHtmlReferences(html).docHrefs).toEqual([])
  })

  it('treats .markdown the same as .md', () => {
    const html = '<a href="n.markdown">N</a>'
    expect(extractHtmlReferences(html).docHrefs).toEqual(['n.markdown'])
  })

  it('m1b: does not split a data: srcset candidate on its own internal commas', () => {
    const html = '<img srcset="a.png 1x, data:image/png;base64,AA,BB 2x">'
    expect(extractHtmlReferences(html).subresources).toEqual(['a.png'])
  })
})

describe('extractCssUrls', () => {
  it('finds url(...) in single, double and unquoted form', () => {
    expect(extractCssUrls('a{background:url("x.png")} b{background:url(\'y.png\')} c{background:url(z.png)}')).toEqual([
      'x.png',
      'y.png',
      'z.png',
    ])
  })

  it('finds @import in quoted and url(...) form', () => {
    expect(extractCssUrls('@import "a.css"; @import url(b.css);')).toEqual(['a.css', 'b.css'])
  })
})

describe('rewriteHtmlDocLinks', () => {
  it('rewrites an <a href> ending in .md to the /document-view shape with target=_top, byte-identical elsewhere', () => {
    const html =
      '<!doctype html><html><body><p>Intro</p><a href="../n.md#h">N</a><a href="other.html">O</a><footer>End</footer></body></html>'
    const expected =
      '<!doctype html><html><body><p>Intro</p>' +
      '<a href="/document-view?path=n.md&title=N#h" target="_top">N</a>' +
      '<a href="other.html">O</a><footer>End</footer></body></html>'
    expect(rewriteHtmlDocLinks(html, 'docs/r.html')).toBe(expected)
  })

  it('leaves a document with no markdown links byte-identical', () => {
    const html = '<!doctype html><html><body><a href="other.html">O</a><img src="a.png"></body></html>'
    expect(rewriteHtmlDocLinks(html, 'docs/r.html')).toBe(html)
  })

  it('falls back to the file name as title when the anchor has no text', () => {
    const html = '<a href="n.md"></a>'
    expect(rewriteHtmlDocLinks(html, 'a.html')).toBe('<a href="/document-view?path=n.md&title=n.md" target="_top"></a>')
  })

  it('replaces an existing target attribute instead of duplicating it', () => {
    const html = '<a href="n.md" target="_blank">N</a>'
    expect(rewriteHtmlDocLinks(html, 'a.html')).toBe('<a href="/document-view?path=n.md&title=N" target="_top">N</a>')
  })
})
