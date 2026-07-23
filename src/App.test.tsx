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
})
