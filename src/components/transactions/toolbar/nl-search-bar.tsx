'use client'

export function NlSearchBar({
  aiMode,
  setAiMode,
  aiQuery,
  setAiQuery,
  aiLoading,
  search,
  setSearch,
  onHandleAiSearch,
  onClearAiSearch,
  loading,
}: {
  aiMode: boolean
  setAiMode: (v: boolean) => void
  aiQuery: string
  setAiQuery: (v: string) => void
  aiLoading: boolean
  search: string
  setSearch: (v: string) => void
  onHandleAiSearch: () => void
  onClearAiSearch: () => void
  loading: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {aiMode ? (
        <>
          <div className="relative">
            <input
              type="text"
              placeholder="Describe what you're looking for…"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onHandleAiSearch() }}
              className="rounded-md border border-purple-300 bg-purple-50/50 px-3 py-1.5 text-xs w-72 pr-7 focus:outline-none focus:ring-1 focus:ring-purple-400"
              aria-label="AI search transactions"
              data-testid="ai-search-input"
              disabled={aiLoading}
            />
            {aiLoading && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-3.5 h-3.5 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </span>
            )}
          </div>
          <button
            onClick={onHandleAiSearch}
            disabled={aiLoading || !aiQuery.trim()}
            className="rounded-md bg-purple-600 px-2.5 py-1.5 text-xs text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            data-testid="ai-search-btn"
          >
            Search
          </button>
          <button
            onClick={onClearAiSearch}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
            title="Switch to keyword search"
            aria-label="Exit AI search"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <div className="relative">
            <input
              type="search"
              placeholder="Search transactions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-xs w-52 pr-7"
              aria-label="Search transactions"
              data-testid="transaction-search"
            />
            {loading && search && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </span>
            )}
          </div>
          {/* AI toggle with tooltip */}
          <div className="relative group">
            <button
              onClick={() => setAiMode(true)}
              className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1.5 text-xs text-purple-700 hover:bg-purple-100 transition-colors flex items-center gap-1"
              aria-label="AI search"
              data-testid="ai-search-toggle"
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" strokeLinecap="round"/>
              </svg>
              AI
            </button>
            <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 w-64 rounded-lg border border-purple-200 bg-white px-3 py-2.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <p className="text-[11px] font-medium text-purple-800 mb-1">AI search</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Describe the transactions you&apos;re looking for in plain language — e.g. <span className="italic">&quot;all Uber rides last month&quot;</span>, <span className="italic">&quot;expenses over £200 in Q1&quot;</span>, or <span className="italic">&quot;rent payments from 2024&quot;</span>.
              </p>
              <p className="text-[10px] text-purple-600 mt-1.5 font-medium">You must click the Search button (or press Enter) to run the search.</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
