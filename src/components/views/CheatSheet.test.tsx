import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CHEAT_ELEMENTS, CHEAT_VIEWS } from '@/lib/cheatSheet'
import CheatSheet from './CheatSheet'

function renderPage() {
  return render(
    <MemoryRouter>
      <CheatSheet />
    </MemoryRouter>,
  )
}

describe('CheatSheet', () => {
  it('renders the main landmark and all section headings', () => {
    renderPage()
    expect(screen.getByRole('main', { name: 'C4 cheat sheet' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'C4 cheat sheet' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'The C4 hierarchy' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Elements' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Views' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Element × view matrix' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'What is it?' })).toBeTruthy()
  })

  it('renders one article per element and per view', () => {
    renderPage()
    const articles = screen.getAllByRole('article')
    expect(articles).toHaveLength(CHEAT_ELEMENTS.length + CHEAT_VIEWS.length)
    expect(screen.getByRole('heading', { level: 3, name: 'Person' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'System Landscape' })).toBeTruthy()
  })

  it('badges exactly the three unsupported views', () => {
    renderPage()
    const unsupported = CHEAT_VIEWS.filter((v) => !v.supportedInC4hero)
    expect(unsupported).toHaveLength(3)
    expect(screen.getAllByText('Not supported in c4hero yet')).toHaveLength(3)
  })

  it('shows a known decision-guide row', () => {
    renderPage()
    expect(screen.getByText('PostgreSQL database')).toBeTruthy()
    expect(screen.getByText(/separately running, deployable datastore/)).toBeTruthy()
  })

  it('sets the document title', () => {
    renderPage()
    expect(document.title).toBe('C4 cheat sheet — c4hero')
  })
})
