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

  it('resets all saved planner state after confirmation', () => {
    localStorage.setItem('courseguide-completed-v1', '["course:CST-231"]')
    localStorage.setItem('courseguide-transfer-preparation-v1', '{"2026/ast-to-bs":["MATH-130"]}')
    localStorage.setItem('courseguide-additional-courses-v1', '{"2026/bs/roadmap/freshman-fall":[{"id":"extra-1","code":"ART 200","credits":3}]}')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /reset planner/i }))
    expect(localStorage.getItem('courseguide-completed-v1')).toBe('[]')
    expect(localStorage.getItem('courseguide-transfer-preparation-v1')).toBe('{}')
    expect(localStorage.getItem('courseguide-additional-courses-v1')).toBe('{}')
  })

  it('shows FYS 145 as the early GE course', () => {
    render(<App />)
    const fys145 = screen.getByRole('button', { name: /FYS 145/i })
    expect(fys145).toHaveClass('is-suggested', 'is-standard')
  })

  it('uses MATH 150 direct placement to remove the freshman-spring MATH 150 block', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /MATH 130 or MATH 150/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    expect(screen.getByRole('button', { name: /MATH 130 or MATH 150/i })).toHaveTextContent('MATH 150')
    expect(screen.queryAllByRole('button', { name: /^MATH 150$/i })).toHaveLength(0)
    expect(localStorage.getItem('courseguide-target-courses-v1')).toContain('freshman-math-placement-choice')

    fireEvent.click(screen.getByRole('button', { name: /MATH 130 or MATH 150/i }))
    expect(screen.getByRole('button', { name: /check math 130 readiness/i })).toBeInTheDocument()
  })

  it('offers the MATH 130 readiness self-evaluation from the math-placement choice', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /MATH 130 or MATH 150/i }))

    expect(screen.getByRole('button', { name: /check math 130 readiness/i })).toBeInTheDocument()
  })

  it('marks FYS 145 as taken', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /FYS 145/i }))
    fireEvent.click(screen.getByRole('button', { name: /mark as taken/i }))

    expect(localStorage.getItem('courseguide-completed-v1')).toContain('course:FYS-145')
  })

  it('shows the planned-credit breakdown', () => {
    render(<App />)

    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('104 of 120 credits tracked')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('16 additional credits needed')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('104 degree-plan credits')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('77 major/core')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('18 lower-division GE')
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

  it('selects the Computer Science minor and exposes its required course choices', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Minor'), { target: { value: 'computer-science' } })

    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('Computer Science minor: 16 required credits')
    expect(screen.getAllByRole('button', { name: /Computer Science minor course option/i })).toHaveLength(2)
    expect(localStorage.getItem('courseguide-minor-v1')).toBe('"computer-science"')
  })

  it('visually identifies courses offered in just one term', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Science' }))

    expect(screen.getByRole('button', { name: /CST 463/i })).toHaveClass('is-limited-offering')
    expect(screen.getByText('Limited-term offering')).toBeInTheDocument()
  })

  it('selects a target course and removes it from other elective choices', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Science' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Concentration elective option/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0])

    expect(localStorage.getItem('courseguide-target-courses-v1')).toContain('CST-205')
    expect(screen.getByRole('dialog')).toHaveTextContent('CST 205')
    expect(screen.getByRole('button', { name: /mark as taken/i })).toBeInTheDocument()
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

  it('records both the chosen course and its requirement slot when completed', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Data Science' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Concentration elective option/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0])
    fireEvent.click(screen.getByRole('button', { name: /CST 205/i }))
    fireEvent.click(screen.getByRole('button', { name: /mark as taken/i }))

    expect(localStorage.getItem('courseguide-completed-v1')).toContain('course:CST-205')
    expect(localStorage.getItem('courseguide-completed-v1')).toContain('slot:junior-spring-elective')
  })

  it('resets all selected target courses after confirmation', () => {
    localStorage.setItem('courseguide-target-courses-v1', '{"data-science:slot:junior-spring-elective":"CST-205"}')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /reset planner/i }))

    expect(localStorage.getItem('courseguide-target-courses-v1')).toBe('{}')
  })

  it('automatically selects the paired CST choice in the other term', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'CST 334 or CST 370: CST 334 or CST 370' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0])

    expect(screen.getAllByRole('button', { name: 'CST 334 or CST 370: CST 334 or CST 370' })).toHaveLength(2)
    expect(screen.getAllByText('Selected course')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'CST 334 or CST 370: CST 334 or CST 370' })[0]).toHaveTextContent('CST 334')
    expect(screen.getAllByRole('button', { name: 'CST 334 or CST 370: CST 334 or CST 370' })[1]).toHaveTextContent('CST 370')
  })

  it('switches to the registration planner view', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /registration planner/i }))

    expect(await screen.findByLabelText('Registration planner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /classes to sign up for/i })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Open CST 231'))
    expect(screen.getByRole('dialog')).toHaveTextContent('Problem Solving/Programming')
  })

  it('shows compacted scheduling controls and sequential year labels', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Compacted' }))

    expect(screen.getByLabelText('Compacted schedule settings')).toBeInTheDocument()
    expect(screen.getByLabelText(/maximum credits per term/i)).toHaveValue('15')
    expect(screen.getByRole('rowheader', { name: '1st year' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/maximum credits per term/i), { target: { value: '12' } })
    expect(screen.getByLabelText(/maximum credits per term/i)).toHaveValue('12')
  })

  it('tracks extra coursework toward the 120-credit goal', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /extra coursework/i })[0])
    fireEvent.change(screen.getByLabelText('Course code'), { target: { value: 'ART 200' } })
    fireEvent.change(screen.getByLabelText('Course name (optional)'), { target: { value: 'Introduction to Art' } })
    fireEvent.change(screen.getByLabelText('Credits'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add coursework' }))

    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('107 of 120 credits tracked')
    expect(screen.getByLabelText('Curriculum credit summary')).toHaveTextContent('13 additional credits needed')
    expect(screen.getAllByText('ART 200')).not.toHaveLength(0)
    expect(localStorage.getItem('courseguide-additional-courses-v1')).toContain('ART 200')
  })

  it('marks catalog-derived programs as Alpha and displays the stronger warning', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Major'), { target: { value: 'bs-biology' } })

    expect(screen.getByLabelText('Major')).toHaveDisplayValue('Biology, B.S. (Alpha)')
    expect(screen.getByText(/biology, b\.s\. · alpha/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Derived roadmap notice')).toHaveTextContent('Alpha planning estimate — not department-verified')
    expect(document.querySelector('.planner')).toHaveClass('is-alpha-roadmap')
  })

  it('sorts verified majors first and Alpha majors by program name without degree prefixes', () => {
    render(<App />)
    const labels = Array.from((screen.getByLabelText('Major') as HTMLSelectElement).options).map(option => option.text)
    const firstAlpha = labels.findIndex(label => label.endsWith('(Alpha)'))
    const alphaLabels = labels.slice(firstAlpha)

    expect(firstAlpha).toBeGreaterThan(0)
    expect(labels).toContain('Computer Science, B.S.')
    expect(labels).toContain('Accounting, B.S. (Alpha)')
    expect(labels.slice(0, firstAlpha).every(label => !label.endsWith('(Alpha)'))).toBe(true)
    expect(alphaLabels).toEqual([...alphaLabels].sort((left, right) =>
      left.replace(/, B\.[AS]\. \(Alpha\)$/i, '').localeCompare(right.replace(/, B\.[AS]\. \(Alpha\)$/i, ''))))
  })

  it('adds variable-credit coursework to a derived program requirement', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Major'), { target: { value: 'ba-cinematic-arts-and-technology' } })
    fireEvent.click(screen.getByRole('button', { name: /complete 4 units from the following lower division research/i }))

    expect(screen.getByText('0 of 4 required credits selected.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add course' }))

    expect(screen.getByText('1 of 4 required credits selected.')).toBeInTheDocument()
    expect(localStorage.getItem('courseguide-requirement-courses-v1')).toContain('CART-205')
  })
})
