/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import { wait } from '../__fixtures__/wait.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/wait.js', () => ({ wait }))
// Mock the legacy Project Board Sync core the façade imports
const projectSync = { main: jest.fn() }
jest.unstable_mockModule(
  '../packages/project-board-sync/project-board-sync/src/index.js',
  () => projectSync
)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation(() => '500')

    // Mock the wait function so that it does not actually wait.
    wait.mockImplementation(() => Promise.resolve('done!'))
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Invokes legacy Project Board Sync main()', async () => {
    projectSync.main.mockResolvedValueOnce(undefined)
    await run()
    expect(projectSync.main).toHaveBeenCalledTimes(1)
  })

  it('Sets failed status when legacy core errors', async () => {
    projectSync.main.mockRejectedValueOnce(new Error('boom'))
    await run()
    expect(core.setFailed).toHaveBeenNthCalledWith(1, 'boom')
  })
})
