'use client'

import { PROPERTY_TYPE_LABELS } from '@/types'
import { Plus, Trash2 } from 'lucide-react'

interface UnitInput {
  unitLabel: string
  bedrooms: string
  bathrooms: string
  squareFootage: string
  monthlyRent: string
}

interface PropertyProfileData {
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  propertyType: string
  yearBuilt: string
  squareFootage: string
  lotSize: string
  purchasePrice: string
  purchaseDate: string
  currentValue: string
  mortgageBalance: string
  units: UnitInput[]
}

interface Props {
  data: PropertyProfileData
  onChange: (data: PropertyProfileData) => void
}

export function PropertyProfileForm({ data, onChange }: Props) {
  function set(key: keyof Omit<PropertyProfileData, 'units'>, value: string) {
    onChange({ ...data, [key]: value })
  }

  function addUnit() {
    onChange({
      ...data,
      units: [...data.units, { unitLabel: '', bedrooms: '', bathrooms: '', squareFootage: '', monthlyRent: '' }],
    })
  }

  function removeUnit(index: number) {
    onChange({ ...data, units: data.units.filter((_, i) => i !== index) })
  }

  function setUnit(index: number, key: keyof UnitInput, value: string) {
    const updated = data.units.map((u, i) => i === index ? { ...u, [key]: value } : u)
    onChange({ ...data, units: updated })
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-1">Address <span className="text-destructive">*</span></label>
        <input
          type="text"
          value={data.address}
          onChange={e => set('address', e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="123 Main St"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">City</label>
          <input
            type="text"
            value={data.city}
            onChange={e => set('city', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">State</label>
          <input
            type="text"
            value={data.state}
            onChange={e => set('state', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">ZIP</label>
          <input
            type="text"
            value={data.zipCode}
            onChange={e => set('zipCode', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Country</label>
          <select
            value={data.country}
            onChange={e => set('country', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Property type</label>
          <select
            value={data.propertyType}
            onChange={e => set('propertyType', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Year built</label>
          <input
            type="number"
            value={data.yearBuilt}
            onChange={e => set('yearBuilt', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="2000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Square footage</label>
          <input
            type="number"
            value={data.squareFootage}
            onChange={e => set('squareFootage', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="1200"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Lot size</label>
          <input
            type="text"
            value={data.lotSize}
            onChange={e => set('lotSize', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.25 acres"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Purchase price</label>
          <input
            type="number"
            value={data.purchasePrice}
            onChange={e => set('purchasePrice', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Purchase date</label>
          <input
            type="date"
            value={data.purchaseDate}
            onChange={e => set('purchaseDate', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Current value</label>
          <input
            type="number"
            value={data.currentValue}
            onChange={e => set('currentValue', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mortgage balance</label>
          <input
            type="number"
            value={data.mortgageBalance}
            onChange={e => set('mortgageBalance', e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
      </div>

      {/* Units */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Units <span className="text-xs font-normal text-muted-foreground">(optional)</span></h3>
          <button
            type="button"
            onClick={addUnit}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add unit
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          For a single house, leave this empty — a &quot;Main&quot; unit will be created automatically.
          For multi-unit properties (apartments, duplexes), add each unit here.
        </p>

        {data.units.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No units added — property will be treated as a single rental.</p>
        ) : (
          <div className="space-y-3">
            {data.units.map((unit, index) => (
              <div key={index} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Unit {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeUnit(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove unit"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Label <span className="text-destructive">*</span></label>
                    <input
                      type="text"
                      value={unit.unitLabel}
                      onChange={e => setUnit(index, 'unitLabel', e.target.value)}
                      className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Unit 1A"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Monthly rent</label>
                    <input
                      type="number"
                      value={unit.monthlyRent}
                      onChange={e => setUnit(index, 'monthlyRent', e.target.value)}
                      className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Beds</label>
                    <input
                      type="number"
                      value={unit.bedrooms}
                      onChange={e => setUnit(index, 'bedrooms', e.target.value)}
                      className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="2"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Baths</label>
                    <input
                      type="number"
                      value={unit.bathrooms}
                      onChange={e => setUnit(index, 'bathrooms', e.target.value)}
                      className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="1"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Sq ft</label>
                    <input
                      type="number"
                      value={unit.squareFootage}
                      onChange={e => setUnit(index, 'squareFootage', e.target.value)}
                      className="w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="800"
                      min="0"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
