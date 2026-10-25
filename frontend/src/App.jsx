import { useState } from 'react'


function App() {
  // UI state
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    if (!message.trim()) {
      setError('Message cannot be empty.')
      return
    }
    setLoading(true)
    try {
      const resp = await fetch('http://127.0.0.1:8000/api/safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, category: 'auto' }),
      })
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(`Server error ${resp.status}: ${txt}`)
      }
      const data = await resp.json()
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Helper to render result nicely
  const renderResult = () => {
    if (!result) return null
    const { selected_tool, result: analysis } = result
    return (
      <div className="result-panel">
        <h2>Analysis Result</h2>
        <p><strong>Tool selected:</strong> {selected_tool}</p>
        <p><strong>Assessment:</strong> {analysis.assessment}</p>
        <p><strong>Findings:</strong> {analysis.findings.length ? analysis.findings.join(', ') : 'None'}</p>
        <p><strong>Advice:</strong></p>
        <ul>
          {analysis.advice.map((a, i) => (<li key={i}>{a}</li>))}
        </ul>
        <p><em>{analysis.limitation}</em></p>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>SPHERe – Digital Safety Analyzer</h1>
      </header>
      <main className="main-content">
        <form className="safety-form" onSubmit={handleSubmit}>
          <label htmlFor="message">Enter a message or snippet:</label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g., I need you to send money right now..."
            rows={6}
            maxLength={3000}
          />
          <button type="submit" disabled={loading}>Analyze</button>
        </form>
        {loading && <p className="loading">Analyzing…</p>}
        {error && <p className="error">Error: {error}</p>}
        {renderResult()}
      </main>
      <footer className="footer">
        <p>Rule‑based prototype – not an AI model.</p>
      </footer>
    </div>
  )
}

export default App