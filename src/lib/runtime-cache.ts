import type { ProgressHandler } from './contracts'
import manifest from '../../runtime/build/runtime-manifest.json'

export interface RuntimeManifest { version: string; assets: { path: string; size: number; sha256: string }[] }
const root = () => new URL('runtime/', new URL(import.meta.env.BASE_URL, document.baseURI))
const cacheName = (manifest: RuntimeManifest) => `mobgap-runtime-${manifest.version}`
const completeKey = (manifest: RuntimeManifest) => new URL(`.complete-${manifest.version}`, root()).href

export async function runtimeManifest(signal?: AbortSignal): Promise<RuntimeManifest> {
  signal?.throwIfAborted()
  return manifest as RuntimeManifest
}

export async function hasCachedRuntime(manifest: RuntimeManifest): Promise<boolean> {
  const cache = await caches.open(cacheName(manifest))
  if (!await cache.match(completeKey(manifest))) return false
  for (const asset of manifest.assets) {
    if (!await cache.match(new URL(asset.path, root()))) return false
  }
  return true
}

export async function downloadRuntime(manifest: RuntimeManifest, signal: AbortSignal, progress: ProgressHandler): Promise<void> {
  const cache = await caches.open(cacheName(manifest))
  await cache.delete(completeKey(manifest))
  const total = manifest.assets.reduce((sum, asset) => sum + asset.size, 0)
  let downloaded = 0
  // Download one archive at a time to bound peak memory during hashing and caching.
  for (const asset of manifest.assets) {
    signal.throwIfAborted()
    const url = new URL(asset.path, root())
    // The version query prevents stale HTTP responses after a deployment.
    url.searchParams.set('download', manifest.version)
    const response = await fetch(url, { signal, cache: 'no-cache' })
    if (!response.ok) throw new Error(`Could not download Python assets (${response.status}). Please retry.`)
    const bytes = await response.arrayBuffer()
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    if (bytes.byteLength !== asset.size || digest !== asset.sha256) throw new Error('A Python download was incomplete. Please retry.')
    await cache.put(new URL(asset.path, root()), new Response(bytes, { headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream' } }))
    downloaded += asset.size
    progress({ stage: 'downloading', message: 'Downloading analysis tools…', percent: total ? downloaded / total * 100 : 100 })
  }
  signal.throwIfAborted()
  await cache.put(completeKey(manifest), new Response('complete'))
}

export async function activateRuntimeCache(manifest: RuntimeManifest): Promise<URL> {
  if (!('serviceWorker' in navigator)) throw new Error('This browser cannot cache analysis tools. Enable service workers or use another browser.')
  const base = new URL(import.meta.env.BASE_URL, document.baseURI)
  const registration = await navigator.serviceWorker.register(new URL('runtime-sw.js', base), { scope: base.pathname, updateViaCache: 'none' })
  const worker = registration.installing ?? registration.waiting
  if (worker && worker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') resolve()
        if (worker.state === 'redundant') reject(new Error('Could not activate the analysis cache. Please retry.'))
      })
    })
  }
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    })
  }
  // Versioned URLs bind every lazy worker dependency to this runtime's cache.
  return new URL(`runtime-cached/${manifest.version}/`, base)
}
