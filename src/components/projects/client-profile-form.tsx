'use client'

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
    </div>
  )
}
