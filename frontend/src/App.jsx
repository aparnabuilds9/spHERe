
import { useState } from 'react'
import './App.css'
import PhysicalSafety from './components/PhysicalSafety'

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
    description: 'Check text for exposed phone numbers and email addresses.',
    icon: '◎',
    tone: 'sage',
    action: 'Check my privacy',
  },
  {
    id: 'physical',
    number: '03',
    title: 'Physical safety',
    description: 'Access safety resources and plan your next steps.',
    icon: '⌖',
    tone: 'sand',
    action: 'Explore resources',
  },
  {
    id: 'emergency',
    number: '04',
    title: 'Emergency assistance',
    description: 'Access emergency calling and optional location sharing.',
    icon: '✳',
    tone: 'plum',
    action: 'Open assistance',
  },
]

function App() {
  const [page, setPage] = useState('home')
  const [message, setMessage] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [privacyText, setPrivacyText] = useState('')
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [location, setLocation] = useState(null)
  const [locationError, setLocationError] = useState('')
  const [contact, setContact] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

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

  const emailMatches = privacyText.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  ) || []

  const phoneMatches = privacyText.match(
    /(?<!\w)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\w)/g
  ) || []

  const privacyFindings = [
    ...new Set(emailMatches.map((value) => value.trim())),
    ...new Set(phoneMatches.map((value) => value.trim())),
  ]

  const redactedText = privacyText
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL REDACTED]')
    .replace(/(?<!\w)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\w)/g, '[PHONE REDACTED]')

  const requestLocation = () => {
    setLocationError('')

    if (!navigator.geolocation) {
      setLocationError('Location access is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        })
      },
      () => {
        setLocationError(
          'Location was not shared. Check browser permissions or continue without it.'
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }

  const copyLocation = async () => {
    if (!location) return

    const link = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`

    try {
      await navigator.clipboard.writeText(link)
      setCopyStatus('Map link copied. Share it only with someone you trust.')
    } catch {
      setCopyStatus(`Copy this map link: ${link}`)
    }
  }

  const callContact = () => {
    const cleaned = contact.replace(/[^\d+]/g, '')

    if (cleaned.length < 7) {
      setCopyStatus('Enter a valid contact number first.')
      return
    }

    window.location.href = `tel:${cleaned}`
  }

  const pageTitles = {
    home: ['Your safety, your choices.', 'A private space to assess concerns, protect personal information, and find your next step.'],
    threats: ['Threat intelligence', 'Look for warning signs in a suspicious message before deciding what to do.'],
    privacy: ['Privacy sentinel', 'Check text for common personal information before sharing it.'],
    physical: ['Physical safety', 'Use practical safety resources without relying on unverified danger scores.'],
    emergency: ['Emergency assistance', 'If you are in immediate danger in India, call 112 if it is safe to do so.'],
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
            <section className="tool-layout">
              <div className="tool-main-card">
                <div className="card-kicker">02 / TEXT PRIVACY CHECK</div>
                <h2>Before you share, check what's visible.</h2>
                <p className="card-description">Paste text to find common Indian mobile-number patterns and email addresses. This check runs in your browser.</p>
                <form className="tool-form" onSubmit={scanPrivacy}>
                  <label htmlFor="privacy-text">Text to check</label>
                  <textarea
                    id="privacy-text"
                    value={privacyText}
                    onChange={(event) => {
                      setPrivacyText(event.target.value)
                      setPrivacyChecked(false)
                    }}
                    placeholder="Paste text here to check for phone numbers or email addresses…"
                    rows={7}
                    maxLength={5000}
                  />
                  <div className="input-meta"><span>Text is checked locally by this page.</span><span>{privacyText.length}/5000</span></div>
                  <button className="primary-button" type="submit">Check for exposed details <span>↗</span></button>
                </form>

                {privacyChecked && (
                  <div className="privacy-results" aria-live="polite">
                    <h3>{privacyFindings.length ? `${privacyFindings.length} detected match(es)` : 'No matching phone numbers or emails found'}</h3>
                    <p>Pattern matching is imperfect. Review the text yourself; other personal details may not be detected.</p>
                    {privacyFindings.length > 0 && (
                      <>
                        <ul className="finding-list">
                          {privacyFindings.map((finding, index) => <li key={`${finding}-${index}`}>{finding.replace(/./g, '•')}</li>)}
                        </ul>
                        <label className="preview-label" htmlFor="redacted-preview">Redacted text preview</label>
                        <textarea id="redacted-preview" readOnly value={redactedText} rows={5} />
                        <p className="result-limitation">Preview only. No image or file has been modified.</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <aside className="tool-side-card">
                <span className="side-card-icon">◎</span>
                <h3>Your personal information deserves care.</h3>
                <p>Before posting a screenshot, check names, phone numbers, email addresses, addresses, account details, and visible notifications.</p>
                <div className="side-tip"><strong>Prototype limitation</strong><p>Screenshot OCR, image redaction, and photo GPS metadata inspection are not implemented in this screen.</p></div>
              </aside>
            </section>
          )}

          {page === 'physical' && (
            <PhysicalSafety goTo={goTo} />
          )}

          {page === 'emergency' && (
            <section className="emergency-layout">
              <div className="emergency-banner">
                <div>
                  <div className="card-kicker">IMMEDIATE ASSISTANCE</div>
                  <h2>Help is a valid next step.</h2>
                  <p>If you are in immediate danger in India, call 112 when it is safe to do so. Do not wait for this prototype to respond.</p>
                </div>
                <a className="call-emergency" href="tel:112">Call 112 <span>↗</span></a>
              </div>

              <div className="emergency-grid">
                <article className="tool-main-card">
                  <span className="feature-icon rose">☎</span>
                  <h3>Call someone you trust</h3>
                  <p className="card-description">Enter a number to open your device's calling app. Your number is not saved by this page.</p>
                  <form className="tool-form" onSubmit={(event) => { event.preventDefault(); callContact() }}>
                    <label htmlFor="trusted-contact">Trusted contact number</label>
                    <input id="trusted-contact" value={contact} onChange={(event) => { setContact(event.target.value); setCopyStatus('') }} placeholder="Enter a phone number" autoComplete="tel" />
                    <button className="primary-button" type="submit">Open phone app <span>↗</span></button>
                  </form>
                </article>

                <article className="tool-main-card">
                  <span className="feature-icon sage">⌖</span>
                  <h3>Share your location</h3>
                  <p className="card-description">Choose to request your current location. It will not be requested until you press the button.</p>
                  {!location ? (
                    <button className="secondary-button" onClick={requestLocation}>Request my location</button>
                  ) : (
                    <div className="location-card">
                      <span className="location-status">LOCATION RECEIVED</span>
                      <p>Latitude: {location.latitude.toFixed(5)}</p>
                      <p>Longitude: {location.longitude.toFixed(5)}</p>
                      <button className="secondary-button" onClick={copyLocation}>Copy map link</button>
                    </div>
                  )}
                  {locationError && <p className="error" role="alert">{locationError}</p>}
                </article>
              </div>

              {copyStatus && <p className="status-message" role="status">{copyStatus}</p>}

              <div className="disclaimer-strip">
                <span className="disclaimer-symbol">i</span>
                <p>Calling requires your device to support the phone link. Location sharing only copies a map link after you request your location. This page does not automatically contact anyone or send messages.</p>
              </div>
            </section>
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
