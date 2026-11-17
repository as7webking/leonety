import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { createBodyScrollLockController } from '../hooks/use-body-scroll-lock.ts'

function createEnvironment() {
  const body = { style: { overflow: 'auto', position: 'relative', top: '3px', width: '90%', paddingRight: '2px' } }
  const documentElement = { clientWidth: 980 }
  const view = { innerWidth: 1000, scrollY: 240, scrollTo: (_x: number, y: number) => { view.scrollY = y } }
  return { body, documentElement, view }
}

test('overlapping overlays keep body scroll locked until the final owner releases', () => {
  const controller = createBodyScrollLockController()
  const environment = createEnvironment()
  const releaseModal = controller.acquire(environment.body, environment.documentElement, environment.view)
  const releaseAssistant = controller.acquire(environment.body, environment.documentElement, environment.view)

  assert.equal(environment.body.style.position, 'fixed')
  releaseModal()
  assert.equal(environment.body.style.position, 'fixed')
  assert.equal(environment.body.style.overflow, 'hidden')

  releaseAssistant()
  assert.deepEqual(environment.body.style, { overflow: 'auto', position: 'relative', top: '3px', width: '90%', paddingRight: '2px' })
  assert.equal(environment.view.scrollY, 240)
})

test('nested scroll-lock cleanup is safe when overlays close in the opposite order', () => {
  const controller = createBodyScrollLockController()
  const environment = createEnvironment()
  const releaseFirst = controller.acquire(environment.body, environment.documentElement, environment.view)
  const releaseSecond = controller.acquire(environment.body, environment.documentElement, environment.view)

  releaseSecond()
  assert.equal(environment.body.style.position, 'fixed')
  releaseFirst()
  releaseFirst()
  assert.equal(environment.body.style.position, 'relative')
})
