'use client'

import { BILLING_TYPE_LABELS } from '@/types'

interface ClientProfileData {
  contactName: string
  email: string
  phone: string
  company: string
  address: string
  billingType: string
  defaultRate: string
  currency: string
  paymentTermDays: string
}

interface Props {
  data: ClientProfileData
  onChange: (data: ClientProfileData) => void
}

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD']

export function ClientProfileForm({ data, onChange }: Props) {
  function set(key: keyof ClientProfileData, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Contact name</label>
          <input
            type="text"
            value={data.contactName}
            onChange={e => set('contactName', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Company</label>
          <input
            type="text"
            value={data.company}
            onChange={e => set('company', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Acme Corp"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={data.email}
            onChange={e => set('email', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="jane@acme.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input
            type="tel"
            value={data.phone}
            onChange={e => set('phone', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="+1 555 000 0000"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Address</label>
        <input
          type="text"
          value={data.address}
          onChange={e => set('address', e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="123 Main St, City, State"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Billing type</label>
          <select
            value={data.billingType}
            onChange={e => set('billingType', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Default rate</label>
          <input
            type="number"
            value={data.defaultRate}
            onChange={e => set('defaultRate', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Currency</label>
          <select
            value={data.currency}
            onChange={e => set('currency', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Payment terms (days)</label>
        <input
          type="number"
          value={data.paymentTermDays}
          onChange={e => set('paymentTermDays', e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="30"
          min="0"
        />
      </div>
    </div>
  )
}
