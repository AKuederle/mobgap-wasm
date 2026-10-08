/** Browser/Python bridge types. Tables include index columns in their rows. */
export type PipelinePreset = 'healthy' | 'impaired' | 'auto'
export type ProgressHandler = (progress: RuntimeProgress) => void
export interface RuntimeProgress { stage: string; message: string; percent?: number }
export interface InputFiles { recording: File; metadata?: File }
export interface DatasetConfiguration {
  format: 'mat' | 'cwa'
  cohort: string
  participantHeightM?: number
  sensorHeightM?: number
  measurementCondition: 'laboratory' | 'free_living'
  timezone?: string
  split: 'auto' | 'days' | 'file'
}
export interface DatasetRow { id: string; index: Record<string, string>; label: string }
export interface DatasetIndex { rows: DatasetRow[]; split: 'days' | 'file' }
export interface ProcessEvent {
  rowId: string
  status: 'running' | 'complete' | 'error'
  result?: AnalysisResult
  message?: string
}
export type CellValue = string | number | boolean | null
export interface DataTable { columns: string[]; rows: CellValue[][] }
export interface AnalysisResult {
  recordingId: string
  preset: PipelinePreset
  summary: {
    samples: number; durationSeconds: number; samplingRateHz: number
    gaitSequences: number; initialContacts: number; walkingBouts: number; strides: number
    processingSeconds: number
  }
  tables: Record<string, DataTable>
}
