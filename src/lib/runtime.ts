import { transfer } from 'comlink'
import { XeusKernel } from './xeus-kernel'
import type { DatasetConfiguration, DatasetIndex, DatasetRow, InputFiles, PipelinePreset, ProcessEvent, ProgressHandler } from './contracts'
export type * from './contracts'

const JSON_MARKER = '__MOBGAP_RESULT__'
const STARTUP_TIMEOUT_MS = 5 * 60 * 1000
const filePaths = new WeakMap<File, string>()

/** A browser-local Xeus Python worker. No selected file is sent to a server. */
export class MobgapRuntime {
  private kernel?: XeusKernel
  private initialization?: Promise<void>
  private abort?: AbortController
  private pending = new Set<(error: Error) => void>()
  private busy = false
  private generation = 0
  private readonly assetRoot: URL

  constructor(assetRoot: URL) { this.assetRoot = assetRoot }

  get hasActiveKernel(): boolean { return Boolean(this.kernel && !this.kernel.isDisposed) }

  initialize(onProgress?: ProgressHandler): Promise<void> {
    if (this.initialization) return this.initialization
    const abort = new AbortController()
    this.abort = abort
    let failStartup!: (error: Error) => void
    const failure = new Promise<void>((_, reject) => { failStartup = reject })
    const timer = setTimeout(() => failStartup(new Error('Starting the analysis tools took too long. Please retry.')), STARTUP_TIMEOUT_MS)
    this.initialization = Promise.race([this.start(abort.signal, onProgress, failStartup), failure]).catch((error: unknown) => {
      if (this.abort === abort) this.cancel()
      throw error
    }).finally(() => clearTimeout(timer))
    return this.initialization
  }

  private async start(signal: AbortSignal, progress: ProgressHandler | undefined, failStartup: (error: Error) => void): Promise<void> {
    const generation = this.generation
    progress?.({ stage: 'loading', message: 'Starting analysis tools…' })
    const response = await fetch(new URL('xeus/mobgap-browser/xpython/kernel.json', this.assetRoot), { signal })
    if (!response.ok) throw new Error('Analysis tools are unavailable. Please prepare them again.')
    const kernelSpec = { ...await response.json(), name: 'xpython', envName: 'mobgap-browser' }
    signal.throwIfAborted()
    const manifestResponse = await fetch(new URL('worker-manifest.json', this.assetRoot), { signal, cache: 'no-cache' })
    if (!manifestResponse.ok) throw new Error('Analysis tools are unavailable. Please prepare them again.')
    const manifest = await manifestResponse.json() as { worker: string }
    signal.throwIfAborted()
    const worker = new Worker(new URL(manifest.worker, this.assetRoot), { name: 'mobgap-python' })
    const workerFailure = (event: Event) => {
      if (signal.aborted) return
      const detail = event.type === 'error' ? (event as ErrorEvent).message : 'A worker message could not be decoded.'
      console.error('Analysis worker failed:', detail)
      const error = new Error('The analysis tools stopped unexpectedly. Prepare them again to retry.')
      failStartup(error)
      for (const reject of this.pending) reject(error)
      this.cancel()
    }
    worker.addEventListener('error', workerFailure)
    worker.addEventListener('messageerror', workerFailure)
    const kernel = new XeusKernel(worker, (text) => console.debug(text.trim()))
    this.kernel = kernel
    await this.cancellable(kernel.remote.initialize({ baseUrl: this.assetRoot.href, kernelId: crypto.randomUUID(), kernelSpec, mountDrive: false, browsingContextId: '' }))
    signal.throwIfAborted()
    progress?.({ stage: 'loading', message: 'Starting analysis tools…' })
    const bundleResponse = await fetch(new URL('bootstrap.zip', this.assetRoot), { signal })
    if (!bundleResponse.ok) throw new Error('Analysis tools are unavailable. Please prepare them again.')
    const bundle = new Uint8Array(await bundleResponse.arrayBuffer())
    this.checkGeneration(generation)
    await this.cancellable(kernel.remote.writeBootstrap(transfer(bundle, [bundle.buffer])))
    signal.throwIfAborted()
    await this.execute(`import pathlib, sys, zipfile, json\nzipfile.ZipFile('/mobgap-app.zip').extractall('/mobgap-app')\npathlib.Path('/mobgap-app.zip').unlink()\nsys.path.insert(0, '/mobgap-app')\nimport mobgap_demo_api as api\nimport pyjs\npyjs.js.eval(pathlib.Path('/mobgap-app/workerfs.js').read_text())`)
    progress?.({ stage: 'ready', message: 'Analysis tools are ready.' })
  }

  private execute(code: string, onEvent?: (event: ProcessEvent) => void): Promise<string> {
    if (!this.kernel) return Promise.reject(new Error('Prepare the analysis tools before continuing.'))
    const generation = this.generation
    const future = this.kernel.requestExecute({ code, store_history: false })
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      let eventBuffer = ''
      let failure: string | undefined
      let fatalMemoryFailure = false
      const cancelled = (error: Error) => { future.dispose(); reject(error) }
      this.pending.add(cancelled)
      future.onIOPub = (message) => {
        if (message.header.msg_type === 'stream' && message.content.name === 'stdout') {
          const chunk = message.content.text ?? ''
          if (!onEvent) stdout += chunk
          eventBuffer += chunk
          let newline: number
          while ((newline = eventBuffer.indexOf('\n')) >= 0) {
            const line = eventBuffer.slice(0, newline)
            eventBuffer = eventBuffer.slice(newline + 1)
            if (line.startsWith('__MOBGAP_EVENT__')) {
              const event = JSON.parse(line.slice('__MOBGAP_EVENT__'.length)) as ProcessEvent
              onEvent?.(event)
            }
          }
        }
        if (message.header.msg_type === 'stream' && message.content.name === 'stderr') console.error(message.content.text)
        if (message.header.msg_type === 'error') {
          failure = message.content.evalue || message.content.traceback?.join('\n') || 'Python execution failed.'
          // Xeus reports class reprs; other kernels use the exception's name.
          const exceptionType = message.content.ename?.replace(/^<class '([^']+)'>$/, '$1').split('.').at(-1)
          fatalMemoryFailure ||= exceptionType === 'MemoryError' || exceptionType === '_ArrayMemoryError'
        }
      }
      void future.done.then(() => {
        this.pending.delete(cancelled)
        future.dispose()
        if (fatalMemoryFailure) {
          if (generation === this.generation) this.cancel()
          console.error(failure)
          reject(new Error('Not enough memory to process this recording. Try a shorter recording or calendar days.'))
        } else if (failure !== undefined) {
          console.error(failure)
          reject(new Error('Could not read this recording. Check the file format and participant details, then retry.'))
        }
        else resolve(stdout)
      }, (error: unknown) => {
        this.pending.delete(cancelled)
        future.dispose()
        reject(error)
        if (generation === this.generation) this.cancel()
      })
    })
  }

  private cancellable<T>(operation: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.pending.add(reject)
      void operation.then((value) => { this.pending.delete(reject); resolve(value) }, (error: unknown) => { this.pending.delete(reject); reject(error) })
    })
  }

  async loadIndex(files: InputFiles, configuration: DatasetConfiguration): Promise<DatasetIndex> {
    return this.withFiles(files, async (path, metadataPath) => {
      const output = await this.execute(`print(${JSON.stringify(JSON_MARKER)} + json.dumps(api.load_index(${JSON.stringify(path)}, ${metadataPath ? JSON.stringify(metadataPath) : 'None'}, json.loads(${JSON.stringify(JSON.stringify(configuration))})), allow_nan=False))`)
      const line = output.split('\n').find((line) => line.startsWith(JSON_MARKER))
      if (!line) throw new Error('Python completed without returning the dataset index.')
      return JSON.parse(line.slice(JSON_MARKER.length)) as DatasetIndex
    })
  }

  async process(files: InputFiles, configuration: DatasetConfiguration, selectedRows: DatasetRow[], preset: PipelinePreset, onEvent: (event: ProcessEvent) => void): Promise<void> {
    return this.withFiles(files, async (path, metadataPath) => {
      await this.execute(`api.process(${JSON.stringify(path)}, ${metadataPath ? JSON.stringify(metadataPath) : 'None'}, json.loads(${JSON.stringify(JSON.stringify(configuration))}), json.loads(${JSON.stringify(JSON.stringify(selectedRows))}), ${JSON.stringify(preset)})`, onEvent)
    })
  }

  private async withFiles<T>(files: InputFiles, action: (path: string, metadataPath?: string) => Promise<T>): Promise<T> {
    return this.exclusive(async (generation) => {
      this.requireActiveKernel(generation)
      const kernel = this.kernel!
      let folder = filePaths.get(files.recording)
      if (!folder) {
        folder = `/mobgap-input/${crypto.randomUUID()}`
        filePaths.set(files.recording, folder)
      }
      const paths = await this.cancellable(kernel.remote.mountFiles(files.recording, files.metadata, folder))
      this.checkGeneration(generation)
      try { return await action(paths.recording, paths.metadata) }
      finally { if (generation === this.generation) await this.cancellable(kernel.remote.unmountFiles()) }
    })
  }

  private requireActiveKernel(generation: number): void {
    this.checkGeneration(generation)
    if (!this.hasActiveKernel) throw new Error('The Python worker is no longer available. Prepare the analysis tools to retry.')
  }

  private checkGeneration(generation: number): void {
    if (generation !== this.generation) throw new Error('The operation was cancelled. Prepare the analysis tools to retry.')
  }

  private async exclusive<T>(action: (generation: number) => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Wait for the current operation or cancel it first.')
    this.busy = true
    const generation = this.generation
    try { return await action(generation) } finally { if (generation === this.generation) this.busy = false }
  }

  dispose(): void { this.cancel() }

  /** Cancelling destroys the worker and its loaded recordings; initialize to retry. */
  cancel(): void {
    this.generation++
    this.busy = false
    this.abort?.abort()
    this.abort = undefined
    for (const reject of this.pending) reject(new Error('The operation was cancelled. Prepare the analysis tools to retry.'))
    this.pending.clear()
    if (this.kernel) this.kernel.dispose()
    this.kernel = undefined
    this.initialization = undefined
  }
}
