import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SoftSelect } from '../components/SoftSelect'

describe('SoftSelect', () => {
  it('renders a themed combobox instead of a native select', () => {
    const html = renderToStaticMarkup(
      <SoftSelect
        value="Invoice"
        options={['Receipt', 'Invoice', 'E-invoice']}
        colorMode="Light"
        onChange={vi.fn()}
      />,
    )

    expect(html).toContain('role="combobox"')
    expect(html).toContain('Invoice')
    expect(html).not.toContain('<select')
  })
})
