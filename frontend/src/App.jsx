import { useState } from 'react'
import './App.css'
import PhysicalSafety from './components/PhysicalSafety'
import TrustedCircleSOS from './components/TrustedCircleSOS'
import ScreenshotPrivacyDetector from './components/ScreenshotPrivacyDetector'
import { analyzePrivacyText } from './utils/privacyDetector'

const NAV = [
  { id: 'home', icon: '◈', label: 'Overview' },
  { id: 'threats', icon: '⌁', label: 'Threat intelligence' },
  { id: 'privacy', icon: '◎', label: 'Privacy sentinel' },
  { id: 'physical', icon: '⌖', label: 'Physical safety' },
  { id: 'emergency', icon: '✳', label: 'Emergency assistance' },
]

const FEATURES = [
  {
    id: 'threats',
    number: '01',
    title: 'Threat intelligence',
    description: 'Review suspicious messages and identify potential warning signs.',
    icon: '⌁',
    tone: 'rose',
    action: 'Analyze a message',
  },
  {
    id: 'privacy',
    number: '02',
    title: 'Privacy sentinel',
    description: 'Inspect screenshots for GPS leaks, censor sensitive areas, and audit text.',
    icon: '◎',
    tone: 'sage',
    action: 'Inspect privacy',
  },
  {
    id: 'physical',
    number: '03',
    title: 'Physical safety',
    description: 'Access safety resources, crime data insights, and plan your next steps.',
    icon: '⌖',
    tone: 'sand',
    action: 'Explore resources',
  },
  {
    id: 'emergency',
    number: '04',
    title: 'Emergency assistance',
    description: 'Trusted circle SOS dispatch, live location map links, and 112 helpline.',
    icon: '✳',
    tone: 'plum',
    action: 'Open emergency circle',
  },
]

function App() {
  const [page, setPage] = useState('home')
  const [privacyMode, setPrivacyMode] = useState('screenshot')
  const [message, setMessage] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [privacyText, setPrivacyText] = useState('')
  const [privacyChecked, setPrivacyChecked] = useState(false)

  const goTo = (nextPage) => {
    setPage(nextPage)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const analyzeMessage = async (event) => {
    event.preventDefault()
    setError('')
    setAnalysis(null)

    if (!message.trim()) {
      setError('Enter a message before starting the analysis.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('http://127.0.0.1:8000/api/safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), category: 'auto' }),
      })

      if (!response.ok) {
        throw new Error(`Safety service returned HTTP ${response.status}.`)
      }

      const data = await response.json()
      setAnalysis(data)
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? 'Cannot connect to the safety service. Check that your FastAPI backend is running.'
          : err.message || 'Analysis failed. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const scanPrivacy = (event) => {
    event.preventDefault()
    setPrivacyChecked(true)
  }

  // Enhanced privacy analysis for text
  const textAnalysisResult = analyzePrivacyText(privacyText)
  const privacyFindings = textAnalysisResult.findings

  const redactedText = privacyText
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, '[EMAIL REDACTED]')
    .replace(/(?<!\w)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\w)/g, '[PHONE REDACTED]')
    .replace(/[-+]?(?:[1-8]?\d(?:\.\d{3,8})|90(?:\.0{3,8})?)[,\s]+[-+]?(?:180(?:\.0{3,8})?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d{3,8}))/g, '[COORDINATES REDACTED]')

  const pageTitles = {
    home: ['Your safety, your choices.', 'A private space to assess concerns, protect personal information, and find your next step.'],
    threats: ['Threat intelligence', 'Look for warning signs in a suspicious message before deciding what to do.'],
    privacy: ['Privacy sentinel', 'Inspect screenshots for GPS coordinates, censor sensitive regions, and audit text.'],
    physical: ['Physical safety', 'Use practical safety resources without relying on unverified danger scores.'],
    emergency: ['Emergency assistance', 'Trusted circle emergency dispatch, location alerts, and 112 assistance.'],
  }

  return (
    <div className="sphere-app">
      <aside className="sidebar">
        <button className="brand" onClick={() => goTo('home')} aria-label="SPHERe home">
          <span className="brand-mark">S<span>.</span></span>
          <span className="brand-name">SPHERe<small>SAFETY, ON YOUR TERMS</small></span>
        </button>

        <div className="nav-label">YOUR SPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => goTo(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="private-note">
            <span className="private-icon">✳</span>
            <strong>Your space. Your choice.</strong>
            <p>Review the information before deciding what to share.</p>
          </div>
          <div className="sidebar-version">SPHERe · Hackathon prototype</div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">SPHERe <span>/</span> {NAV.find((item) => item.id === page)?.label}</div>
          <button className="emergency-top" onClick={() => goTo('emergency')}>
            <span>✳</span> Get help
          </button>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL SAFETY SPACE</div>
              <h1>{pageTitles[page][0]}</h1>
              <p>{pageTitles[page][1]}</p>
            </div>
            <div className="heading-seal" aria-hidden="true">
              <span>✳</span>
              <small>CARE<br />WITHOUT<br />JUDGMENT</small>
            </div>
          </section>

          {page === 'home' && (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy">
                  <span className="banner-kicker">A LITTLE MORE IN CONTROL</span>
                  <h2>Trust your instincts.<br /><em>Explore your options.</em></h2>
                  <p>Whether something online feels wrong or you need help thinking through your next step, start wherever feels right.</p>
                  <button className="primary-button" onClick={() => goTo('threats')}>
                    Start a safety check <span>↗</span>
                  </button>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="art-ring ring-one" />
                  <div className="art-ring ring-two" />
                  <div className="art-center"><span>✳</span></div>
                  <div className="art-caption">YOUR SAFETY<br />MATTERS</div>
                </div>
                <div className="banner-index">01 — 04</div>
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">EXPLORE YOUR TOOLS</div>
                    <h2>What do you need today?</h2>
                  </div>
                  <span className="section-count">04 TOOLS</span>
                </div>
                <div className="feature-grid">
                  {FEATURES.map((feature) => (
                    <button
                      className="feature-card"
                      key={feature.id}
                      onClick={() => goTo(feature.id)}
                    >
                      <div className="feature-top">
                        <span className={`feature-icon ${feature.tone}`}>{feature.icon}</span>
                        <span className="feature-number">{feature.number}</span>
                      </div>
                      <h3>{feature.title}</h3>
                      <p>{feature.description}</p>
                      <span className="feature-action">{feature.action} <span>↗</span></span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="disclaimer-strip">
                <span className="disclaimer-symbol">i</span>
                <p><strong>Designed to support, not replace, your judgment.</strong> This prototype may miss threats or flag harmless content. In an emergency, contact local emergency services.</p>
              </section>
            </>
          )}

          {page === 'threats' && (
            <section className="tool-layout">
              <div className="tool-main-card">
                <div className="card-kicker">01 / MESSAGE REVIEW</div>
                <h2>Something doesn't feel right?</h2>
                <p className="card-description">Paste the message you received. The safety service will return its assessment and any findings it supports.</p>
                <form className="tool-form" onSubmit={analyzeMessage}>
                  <label htmlFor="threat-message">Message to review</label>
                  <textarea
                    id="threat-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Paste a suspicious message here…"
                    maxLength={3000}
                    rows={7}
                  />
                  <div className="input-meta"><span>Do not include information you don't need to share.</span><span>{message.length}/3000</span></div>
                  {error && <p className="error" role="alert">{error}</p>}
                  <button className="primary-button" type="submit" disabled={loading}>
                    {loading ? 'Reviewing message…' : 'Review message'} <span>↗</span>
                  </button>
                </form>
              </div>

              <aside className="tool-side-card">
                <span className="side-card-icon">✳</span>
                <h3>Look for patterns, not certainty.</h3>
                <p>Pressure to act immediately, requests for money, threats, or demands for secrecy can be warning signs. Context matters.</p>
                <div className="side-tip"><strong>Remember</strong><p>You do not need to reply, click links, or send money just because a message pressures you.</p></div>
              </aside>

              {analysis && (
                <div className="analysis-result">
                  <div className="result-header">
                    <span className="result-label">SAFETY REVIEW · COMPLETED</span>
                    <span className="result-mark">✓</span>
                  </div>
                  <h2>Analysis result</h2>
                  <p className="assessment-text">{analysis.result?.assessment ?? 'The service returned a response without an assessment.'}</p>
                  <div className="result-detail">
                    <strong>Findings</strong>
                    {Array.isArray(analysis.result?.findings) && analysis.result.findings.length > 0
                      ? <ul>{analysis.result.findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul>
                      : <p>No specific findings were returned. This does not guarantee the message is safe.</p>}
                  </div>
                  <div className="result-detail">
                    <strong>Suggested next steps</strong>
                    {Array.isArray(analysis.result?.advice) && analysis.result.advice.length > 0
                      ? <ul>{analysis.result.advice.map((advice, index) => <li key={index}>{advice}</li>)}</ul>
                      : <p>Pause before responding and verify the sender through a separate trusted channel.</p>}
                  </div>
                  {analysis.result?.limitation && <p className="result-limitation">{analysis.result.limitation}</p>}
                  <p className="result-limitation">Service: {analysis.selected_tool || 'Safety service'}. This is a prototype assessment, not a verified determination.</p>
                </div>
              )}
            </section>
          )}

          {page === 'privacy' && (
            <div className="privacy-page-wrapper">
              <div className="sub-mode-toggle">
                <button
                  type="button"
                  className={`sub-mode-btn ${privacyMode === 'screenshot' ? 'active' : ''}`}
                  onClick={() => setPrivacyMode('screenshot')}
                >
                  <span>🖼️</span> Screenshot & EXIF Sentinel
                </button>
                <button
                  type="button"
                  className={`sub-mode-btn ${privacyMode === 'text' ? 'active' : ''}`}
                  onClick={() => setPrivacyMode('text')}
                >
                  <span>📝</span> Quick Text Privacy Check
                </button>
              </div>

              {privacyMode === 'screenshot' ? (
                <ScreenshotPrivacyDetector />
              ) : (
                <section className="tool-layout">
                  <div className="tool-main-card">
                    <div className="card-kicker">02 / TEXT PRIVACY AUDIT</div>
                    <h2>Before you share, check what's visible.</h2>
                    <p className="card-description">Paste text to find phone numbers, email addresses, coordinates, and address clues. Runs locally in your browser.</p>
                    <form className="tool-form" onSubmit={scanPrivacy}>
                      <label htmlFor="privacy-text">Text to check</label>
                      <textarea
                        id="privacy-text"
                        value={privacyText}
                        onChange={(event) => {
                          setPrivacyText(event.target.value)
                          setPrivacyChecked(false)
                        }}
                        placeholder="Paste text here to check for phone numbers, email addresses, coordinates, or postal addresses…"
                        rows={7}
                        maxLength={5000}
                      />
                      <div className="input-meta"><span>Text is checked locally by this page.</span><span>{privacyText.length}/5000</span></div>
                      <button className="primary-button" type="submit">Check for exposed details <span>↗</span></button>
                    </form>

                    {privacyChecked && (
                      <div className="privacy-results" aria-live="polite">
                        <h3>{privacyFindings.length ? `${privacyFindings.length} detected potential leak(s)` : 'No matching phone numbers or emails found'}</h3>
                        <p>Pattern matching is imperfect. Review the text yourself; other personal details may not be detected.</p>
                        {privacyFindings.length > 0 && (
                          <>
                            <ul className="finding-list">
                              {privacyFindings.map((finding) => (
                                <li key={finding.id}>
                                  <strong>{finding.category} ({finding.severity}):</strong> {finding.masked}
                                </li>
                              ))}
                            </ul>
                            <label className="preview-label" htmlFor="redacted-preview">Redacted text preview</label>
                            <textarea id="redacted-preview" readOnly value={redactedText} rows={5} />
                            <p className="result-limitation">Preview only. Copy and use the redacted text where desired.</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <aside className="tool-side-card">
                    <span className="side-card-icon">◎</span>
                    <h3>Your personal information deserves care.</h3>
                    <p>Before posting a message or comment, verify that phone numbers, email addresses, account handles, and location landmarks are removed.</p>
                    <div className="side-tip">
                      <strong>Screenshot Inspection Available</strong>
                      <p>Switch to the "Screenshot & EXIF Sentinel" tab above to analyze uploaded images and draw redactions on screenshots.</p>
                    </div>
                  </aside>
                </section>
              )}
            </div>
          )}

          {page === 'physical' && (
            <PhysicalSafety goTo={goTo} />
          )}

          {page === 'emergency' && (
            <TrustedCircleSOS />
          )}
        </div>

        <footer className="app-footer">
          <span>SPHERe <span className="footer-dot">✳</span> Safety with dignity.</span>
          <span>Prototype · Your choices remain yours.</span>
        </footer>
      </main>
    </div>
  )
}

export default App
