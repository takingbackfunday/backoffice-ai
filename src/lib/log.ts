type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    level,
    component,
    message,
    ts: new Date().toISOString(),
  }
  if (data) Object.assign(entry, data)
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify(entry))
}

export const logger = {
  debug: (component: string, message: string, data?: Record<string, unknown>) => log('debug', component, message, data),
  info: (component: string, message: string, data?: Record<string, unknown>) => log('info', component, message, data),
  warn: (component: string, message: string, data?: Record<string, unknown>) => log('warn', component, message, data),
  error: (component: string, message: string, data?: Record<string, unknown>) => log('error', component, message, data),
}
