export interface PlaybookStep {
  action: 'goto' | 'fill' | 'click' | 'wait' | 'select' | 'download'
  selector?: string
  value?: string
  url?: string
  description: string
  waitMs?: number
  isCredentialField?: 'username' | 'password'
}

export interface PageElement {
  index: number
  tag: string
  type?: string
  text: string
  placeholder?: string
  selector: string
  href?: string
  isVisible: boolean
}

export interface SyncJobEvent {
  type: 'status' | 'twofa_required' | 'progress' | 'complete' | 'error'
  message?: string
  jobId?: string
  liveUrl?: string
  imported?: number
  skipped?: number
  error?: string
}