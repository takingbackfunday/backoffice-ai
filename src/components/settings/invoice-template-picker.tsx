import type { InvoiceTemplateId } from '@/lib/pdf/invoice-templates'
import { INVOICE_TEMPLATES } from '@/lib/pdf/invoice-templates'

interface Props {
  value: InvoiceTemplateId
  onChange: (v: InvoiceTemplateId) => void
  showBusinessName: boolean
  onShowBusinessNameChange: (v: boolean) => void
  hasLogo: boolean
}

function Wireframe({ id }: { id: InvoiceTemplateId }) {
  return (
    <div className="w-full h-20 relative border border-gray-200 rounded overflow-hidden bg-white">
      {id === 'top-left' && (
        <div className="p-1.5">
          <div className="flex justify-between">
            <div>
              <div className="w-10 h-4 bg-gray-300 rounded mb-0.5" />
              <div className="w-8 h-1 bg-gray-200 rounded mb-0.5" />
              <div className="w-6 h-1 bg-gray-200 rounded" />
            </div>
            <div className="text-right">
              <div className="w-10 h-2 bg-gray-200 rounded mb-0.5" />
              <div className="w-8 h-1 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      )}
      {id === 'top-center' && (
        <div className="p-1.5 flex flex-col items-center">
          <div className="w-10 h-4 bg-gray-300 rounded mb-0.5" />
          <div className="w-8 h-1 bg-gray-200 rounded mb-0.5" />
          <div className="w-6 h-1 bg-gray-200 rounded mb-0.5" />
          <div className="w-10 h-2 bg-gray-200 rounded" />
        </div>
      )}
      {id === 'top-right' && (
        <div className="p-1.5">
          <div className="flex justify-between">
            <div>
              <div className="w-10 h-2 bg-gray-200 rounded mb-0.5" />
              <div className="w-8 h-1 bg-gray-200 rounded" />
            </div>
            <div className="text-right">
              <div className="w-10 h-4 bg-gray-300 rounded mb-0.5 ml-auto" />
              <div className="w-8 h-1 bg-gray-200 rounded mb-0.5 ml-auto" />
              <div className="w-6 h-1 bg-gray-200 rounded ml-auto" />
            </div>
          </div>
        </div>
      )}
      {id === 'banner' && (
        <div>
          <div className="bg-gray-100 p-1.5 flex items-center gap-1">
            <div className="w-8 h-4 bg-gray-300 rounded shrink-0" />
            <div>
              <div className="w-8 h-1 bg-gray-200 rounded mb-0.5" />
              <div className="w-6 h-1 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="p-1.5">
            <div className="w-10 h-2 bg-gray-200 rounded" />
          </div>
        </div>
      )}
      {id === 'inline' && (
        <div className="p-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 bg-gray-300 rounded shrink-0" />
              <div>
                <div className="w-8 h-1 bg-gray-200 rounded mb-0.5" />
                <div className="w-6 h-1 bg-gray-200 rounded" />
              </div>
            </div>
            <div className="text-right">
              <div className="w-10 h-2 bg-gray-200 rounded mb-0.5" />
              <div className="w-8 h-1 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      )}
      {id === 'footer-logo' && (
        <div className="p-1.5 flex flex-col h-full">
          <div className="flex justify-between mb-auto">
            <div>
              <div className="w-8 h-1 bg-gray-200 rounded mb-0.5" />
              <div className="w-6 h-1 bg-gray-200 rounded mb-0.5" />
              <div className="w-6 h-1 bg-gray-200 rounded" />
            </div>
            <div className="text-right">
              <div className="w-10 h-2 bg-gray-200 rounded mb-0.5" />
              <div className="w-8 h-1 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="w-8 h-3 bg-gray-300 rounded mt-auto" />
        </div>
      )}
    </div>
  )
}

export function InvoiceTemplatePicker({
  value,
  onChange,
  showBusinessName,
  onShowBusinessNameChange,
  hasLogo,
}: Props) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {INVOICE_TEMPLATES.map(tpl => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onChange(tpl.id)}
            className={`rounded-lg border p-2 text-left transition-all ${
              value === tpl.id
                ? 'ring-2 ring-primary border-primary'
                : 'hover:border-gray-300'
            }`}
          >
            <Wireframe id={tpl.id} />
            <p className="text-[11px] font-semibold mt-1">{tpl.label}</p>
            <p className="text-[9px] text-muted-foreground">{tpl.blurb}</p>
          </button>
        ))}
      </div>
      <div className="mt-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showBusinessName}
            disabled={!hasLogo}
            onChange={e => onShowBusinessNameChange(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary/40"
          />
          <div>
            <span className="text-xs font-medium">Show business name on invoice</span>
            {!hasLogo && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Upload a logo to hide the text name — the logo then carries your invoice identity.
              </p>
            )}
          </div>
        </label>
      </div>
    </div>
  )
}
