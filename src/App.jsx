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

function StatCard({ title, value, subtitle }) {
  return (
    <div className="card">
      <div className="label">{title}</div>
      <div className="value">{value}</div>
      {subtitle ? <div className="subtle">{subtitle}</div> : null}
    </div>
  )
}

function BarList({ title, rows, metric = 'spend' }) {
  const maxValue = Math.max(...rows.map((r) => Number(metric === 'spend' ? r.spend : r.dalys || 0)), 1)
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        {rows.length === 0 ? (
          <div className="subtle">No data yet.</div>
        ) : (
          rows.map((row) => {
            const value = Number(metric === 'spend' ? row.spend : row.dalys || 0)
            return (
              <div key={row.name}>
                <div className="row-between">
                  <div style={{ fontWeight: 700 }}>{row.name}</div>
                  <div className="subtle">
                    {metric === 'spend' ? formatCurrency(row.spend) : formatNumber(row.dalys, 1)}
                  </div>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max((value / maxValue) * 100, 2)}%` }} />
                </div>
                <div className="subtle" style={{ marginTop: 6 }}>
                  DALYs: {formatNumber(row.dalys, 1)} | Units: {formatNumber(row.units, 0)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SectionCard({ title, children, right }) {
  return (
    <div className="panel">
      <div className="row-between">
        <div className="panel-title">{title}</div>
        {right || null}
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
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
  const [allocationResult, setAllocationResult] = useState(null)
  const [scenarioResult, setScenarioResult] = useState(null)
  const [selectedProvince, setSelectedProvince] = useState('')
  const [diseaseModules, setDiseaseModules] = useState([])
  const [selectedDiseaseModule, setSelectedDiseaseModule] = useState('')

  useEffect(() => {
    async function loadModules() {
      try {
        const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/v1/disease-modules`)
        if (!response.ok) return
        const data = await response.json()
        setDiseaseModules(data?.disease_modules || [])
      } catch {
        // ignore module fetch errors
      }
    }
    loadModules()
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

  const scenarioRows = useMemo(() => {
    if (!scenarioResult?.scenario_results) return []
    return Object.entries(scenarioResult.scenario_results).map(([name, payload]) => ({
      name,
      dalys: payload?.kpis?.total_dalys_averted || 0,
      spend: payload?.kpis?.total_spend_zar || 0,
      avgCost: payload?.kpis?.average_cost_per_daly || 0,
    }))
  }, [scenarioResult])

  const currentDisease = allocationResult?.allocation_results?.[0]?.disease || scenarioResult?.metadata?.disease || ''

  const selectedModuleData = useMemo(() => {
    return diseaseModules.find((m) => m.disease === selectedDiseaseModule) || null
  }, [diseaseModules, selectedDiseaseModule])

  async function postForm(endpoint, expectBlob = false) {
    if (!file) throw new Error('Please choose an Excel or CSV file first.')

    const form = new FormData()
    form.append('file', file)
    form.append('budget_zar', budget)
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
      const firstProvince = Object.keys(data.province_briefs || {})[0] || ''
      setSelectedProvince(firstProvince)
    } catch (e) {
      setError(e.message || 'Request failed.')
    } finally {
      setLoadingRun(false)
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
      a.download = 'ncd_policy_report.docx'
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
          <h1 className="h1">NCD Cascade Allocation Platform</h1>
          <p className="lead">
            This frontend is aligned with the generic NCD backend. It supports disease-module viewing,
            data upload, allocation runs, scenario comparison, policy-facing outputs, provenance review,
            and Word report download.
          </p>
        </div>

        <div className="panel">
          <div className="panel-title">Connected backend</div>
          <input className="input" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          <div className="subtle" style={{ marginTop: 10 }}>
            Base URL used for disease modules, allocation, scenario comparison, and Word export
          </div>
        </div>
      </div>

      <div className="section-grid">
        <SectionCard title="Run model">
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
                  <span>Apply imputation</span>
                </label>
              </div>
            </div>

            <div className="button-row">
              <button className="btn" onClick={runAllocation} disabled={loadingRun}>
                {loadingRun ? 'Running...' : 'Run allocation'}
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
                <strong>Warnings:</strong> {allocationResult.warnings.join(' | ')}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="National policy advisory brief" right={currentDisease ? <span className="badge">{currentDisease}</span> : null}>
          <div className="text-block">
            {allocationResult?.policy_advisory_brief || 'Run the model to generate a national policy advisory brief.'}
          </div>
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

        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="table">
            <thead>
              <tr>
                <th className="th">Scenario</th>
                <th className="th">DALYs averted</th>
                <th className="th">Total spend</th>
                <th className="th">Average cost per DALY</th>
              </tr>
            </thead>
            <tbody>
              {scenarioRows.length ? (
                scenarioRows.map((row) => (
                  <tr key={row.name}>
                    <td className="td">{row.name}</td>
                    <td className="td">{formatNumber(row.dalys, 1)}</td>
                    <td className="td">{formatCurrency(row.spend)}</td>
                    <td className="td">{formatCurrency(row.avgCost)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="td" colSpan="4">No scenario comparison results yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

      <div className="section-grid">
        <SectionCard title="Validation, provenance, and metadata">
          <div className="two-col">
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

          {allocationResult?.provenance_summary?.source_tier_breakdown ? (
            <div className="soft-box" style={{ marginTop: 16 }}>
              <div className="label-strong">Source tier breakdown</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                {Object.entries(allocationResult.provenance_summary.source_tier_breakdown)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
              </div>
            </div>
          ) : null}

          {allocationResult?.provenance_summary?.assembly_summary ? (
            <div className="soft-box" style={{ marginTop: 16 }}>
              <div className="label-strong">Dataset assembly summary</div>
              <div className="text-block" style={{ marginTop: 8 }}>
                {Object.entries(allocationResult.provenance_summary.assembly_summary)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
              </div>
            </div>
          ) : null}
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
              <div style={{ marginTop: 8 }}>
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

      <SectionCard title="How this tool can be used">
        <ul className="list">
          <li>Researchers can upload study-specific parameters and generate allocation outputs for policy simulation.</li>
          <li>Policy makers can compare efficiency-driven and equity-sensitive scenarios before making budget decisions.</li>
          <li>Provincial health departments can use province-specific briefs to support operational planning.</li>
          <li>Programme managers can download a Word report for stakeholder meetings and implementation planning.</li>
          <li>Disease-module browsing helps users understand how each NCD is structured in the platform.</li>
        </ul>
      </SectionCard>
    </div>
  )
}
