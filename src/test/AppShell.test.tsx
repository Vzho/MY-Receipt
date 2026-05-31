import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../components/AppShell'

describe('AppShell', () => {
  it('locks the app to the viewport so long queues scroll inside the main area', () => {
    const html = renderToStaticMarkup(
      <AppShell colorMode="Light">
        <div>content</div>
      </AppShell>,
    )

    expect(html).toContain('h-screen')
    expect(html).toContain('overflow-hidden')
    expect(html).not.toContain('min-h-screen')
  })
})
