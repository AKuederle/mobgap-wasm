// The loader follows jupyterlite/xeus 5.1.0's EmpackedXeusRemoteKernel.
// XeusRemoteKernelBase retains upstream kernel startup and async Python cleanup.
import { expose } from 'comlink'
import { XeusRemoteKernelBase } from '@jupyterlite/xeus-core/lib/worker.base'
import type { IXeusWorkerKernel } from '@jupyterlite/xeus-core/lib/interfaces'
import { bootstrapEmpackPackedEnvironment, bootstrapPython } from '@emscripten-forge/mambajs-core'
import type { IEmpackEnvMeta } from '@emscripten-forge/mambajs-core'
import { initUntarJS } from '@emscripten-forge/untarjs'
import unpackWasmName from '@emscripten-forge/untarjs/lib/unpack.wasm'

export interface DirectWorkerApi {
  initialize(options: IXeusWorkerKernel.IOptions): Promise<void>
  processMessage(event: unknown): Promise<void>
  writeBootstrap(bytes: Uint8Array): void
  mountFiles(recording: File, metadata: File | undefined, folder: string): { recording: string; metadata?: string }
  unmountFiles(): void
}

class MobgapXeusWorker extends XeusRemoteKernelBase implements DirectWorkerApi {
  private prefix = '/'
  private pythonVersion?: number[]
  get emscriptenMajorVersion(): number { return 4 }

  protected async initializeModule(options: IXeusWorkerKernel.IOptions) {
    const root = new URL(`xeus/${options.kernelSpec.envName}/`, options.baseUrl)
    const script = new URL(options.kernelSpec.argv[0], options.baseUrl)
    const scope = globalThis as typeof globalThis & { importScripts(...urls: string[]): void }
    scope.importScripts(script.href)
    return {
      locateFile: (name: string) => {
        if (name === 'libxeus.so') return new URL(name, root).href
        if (name.endsWith('.wasm')) return script.href.replace(/\.js$/, '.wasm')
        if (name.endsWith('.data')) return script.href.replace(/\.js$/, '.data')
        return new URL(name, root).href
      },
    }
  }

  protected async initializeFileSystem(options: IXeusWorkerKernel.IOptions) {
    const root = new URL(`xeus/${options.kernelSpec.envName}/`, options.baseUrl)
    const response = await fetch(new URL('empack_env_meta.json', root))
    if (!response.ok) throw new Error(`Runtime environment metadata could not be loaded (${response.status}).`)
    const empackEnvMeta = await response.json() as IEmpackEnvMeta
    this.prefix = empackEnvMeta.prefix
    const untarjs = await initUntarJS(() => new URL(unpackWasmName, options.baseUrl).href)
    const installed = await bootstrapEmpackPackedEnvironment({
      empackEnvMeta,
      pkgRootUrl: new URL('kernel_packages', root).href,
      Module: this.Module,
      logger: this.logger,
      untarjs,
    })
    this.pythonVersion = installed.pythonVersion
  }

  protected async initializeInterpreter() {
    if (!this.pythonVersion) throw new Error('Python is missing from the runtime environment.')
    await bootstrapPython({ prefix: this.prefix, pythonVersion: this.pythonVersion, Module: this.Module })
  }

  protected initializeStdin() {
    const scope = globalThis as typeof globalThis & { get_stdin: () => { error: string } }
    scope.get_stdin = () => ({ error: 'Interactive input is unavailable in this application.' })
  }

  // This is a fixed application environment, not an interactive package manager.
  protected override async processMagics(code: string) { return code }
  async mount(): Promise<void> { throw new Error('Use WORKERFS to mount selected files.') }
  protected async install(): Promise<void> { throw new Error('The runtime environment is fixed.') }
  protected async uninstall(): Promise<void> { throw new Error('The runtime environment is fixed.') }
  protected async listInstalledPackages(): Promise<void> { throw new Error('The runtime environment is fixed.') }

  writeBootstrap(bytes: Uint8Array) {
    this.Module.FS.writeFile('/mobgap-app.zip', bytes)
  }

  mountFiles(recording: File, metadata: File | undefined, folder: string) {
    this.unmountFiles()
    const fs = this.Module.FS
    const backend = (fs as unknown as { filesystems: { WORKERFS?: unknown } }).filesystems.WORKERFS
      ?? (globalThis as unknown as { WORKERFS: unknown }).WORKERFS
    fs.mkdirTree(folder)
    fs.mount(backend, { blobs: [
      { name: 'recording', data: recording },
      ...(metadata ? [{ name: 'metadata', data: metadata }] : []),
    ] }, folder)
    this.mountedFolder = folder
    return { recording: `${folder}/recording`, metadata: metadata ? `${folder}/metadata` : undefined }
  }

  private mountedFolder?: string
  unmountFiles() {
    if (!this.mountedFolder) return
    this.Module.FS.unmount(this.mountedFolder)
    this.Module.FS.rmdir(this.mountedFolder)
    this.mountedFolder = undefined
  }
}

expose(new MobgapXeusWorker())
