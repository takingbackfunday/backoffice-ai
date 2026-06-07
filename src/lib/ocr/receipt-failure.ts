export type ReceiptPipelineStage = 'ocr' | 'thumbnail' | 'extract'

export interface ReceiptFailureInfo {
  stage: ReceiptPipelineStage
  code: 'MISSING_CONFIG' | 'PROVIDER_QUOTA' | 'PROVIDER_AUTH' | 'PROVIDER_RATE_LIMIT' | 'PROVIDER_ERROR' | 'IMAGE_PROCESSING' | 'UNKNOWN'
  message: string
  retryable: boolean
  occurredAt: string
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export function classifyReceiptPipelineError(
  stage: ReceiptPipelineStage,
  err: unknown
): ReceiptFailureInfo {
  const text = errorText(err)
  const lower = text.toLowerCase()

  if (/api_key|api key|is not set|undefined/.test(lower)) {
    return {
      stage,
      code: 'MISSING_CONFIG',
      message: 'Receipt processing is not configured correctly. A required provider API key is missing.',
      retryable: false,
      occurredAt: new Date().toISOString(),
    }
  }

  if (/key limit exceeded|quota|credit|billing|insufficient/.test(lower)) {
    return {
      stage,
      code: 'PROVIDER_QUOTA',
      message: 'The AI extraction provider is out of credits or has reached its configured spending limit.',
      retryable: true,
      occurredAt: new Date().toISOString(),
    }
  }

  if (/\b401\b|\b403\b|unauthorized|forbidden|invalid api key|invalid key/.test(lower)) {
    return {
      stage,
      code: 'PROVIDER_AUTH',
      message: 'The receipt processing provider rejected the configured API key.',
      retryable: false,
      occurredAt: new Date().toISOString(),
    }
  }

  if (/\b429\b|rate limit|too many requests/.test(lower)) {
    return {
      stage,
      code: 'PROVIDER_RATE_LIMIT',
      message: 'The receipt processing provider is rate limiting requests. Try again shortly.',
      retryable: true,
      occurredAt: new Date().toISOString(),
    }
  }

  if (/mistral|openrouter|claude|provider|\b5\d\d\b|timed out|timeout|fetch failed/.test(lower)) {
    return {
      stage,
      code: 'PROVIDER_ERROR',
      message: 'A receipt processing provider failed while handling this image. Try again shortly.',
      retryable: true,
      occurredAt: new Date().toISOString(),
    }
  }

  if (stage === 'thumbnail' || /sharp|image|input buffer|unsupported image/.test(lower)) {
    return {
      stage,
      code: 'IMAGE_PROCESSING',
      message: 'The receipt image could not be processed. Try another screenshot or photo format.',
      retryable: false,
      occurredAt: new Date().toISOString(),
    }
  }

  return {
    stage,
    code: 'UNKNOWN',
    message: 'Receipt processing failed unexpectedly. The receipt was saved for review.',
    retryable: true,
    occurredAt: new Date().toISOString(),
  }
}

export function receiptFailureResponseMessage(failure: ReceiptFailureInfo) {
  return `${failure.message} The receipt was saved${failure.retryable ? ' and can be retried after the issue is fixed.' : '.'}`
}
