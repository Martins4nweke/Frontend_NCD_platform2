import React, { useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://your-backend.onrender.com'

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return new Intl.NumberFormat('en-ZA', {
    maximumFractionDigits: digits,
  }).format(Number(value))
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-ZA')
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

function parseReadinessSources(payload) {
  if (!payload || typeof payload !== 'object') return []
  const entries = Object.entries(payload).filter(([key]) => key !== 'timestamp_utc' && key !== 'checked_at_utc')
  return entries.map(([name, item]) => ({
    name,
    ok: Boolean(item?.ready ?? item?.available ?? item?.ok),
    mode: item?.mode || item?.access_mode || '-',
    detail: item?.detail || item?.message || item?.status || '-',
  }))
}

function extractBestFillRows(preview) {
  if (!preview) return []
  if (Array.isArray(preview)) return preview
  if (Array.isArray(preview?.rows)) return preview.rows
  if (Array.isArray(preview?.items)) return preview.items
  if (Array.isArray(preview?.preview)) return preview.preview
  return []
}

function getFillTypeClass(value) {
  const key = String(value || '').toLowerCase()
  if (key.includes('imput')) return 'pill danger'
  if (key.includes('proxy')) return 'pill warning'
  if (key.includes('exact')) return 'pill success'
  return 'pill'
}

function getConfidenceClass(value) {
  const key = String(value || '').toLowerCase()
  if (key.includes('high') || key.includes('strong')) return 'pill success'
  if (key.includes('moderate')) return 'pill warning'
  if (key.includes('low') || key.includes('weak') || key.includes('caut')) return 'pill danger'
  return 'pill'
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="card">
      <div className="label">{title}</div>
      <div className="value">{value}</div>
      {subtitle ? <div className="subtle">{subtitle}</div> : null}
    </div>
  )
}

function SectionCard({ title, children, right }) {
  return (
    <div className="panel">
      <div className="row-between gap-wrap">
        <div className="panel-title">{title}</div>
        {right || null}
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  )
}

function BarList({ title, rows, metric = 'spend' }) {
  const safeRows = Array.isArray(rows) ? rows : []
  const maxValue = Math.max(
    ...safeRows.map((r) => Number(metric === 'spend' ? r?.spend ?? r?.spend_zar : r?.dalys ?? r?.dalys_averted ?? 0)),
    1
  )

  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        {safeRows.length === 0 ? (
          <div className="subtle">No data yet.</div>
        ) : (
          safeRows.map((row, idx) => {
            const key = row?.name || row?.province || row?.intervention || row?.stage || `row-${idx}`
            const value = Number(metric === 'spend' ? row?.spend ?? row?.spend_zar ?? 0 : row?.dalys ?? row?.dalys_averted ?? 0)
            return (
              <div key={key}>
                <div className="row-between">
                  <div style={{ fontWeight: 700 }}>{row?.name || row?.province || row?.intervention || row?.stage || '-'}</div>
                  <div className="subtle">
                    {metric === 'spend'
                      ? formatCurrency(row?.spend ?? row?.spend_zar)
                      : formatNumber(row?.dalys ?? row?.dalys_averted, 1)}
                  </div>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max((value / maxValue) * 100, 2)}%` }} />
                </div>
                <div className="subtle" style={{ marginTop: 6 }}>
                  DALYs: {formatNumber(row?.dalys ?? row?.dalys_averted, 1)} | Units: {formatNumber(row?.units ?? row?.total_units, 0)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [apiBase, setApiBase] = useState(API_BASE)
  const [budget, setBudget] = useState('100000000')
  const [applyImputation, setApplyImputation] = useState(false)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [loadingRun, setLoadingRun] = useState(false)
  const [loadingCompare, setLoadingCompare] = useState(false)
  const [loadingWord, setLoadingWord] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [allocationResult, setAllocationResult] = useState(null)
  const [scenarioResult, setScenarioResult] = useState(null)
  const [evidencePreview, setEvidencePreview] = useState(null)
  const [sourceReadiness, setSourceReadiness] = useState(null)
  const [selectedProvince, setSelectedProvince] = useState('')
  const [diseaseModules, setDiseaseModules] = useState([])
  const [selectedDiseaseModule, setSelectedDiseaseModule] = useState('')

  useEffect(() => {
    async function loadModulesAndReadiness() {
      try {
        const trimmed = apiBase.replace(/\/$/, '')
        const [moduleResponse, readinessResponse] = await Promise.all([
          fetch(`${trimmed}/api/v1/disease-modules`).catch(() => null),
          fetch(`${trimmed}/api/v1/source-readiness`).catch(() => null),
        ])

        if (moduleResponse?.ok) {
          const data = await moduleResponse.json()
          setDiseaseModules(data?.disease_modules || [])
        }

        if (readinessResponse?.ok) {
          const data = await readinessResponse.json()
          setSourceReadiness(data)
        } else {
          setSourceReadiness(null)
        }
      } catch {
        setSourceReadiness(null)
      }
    }
    loadModulesAndReadiness()
  }, [apiBase])

  const grouped = allocationResult?.grouped_summaries || {
    by_intervention: [],
    by_province: [],
    by_stratum: [],
    by_stage: [],
    top_rows: [],
  }

  const provinceOptions = useMemo(
    () => Object.keys(allocationResult?.province_briefs || {}),
    [allocationResult]
  )

  const readinessRows = useMemo(() => parseReadinessSources(sourceReadiness), [sourceReadiness])
  const evidencePreviewRows = useMemo(
    () => extractBestFillRows(evidencePreview?.parameter_provenance_preview || allocationResult?.parameter_provenance_preview),
    [evidencePreview, allocationResult]
  )

  const scenarioRows = useMemo(() => {
    if (!scenarioResult?.scenario_results) return []
    return Object.entries(scenarioResult.scenario_results).map(([name, payload]) => ({
      name,
      dalys: payload?.kpis?.total_dalys_averted || 0,
      spend: payload?.kpis?.total_spend_zar || 0,
      avgCost: payload?.kpis?.average_cost_per_daly || 0,
      remaining: payload?.kpis?.budget_remaining_zar || 0,
      warnings: payload?.warnings?.length || 0,
    }))
  }, [scenarioResult])

  const currentDisease = allocationResult?.allocation_results?.[0]?.disease || scenarioResult?.metadata?.disease || ''

  const selectedModuleData = useMemo(() => {
    return diseaseModules.find((m) => m.disease === selectedDiseaseModule) || null
  }, [diseaseModules, selectedDiseaseModule])

  const scenarioWinners = useMemo(() => {
    if (!scenarioResult) return []
    return [
      ['Best efficiency', scenarioResult?.best_efficiency_scenario],
      ['Best equity', scenarioResult?.best_equity_scenario],
      ['Best balanced', scenarioResult?.best_balanced_scenario],
    ].filter(([, value]) => value)
  }, [scenarioResult])

  async function postForm(endpoint, expectBlob = false, includeBudget = true) {
    if (!file) throw new Error('Please choose an Excel or CSV file first.')

    const form = new FormData()
    form.append('file', file)
    if (includeBudget) form.append('budget_zar', budget)
    form.append('apply_imputation', String(applyImputation))

    const response = await fetch(`${apiBase.replace(/\/$/, '')}${endpoint}`, {
      method: 'POST',
      body: form,
    })

    if (!response.ok) {
      const text = await response.text()
      try {
        const data = JSON.parse(text)
        throw new Error(typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail || data))
      } catch {
        throw new Error(text || 'Request failed.')
      }
    }

    return expectBlob ? response.blob() : response.json()
  }

  async function runAllocation() {
    setError('')
    setLoadingRun(true)
    try {
      const data = await postForm('/api/v1/allocate')
      setAllocationResult(data)
      setScenarioResult(null)
      const firstProvince = Object.keys(data?.province_briefs || {})[0] || ''
      setSelectedProvince(firstProvince)
    } catch (e) {
      setError(e.message || 'Request failed.')
    } finally {
      setLoadingRun(false)
    }
  }

  async function previewEvidenceFill() {
    setError('')
    setLoadingPreview(true)
    try {
      const data = await postForm('/api/v1/evidence-fill-preview', false, false)
      setEvidencePreview(data)
    } catch (e) {
      setError(e.message || 'Evidence preview failed.')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function compareScenarios() {
    setError('')
    setLoadingCompare(true)
    try {
      const data = await postForm('/api/v1/compare-scenarios')
      setScenarioResult(data)
    } catch (e) {
      setError(e.message || 'Scenario comparison failed.')
    } finally {
      setLoadingCompare(false)
    }
  }

  async function downloadWord() {
    setError('')
    setLoadingWord(true)
    try {
      const blob = await postForm('/api/v1/export-word', true)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ncd_policy_report_v63.docx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message || 'Word export failed.')
    } finally {
      setLoadingWord(false)
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <div>
          <h1 className="h1">NCD Allocation Platform v6.3</h1>
          <p className="lead">
            This frontend is aligned to the latest backend. It supports evidence-fill preview, source readiness checks, parameter-level provenance, requested and selected year display, stronger scenario interpretation, province comparison, and Word report download.
          </p>
        </div>

        <div className="panel">
          <div className="panel-title">Connected backend</div>
          <input className="input" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          <div className="subtle" style={{ marginTop: 10 }}>
            Base URL used for evidence checks, disease modules, allocation runs, scenario comparison, and Word export.
          </div>
          <div className="subtle" style={{ marginTop: 10 }}>
            Source readiness checked: {formatDate(sourceReadiness?.timestamp_utc || sourceReadiness?.checked_at_utc)}
          </div>
        </div>
      </div>

      <div className="section-grid">
        <SectionCard title="Run model and evidence checks">
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label className="label-strong">Upload Excel or CSV</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="file-input"
                style={{ marginTop: 8 }}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? <div className="subtle" style={{ marginTop: 8 }}>Selected: {file.name}</div> : null}
            </div>

            <div className="form-grid">
              <div>
                <label className="label-strong">Budget (ZAR)</label>
                <input className="input" style={{ marginTop: 8 }} value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>

              <div style={{ display: 'flex', alignItems: 'end' }}>
                <label className="checkbox-wrap">
                  <input type="checkbox" checked={applyImputation} onChange={(e) => setApplyImputation(e.target.checked)} />
                  <span>Apply imputation only if needed</span>
                </label>
              </div>
            </div>

            <div className="button-row">
              <button className="btn" onClick={runAllocation} disabled={loadingRun}>
                {loadingRun ? 'Running...' : 'Run allocation'}
              </button>
              <button className="btn-secondary" onClick={previewEvidenceFill} disabled={loadingPreview}>
                {loadingPreview ? 'Checking...' : 'Preview evidence fill'}
              </button>
              <button className="btn-secondary" onClick={compareScenarios} disabled={loadingCompare}>
                {loadingCompare ? 'Comparing...' : 'Compare scenarios'}
              </button>
              <button className="btn-secondary" onClick={downloadWord} disabled={loadingWord}>
                {loadingWord ? 'Preparing...' : 'Download Word report'}
              </button>
            </div>

            {error ? <div className="error">{error}</div> : null}
            {(allocationResult?.warnings || []).length ? (
              <div className="warning">
                <strong>Allocation warnings:</strong> {allocationResult.warnings.join(' | ')}
              </div>
            ) : null}
            {(evidencePreview?.evidence_retrieval_summary?.warnings || []).length ? (
              <div className="warning">
                <strong>Evidence preview warnings:</strong> {evidencePreview.evidence_retrieval_summary.warnings.join(' | ')}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="National policy advisory brief" right={currentDisease ? <span className="badge">{currentDisease}</span> : null}>
          <div className="text-block">
            {allocationResult?.policy_advisory_brief || 'Run the model to generate a national policy advisory brief.'}
          </div>
          {allocationResult?.limitations_note ? (
            <div className="soft-box" style={{ marginTop: 14 }}>
              <div className="label-strong">Limitations note</div>
              <div className="text-block" style={{ marginTop: 8 }}>{allocationResult.limitations_note}</div>
            </div>
          ) : null}
          {allocationResult?.confidence_note ? (
            <div className="soft-box" style={{ marginTop: 14 }}>
              <div className="label-strong">Confidence note</div>
              <div className="text-block" style={{ marginTop: 8 }}>{allocationResult.confidence_note}</div>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="stats-grid">
        <StatCard title="Budget" value={formatCurrency(allocationResult?.kpis?.budget_zar)} />
        <StatCard title="Total spend" value={formatCurrency(allocationResult?.kpis?.total_spend_zar)} />
        <StatCard title="Budget remaining" value={formatCurrency(allocationResult?.kpis?.budget_remaining_zar)} />
        <StatCard title="DALYs averted" value={formatNumber(allocationResult?.kpis?.total_dalys_averted, 1)} />
        <StatCard title="Average cost per DALY" value={formatCurrency(allocationResult?.kpis?.average_cost_per_daly)} />
      </div>

      <div className="chart-grid">
        <BarList title="Spend by intervention" rows={grouped.by_intervention || []} />
        <BarList title="Spend by province" rows={grouped.by_province || []} />
        <BarList title="Spend by stratum" rows={grouped.by_stratum || []} />
        <BarList title="Spend by stage" rows={grouped.by_stage || []} />
      </div>

      <div className="section-grid">
        <SectionCard title="Source readiness and retrieval status">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Source</th>
                  <th className="th">Ready</th>
                  <th className="th">Mode</th>
                  <th className="th">Detail</th>
                </tr>
              </thead>
              <tbody>
                {readinessRows.length ? (
                  readinessRows.map((row) => (
                    <tr key={row.name}>
                      <td className="td">{titleCase(row.name)}</td>
                      <td className="td"><span className={row.ok ? 'pill success' : 'pill danger'}>{row.ok ? 'Ready' : 'Not ready'}</span></td>
                      <td className="td">{titleCase(row.mode)}</td>
                      <td className="td">{row.detail}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="td" colSpan="4">No source readiness response yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Evidence retrieval summary">
          <div className="two-col compact-grid">
            <div className="soft-box">
              <div className="label-strong">Evidence fill preview</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                Retrieved fields: {formatNumber(evidencePreview?.evidence_retrieval_summary?.filled_count || 0)}{"\n"}
                Public source hits: {formatNumber(evidencePreview?.evidence_retrieval_summary?.public_source_hits || 0)}{"\n"}
                Country pack hits: {formatNumber(evidencePreview?.evidence_retrieval_summary?.country_pack_hits || 0)}{"\n"}
                Imputation fallback needed: {formatNumber(evidencePreview?.evidence_retrieval_summary?.imputation_candidates || 0)}
              </div>
            </div>
            <div className="soft-box">
              <div className="label-strong">Allocation retrieval summary</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                Retrieved fields: {formatNumber(allocationResult?.evidence_retrieval_summary?.filled_count || 0)}{"\n"}
                Public source hits: {formatNumber(allocationResult?.evidence_retrieval_summary?.public_source_hits || 0)}{"\n"}
                Country pack hits: {formatNumber(allocationResult?.evidence_retrieval_summary?.country_pack_hits || 0)}{"\n"}
                Imputation fallback needed: {formatNumber(allocationResult?.evidence_retrieval_summary?.imputation_candidates || 0)}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="section-grid">
        <SectionCard title="Equity-sensitive recommendations">
          {allocationResult?.equity_recommendations?.length ? (
            <ul className="list">
              {allocationResult.equity_recommendations.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          ) : (
            <div className="subtle">Run the model to generate equity-sensitive recommendations.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Province-specific advisory"
          right={
            provinceOptions.length ? (
              <select className="select" value={selectedProvince} onChange={(e) => setSelectedProvince(e.target.value)}>
                {provinceOptions.map((province) => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
            ) : null
          }
        >
          <div className="text-block">
            {(selectedProvince && allocationResult?.province_briefs?.[selectedProvince]) ||
              'Run the model to view province-specific advisory text.'}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Scenario comparison"
        right={scenarioResult?.metadata ? <div className="subtle">Scenarios: {scenarioResult.metadata.scenario_count}</div> : null}
      >
        <div className="text-block">
          {scenarioResult?.scenario_comparison_brief || 'Use Compare scenarios to generate a comparative advisory brief.'}
        </div>

        {scenarioWinners.length ? (
          <div className="chip-row" style={{ marginTop: 14 }}>
            {scenarioWinners.map(([label, value]) => (
              <span key={label} className="badge strong">{label}: {value}</span>
            ))}
          </div>
        ) : null}

        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="table">
            <thead>
              <tr>
                <th className="th">Scenario</th>
                <th className="th">DALYs averted</th>
                <th className="th">Total spend</th>
                <th className="th">Budget remaining</th>
                <th className="th">Average cost per DALY</th>
                <th className="th">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {scenarioRows.length ? (
                scenarioRows.map((row) => (
                  <tr key={row.name}>
                    <td className="td">{row.name}</td>
                    <td className="td">{formatNumber(row.dalys, 1)}</td>
                    <td className="td">{formatCurrency(row.spend)}</td>
                    <td className="td">{formatCurrency(row.remaining)}</td>
                    <td className="td">{formatCurrency(row.avgCost)}</td>
                    <td className="td">{formatNumber(row.warnings, 0)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="td" colSpan="6">No scenario comparison results yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {Array.isArray(scenarioResult?.scenario_tradeoff_table) && scenarioResult.scenario_tradeoff_table.length ? (
          <div className="table-wrap" style={{ marginTop: 18 }}>
            <table className="table">
              <thead>
                <tr>
                  {Object.keys(scenarioResult.scenario_tradeoff_table[0]).map((key) => (
                    <th key={key} className="th">{titleCase(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarioResult.scenario_tradeoff_table.map((row, idx) => (
                  <tr key={idx}>
                    {Object.keys(scenarioResult.scenario_tradeoff_table[0]).map((key) => (
                      <td key={key} className="td">{String(row[key] ?? '-')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Top allocation rows"
        right={<div className="subtle">Rows received: {allocationResult?.metadata?.rows_received ?? '-'} | Rows ranked: {allocationResult?.metadata?.rows_ranked ?? '-'}</div>}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="th">Disease</th>
                <th className="th">Province</th>
                <th className="th">Stratum</th>
                <th className="th">Stage</th>
                <th className="th">Intervention</th>
                <th className="th">Spend</th>
                <th className="th">DALYs</th>
                <th className="th">Source tier</th>
              </tr>
            </thead>
            <tbody>
              {(grouped.top_rows || []).length ? (
                grouped.top_rows.map((row, idx) => (
                  <tr key={`${row.disease}-${row.province}-${row.stratum_code}-${row.intervention_name}-${idx}`}>
                    <td className="td">{row.disease}</td>
                    <td className="td">{row.province}</td>
                    <td className="td">{row.stratum_code}</td>
                    <td className="td">{row.cascade_stage}</td>
                    <td className="td">{row.intervention_name}</td>
                    <td className="td">{formatCurrency(row.spend_zar)}</td>
                    <td className="td">{formatNumber(row.dalys_averted, 1)}</td>
                    <td className="td">{row.source_tier || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="td" colSpan="8">No results yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="section-grid stack-on-small">
        <SectionCard title="Parameter-level provenance preview">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Parameter</th>
                  <th className="th">Source</th>
                  <th className="th">Requested year</th>
                  <th className="th">Selected year</th>
                  <th className="th">Retrieved</th>
                  <th className="th">Fill type</th>
                  <th className="th">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {evidencePreviewRows.length ? (
                  evidencePreviewRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx}>
                      <td className="td">{titleCase(row?.parameter || row?.parameter_name || '-')}</td>
                      <td className="td">{row?.source_name || row?.selected_source || '-'}</td>
                      <td className="td">{row?.requested_year ?? '-'}</td>
                      <td className="td">{row?.selected_year ?? row?.source_year ?? '-'}</td>
                      <td className="td">{formatDate(row?.retrieval_date || row?.retrieved_at || row?.retrieval_date_utc)}</td>
                      <td className="td"><span className={getFillTypeClass(row?.fill_type)}>{row?.fill_type || '-'}</span></td>
                      <td className="td"><span className={getConfidenceClass(row?.confidence || row?.evidence_strength_flag)}>{row?.confidence || row?.evidence_strength_flag || '-'}</span></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="td" colSpan="7">Run evidence preview or allocation to see parameter-level provenance.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Validation, provenance, and metadata">
          <div className="two-col compact-grid">
            <div className="soft-box">
              <div className="label-strong">Validation errors</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                {allocationResult?.validation_errors?.length ? allocationResult.validation_errors.join(', ') : 'None'}
              </div>
            </div>

            <div className="soft-box">
              <div className="label-strong">Provenance summary</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                Rows with source name: {formatNumber(allocationResult?.provenance_summary?.rows_with_source_name || 0)}{'\n'}
                Rows with source type: {formatNumber(allocationResult?.provenance_summary?.rows_with_source_type || 0)}{'\n'}
                Rows with source tier: {formatNumber(allocationResult?.provenance_summary?.rows_with_source_tier || 0)}{'\n'}
                Rows marked imputed: {formatNumber(allocationResult?.provenance_summary?.rows_marked_imputed || 0)}
              </div>
            </div>
          </div>

          {allocationResult?.parameter_provenance_summary ? (
            <div className="soft-box" style={{ marginTop: 16 }}>
              <div className="label-strong">Parameter provenance summary</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                {Object.entries(allocationResult.parameter_provenance_summary)
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                  .join('\n')}
              </div>
            </div>
          ) : null}

          {allocationResult?.budget_diagnostics ? (
            <div className="soft-box" style={{ marginTop: 16 }}>
              <div className="label-strong">Budget diagnostics</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                {Object.entries(allocationResult.budget_diagnostics)
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                  .join('\n')}
              </div>
            </div>
          ) : null}

          {allocationResult?.structure_diagnostics ? (
            <div className="soft-box" style={{ marginTop: 16 }}>
              <div className="label-strong">Structure diagnostics</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                {Object.entries(allocationResult.structure_diagnostics)
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                  .join('\n')}
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="section-grid stack-on-small">
        <SectionCard title="Province comparative table">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Province</th>
                  <th className="th">Spend</th>
                  <th className="th">DALYs</th>
                  <th className="th">Units</th>
                  <th className="th">Share</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(allocationResult?.province_comparative_table) && allocationResult.province_comparative_table.length ? (
                  allocationResult.province_comparative_table.map((row, idx) => (
                    <tr key={idx}>
                      <td className="td">{row?.province || row?.name || '-'}</td>
                      <td className="td">{formatCurrency(row?.spend || row?.spend_zar)}</td>
                      <td className="td">{formatNumber(row?.dalys || row?.dalys_averted, 1)}</td>
                      <td className="td">{formatNumber(row?.units || row?.total_units, 0)}</td>
                      <td className="td">{row?.share_of_budget != null ? `${formatNumber(Number(row.share_of_budget) * 100, 1)}%` : '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="td" colSpan="5">No province comparison table yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Disease modules">
          <div style={{ marginBottom: 12 }}>
            <label className="label-strong">Select disease module</label>
            <select
              className="select"
              style={{ marginTop: 8 }}
              value={selectedDiseaseModule}
              onChange={(e) => setSelectedDiseaseModule(e.target.value)}
            >
              <option value="">Select a disease module</option>
              {diseaseModules.map((m) => (
                <option key={m.disease} value={m.disease}>{m.disease}</option>
              ))}
            </select>
          </div>

          {selectedModuleData ? (
            <div>
              <div className="text-block"><strong>Disease:</strong> {selectedModuleData.disease}</div>
              <div className="text-block"><strong>Country default:</strong> {selectedModuleData.country_default}</div>
              <div className="text-block"><strong>DALY family default:</strong> {selectedModuleData.daly_family_default}</div>
              <div className="text-block"><strong>DALY definition:</strong> {selectedModuleData.daly_definition_default}</div>
              <div className="text-block" style={{ marginTop: 10 }}><strong>Cascade stages:</strong></div>
              <div className="chip-row" style={{ marginTop: 8 }}>
                {selectedModuleData.cascade_stages.map((s) => <span key={s} className="badge">{s}</span>)}
              </div>
              <div className="text-block" style={{ marginTop: 12 }}><strong>Interventions:</strong></div>
              <div className="codebox" style={{ marginTop: 8 }}>
                {JSON.stringify(selectedModuleData.interventions, null, 2)}
              </div>
              <div className="text-block" style={{ marginTop: 12 }}><strong>Notes:</strong> {selectedModuleData.notes || '-'}</div>
            </div>
          ) : (
            <div className="subtle">The backend exposes disease modules so the platform can validate disease-stage-intervention combinations consistently.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="How this updated frontend helps">
        <ul className="list">
          <li>It shows whether the backend can currently reach evidence sources before you run the model.</li>
          <li>It lets you preview how missing fields may be filled before full allocation is run.</li>
          <li>It exposes parameter-level provenance so users can see uploaded, latest, closest-year, proxy, or imputed fills clearly, together with requested and selected year where relevant.</li>
          <li>It highlights best efficiency, equity, and balanced scenarios directly in the interface.</li>
          <li>It brings province comparison and richer diagnostics into the visible workflow instead of hiding them in the backend response.</li>
        </ul>
      </SectionCard>
    </div>
  )
}
