import type { QueryClient } from '@tanstack/react-query'
import type { RuntimeProgress } from './contracts'
import { MobgapRuntime } from './runtime'
import { downloadRuntime, hasCachedRuntime, runtimeManifest, activateRuntimeCache } from './runtime-cache'

export const runtimeStateKey = ['runtime-state'] as const
const runtimeKey = ['runtime'] as const
export interface RuntimeState {
  status: 'idle' | 'preparing' | 'starting' | 'ready' | 'error'
  progress?: RuntimeProgress
  error?: string
}
const preloaded = new WeakSet<QueryClient>()
const preloadAborts = new WeakMap<QueryClient, AbortController>()
const tasks = new WeakMap<QueryClient, { promise: Promise<MobgapRuntime>; abort: AbortController; runtime?: MobgapRuntime }>()

export function getRuntime(client: QueryClient): MobgapRuntime | undefined {
  const runtime = client.getQueryData<MobgapRuntime>(runtimeKey)
  return runtime?.hasActiveKernel ? runtime : undefined
}

function initialize(client: QueryClient, download: boolean): Promise<MobgapRuntime> {
  const active = getRuntime(client)
  if (active) return Promise.resolve(active)
  const existing = tasks.get(client)
  if (existing) return existing.promise
  client.removeQueries({ queryKey: runtimeKey, exact: true })
  const abort = new AbortController()
  const task = { abort, promise: Promise.resolve(null as unknown as MobgapRuntime), runtime: undefined as MobgapRuntime | undefined }
  const state = (value: RuntimeState) => client.setQueryData(runtimeStateKey, value)
  task.promise = client.fetchQuery({
    queryKey: runtimeKey, staleTime: Infinity, gcTime: Infinity, retry: false, structuralSharing: false,
    queryFn: async () => {
      const manifest = await runtimeManifest(abort.signal)
      const cached = await hasCachedRuntime(manifest)
      abort.signal.throwIfAborted()
      if (!cached && !download) throw new Error('Python needs preparation.')
      if (!cached) {
        state({ status: 'preparing' })
        await downloadRuntime(manifest, abort.signal, (progress) => state({ status: 'preparing', progress }))
      }
      state({ status: 'starting' })
      const assetRoot = await activateRuntimeCache(manifest)
      abort.signal.throwIfAborted()
      const runtime = new MobgapRuntime(assetRoot)
      task.runtime = runtime
      await runtime.initialize((progress) => state({ status: 'starting', progress }))
      abort.signal.throwIfAborted()
      return runtime
    },
  }).then((runtime) => {
    abort.signal.throwIfAborted()
    state({ status: 'ready' })
    return runtime
  }).catch((error: unknown) => {
    console.error(error)
    task.runtime?.dispose()
    if (!abort.signal.aborted) state({ status: 'error', error: 'Could not prepare the analysis tools. Please retry.' })
    throw error
  }).finally(() => { if (tasks.get(client) === task) tasks.delete(client) })
  tasks.set(client, task)
  return task.promise
}

export async function preloadCachedRuntime(client: QueryClient): Promise<void> {
  if (preloaded.has(client)) return
  preloaded.add(client)
  if (getRuntime(client) || tasks.has(client)) return
  const abort = new AbortController()
  preloadAborts.set(client, abort)
  try {
    const manifest = await runtimeManifest(abort.signal)
    const cached = await hasCachedRuntime(manifest)
    abort.signal.throwIfAborted()
    if (cached) await initialize(client, false)
  } catch (error) {
    // Initialization publishes its own error state; cancellation must stay idle.
    if (!abort.signal.aborted) console.error(error)
  } finally {
    preloadAborts.delete(client)
  }
}

export function prepareRuntime(client: QueryClient): Promise<MobgapRuntime> { return initialize(client, true) }

export function cancelRuntime(client: QueryClient): void {
  preloadAborts.get(client)?.abort()
  const task = tasks.get(client)
  task?.abort.abort()
  task?.runtime?.dispose()
  getRuntime(client)?.dispose()
  tasks.delete(client)
  void client.cancelQueries({ queryKey: runtimeKey })
  client.removeQueries({ queryKey: runtimeKey })
  client.setQueryData<RuntimeState>(runtimeStateKey, { status: 'idle' })
}
