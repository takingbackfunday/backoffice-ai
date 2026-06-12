'use client'

import type { Workspace } from '@/generated/prisma/client'
import { RuleEditor, type CategoryGroup, type Payee } from '@/components/rules/rule-editor'
import { RulesAgent } from '@/components/rules/rules-agent'

export function TransactionModals({
  showNewRuleModal,
  setShowNewRuleModal,
  showAgentModal,
  setShowAgentModal,
  projects,
  payees,
  accounts,
  categoryGroups,
  onApplyComplete,
}: {
  showNewRuleModal: boolean
  setShowNewRuleModal: (v: boolean) => void
  showAgentModal: boolean
  setShowAgentModal: (v: boolean) => void
  projects: Workspace[]
  payees: Payee[]
  accounts: { id: string; name: string }[]
  categoryGroups: CategoryGroup[]
  onApplyComplete: () => void
}) {
  return (
    <>
      {showNewRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewRuleModal(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-[#534AB7]/25 bg-white shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#534AB7]/10 bg-[#EEEDFE]/30">
              <span className="text-[13px]">✦</span>
              <span className="text-xs font-medium text-[#3C3489] flex-1">New rule</span>
              <button onClick={() => setShowNewRuleModal(false)} className="text-muted-foreground hover:text-foreground leading-none">✕</button>
            </div>
            <div className="p-4">
                <RuleEditor
                projects={projects}
                payees={payees}
                accounts={accounts}
                categoryGroups={categoryGroups}
                editingRule={undefined}
                onSave={() => setShowNewRuleModal(false)}
                onCancel={() => setShowNewRuleModal(false)}
                showSaveAndApply={true}
                onApplyComplete={onApplyComplete}
              />
            </div>
          </div>
        </div>
      )}

      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAgentModal(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-[#534AB7]/25 bg-white shadow-xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#534AB7]/10 bg-[#EEEDFE]/30 shrink-0">
              <span className="text-[13px]">✦</span>
              <span className="text-xs font-medium text-[#3C3489] flex-1">Rules agent</span>
              <button onClick={() => setShowAgentModal(false)} className="text-muted-foreground hover:text-foreground leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <RulesAgent
                categoryGroups={categoryGroups}
                payees={payees}
                projects={projects}
                accounts={accounts}
                onRuleAccepted={() => {}}
                onClose={() => setShowAgentModal(false)}
                onApplyComplete={onApplyComplete}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
