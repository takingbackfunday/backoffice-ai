'use client'

import { useEffect, useCallback } from 'react'

declare global {
  interface Window {
    TellerConnect?: {
      setup: (config: Record<string, unknown>) => { open: () => void }
    }
  }
}

interface TellerConnectProps {
  appId: string
  environment?: string
  enrollmentId?: string
  onSuccess: (enrollment: {
    accessToken: string
    enrollmentId: string
    institution: { name: string }
    accountId?: string
  }) => void
  onExit?: () => void
  onInit?: () => void
}

export function TellerConnectButton({
  appId,
  environment = 'sandbox',
  enrollmentId,
  onSuccess,
  onExit,
  onInit,
}: TellerConnectProps) {
  useEffect(() => {
    if (document.getElementById('teller-connect-script')) return
    const script = document.createElement('script')
    script.id = 'teller-connect-script'
    script.src = 'https://cdn.teller.io/connect/connect.js'
    document.body.appendChild(script)
    script.onload = () => onInit?.()
  }, [onInit])

  const openConnect = useCallback(() => {
    if (!window.TellerConnect) {
      console.error('TellerConnect not loaded')
      return
    }

    const config: Record<string, unknown> = {
      applicationId: appId,
      environment,
      onSuccess: (enrollment: Record<string, unknown>) => {
        onSuccess({
          accessToken: enrollment.accessToken as string,
          enrollmentId: (enrollment.enrollment as Record<string, string>)?.id ?? '',
          institution: (enrollment.enrollment as Record<string, Record<string, string>> | undefined)?.institution as { name: string } ?? { name: '' },
        })
      },
      onExit: () => onExit?.(),
    }

    if (enrollmentId) {
      config.enrollmentId = enrollmentId
    }

    const handler = window.TellerConnect.setup(config)
    handler.open()
  }, [appId, environment, enrollmentId, onSuccess, onExit])

  return (
    <button
      onClick={openConnect}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
    >
      Connect with Teller
    </button>
  )
}
