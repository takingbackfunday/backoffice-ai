import { NextResponse } from 'next/server'

export interface ApiResponse<T = unknown> {
  data: T | null
  error: string | null
  meta?: Record<string, unknown>
}

export function ok<T>(data: T, meta?: Record<string, unknown>): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null, ...(meta ? { meta } : {}) }, { status: 200 })
}

export function created<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status: 201 })
}

export function badRequest(message: string): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ data: null, error: message }, { status: 400 })
}

export function unauthorized(message = 'Unauthorized'): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ data: null, error: message }, { status: 401 })
}

export function notFound(message = 'Resource not found'): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ data: null, error: message }, { status: 404 })
}

export function serverError(message = 'An unexpected error occurred. Please try again.'): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ data: null, error: message }, { status: 500 })
}
