import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('planner', () => {
  it('opens a course modal and saves Taken progress', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /CST 231/i })[0])
    expect(screen.getByRole('dialog')).toHaveTextContent('Problem Solving/Programming')
    fireEvent.click(screen.getByRole('button', { name: /mark as taken/i }))
    expect(localStorage.getItem('courseguide-completed-v1')).toContain('course:CST-231')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resets saved progress after confirmation', () => {
    localStorage.setItem('courseguide-completed-v1', '["course:CST-231"]')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /reset progress/i }))
    expect(localStorage.getItem('courseguide-completed-v1')).toBe('[]')
  })

  it('shows the early GE requirement as a suggested course', () => {
    render(<App />)
    const geArea1 = screen.getByRole('button', { name: /GE Area 1 Lower Division/i })
    expect(geArea1).toHaveClass('is-suggested', 'is-standard')
  })

  it('marks a general-education requirement as taken', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /GE Area 1 Lower Division/i }))
    fireEvent.click(screen.getByRole('button', { name: /mark as taken/i }))

    expect(localStorage.getItem('courseguide-completed-v1')).toContain('slot:ge-1-lower-division')
  })

  it('shows the planned-credit breakdown', () => {
    render(<App />)

    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('102 planned credits')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('72 major/core')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('21 lower-division GE')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('9 upper-division GE')
  })

  it('fills elective slots when a concentration is selected', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Science' }))

    expect(screen.getByRole('button', { name: /CST 383/i })).toHaveTextContent('Path course')
    const electiveOption = screen.getAllByRole('button', { name: /Concentration elective option/i })[0]
    fireEvent.click(electiveOption)
    expect(screen.getByRole('dialog')).toHaveTextContent('CST 438')
    expect(screen.queryByRole('button', { name: /mark as taken/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset path/i })).not.toBeInTheDocument()
  })

  it('selects a target course and removes it from other elective choices', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Science' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Concentration elective option/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0])

    expect(localStorage.getItem('courseguide-target-courses-v1')).toContain('CST-205')
    expect(screen.getByRole('button', { name: /CST 205/i })).toHaveTextContent('Selected course')
    fireEvent.click(screen.getAllByRole('button', { name: /Concentration elective option/i })[0])
    expect(screen.getByRole('dialog')).not.toHaveTextContent('CST 205')
  })

  it('clears an individual selected target course', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Science' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Concentration elective option/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0])
    fireEvent.click(screen.getByRole('button', { name: /CST 205/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear selected course/i }))

    expect(localStorage.getItem('courseguide-target-courses-v1')).toBe('{}')
    expect(screen.getAllByRole('button', { name: /Concentration elective option/i })).not.toHaveLength(0)
  })

  it('resets all selected target courses after confirmation', () => {
    localStorage.setItem('courseguide-target-courses-v1', '{"data-science:slot:junior-spring-elective":"CST-205"}')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /reset course choices/i }))

    expect(localStorage.getItem('courseguide-target-courses-v1')).toBe('{}')
  })

  it('switches to the registration planner view', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /registration planner/i }))

    expect(await screen.findByLabelText('Registration planner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /classes to sign up for/i })).toBeInTheDocument()
  })
})
