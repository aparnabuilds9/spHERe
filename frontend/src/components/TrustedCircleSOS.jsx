/**
 * src/components/TrustedCircleSOS.jsx
 *
 * MODULE: TRUSTED CONTACT POOL + SOS
 * Features:
 * 1. Add, edit, delete contacts with Name, Relationship, Phone number.
 * 2. Multi-contact selection for SOS alerts.
 * 3. Validation for required inputs & phone formats.
 * 4. LocalStorage persistence (sphere_trusted_contacts).
 * 5. SOS Alert Preview generation with distress message, timestamp, contact names,
 *    and on-demand Geolocation (Google Maps URL).
 * 6. System share sheet (navigator.share), WhatsApp (wa.me) fallback, clipboard copy.
 * 7. Transparent unverified delivery notice (Never claims "SOS sent successfully").
 * 8. India 112 emergency reminder with direct tel: link.
 */

import { useState, useEffect } from 'react';
import './TrustedCircleSOS.css';

const STORAGE_KEY = 'sphere_trusted_contacts';

const RELATIONSHIP_OPTIONS = [
  'Parent / Guardian',
  'Sibling',
  'Friend',
  'Partner / Spouse',
  'Colleague',
  'Neighbor',
  'Other Trusted Person',
];

export default function TrustedCircleSOS() {
  const [contacts, setContacts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedContactIds, setSelectedContactIds] = useState([]);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', relationship: 'Friend', phone: '' });
  const [formError, setFormError] = useState('');

  // SOS Alert states
  const [isLocating, setIsLocating] = useState(false);
  const [locationCoords, setLocationCoords] = useState(null);
  const [locationNote, setLocationNote] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [alertPayload, setAlertPayload] = useState(null);
  const [actionFeedback, setActionFeedback] = useState('');

  // Persist contacts
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, [contacts]);

  // Keep selected contacts in sync if contacts are removed
  useEffect(() => {
    const existingIds = new Set(contacts.map(c => c.id));
    setSelectedContactIds(prev => prev.filter(id => existingIds.has(id)));
  }, [contacts]);

  const validatePhone = (phone) => {
    const cleaned = phone.replace(/[\s\-()]/g, '');
    // Allow +91 or other international codes, or standard 10-digit Indian mobile
    return /^(?:\+?\d{1,4})?[6-9]\d{9}$|^\+?\d{7,15}$/.test(cleaned);
  };

  const handleOpenAddForm = () => {
    setEditingId(null);
    setFormData({ name: '', relationship: 'Friend', phone: '' });
    setFormError('');
    setShowAddForm(true);
  };

  const handleOpenEdit = (contact) => {
    setEditingId(contact.id);
    setFormData({ name: contact.name, relationship: contact.relationship, phone: contact.phone });
    setFormError('');
    setShowAddForm(true);
  };

  const handleSaveContact = (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = formData.name.trim();
    const trimmedPhone = formData.phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Please enter a valid name (at least 2 characters).');
      return;
    }

    if (!trimmedPhone || !validatePhone(trimmedPhone)) {
      setFormError('Please enter a valid phone number (e.g. +91 98765 43210 or 10-digit mobile number).');
      return;
    }

    if (editingId) {
      setContacts(prev => prev.map(c => c.id === editingId ? {
        ...c,
        name: trimmedName,
        relationship: formData.relationship,
        phone: trimmedPhone,
        updatedAt: new Date().toISOString()
      } : c));
    } else {
      const newContact = {
        id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: trimmedName,
        relationship: formData.relationship,
        phone: trimmedPhone,
        createdAt: new Date().toISOString()
      };
      setContacts(prev => [...prev, newContact]);
      // Auto-select newly added contact
      setSelectedContactIds(prev => [...prev, newContact.id]);
    }

    setShowAddForm(false);
    setEditingId(null);
    setFormData({ name: '', relationship: 'Friend', phone: '' });
  };

  const handleDeleteContact = (id) => {
    if (window.confirm('Remove this contact from your Trusted Circle?')) {
      setContacts(prev => prev.filter(c => c.id !== id));
      setSelectedContactIds(prev => prev.filter(selectedId => selectedId !== id));
    }
  };

  const toggleSelectContact = (id) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedContactIds.length === contacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(contacts.map(c => c.id));
    }
  };

  // SOS Alert Preparation
  const handleInitiateSOS = () => {
    setActionFeedback('');
    if (contacts.length === 0) {
      setActionFeedback('Add at least one trusted contact before preparing an SOS alert.');
      return;
    }
    if (selectedContactIds.length === 0) {
      setActionFeedback('Select at least one trusted contact from your circle to include in this alert.');
      return;
    }

    setIsLocating(true);
    setLocationNote('Requesting browser location permission...');

    const buildAlert = (coords = null, locMsg = '') => {
      const selectedContacts = contacts.filter(c => selectedContactIds.includes(c.id));
      const now = new Date();
      const timeStr = now.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const recipientNames = selectedContacts.map(c => c.name).join(', ');
      const mapUrl = coords ? `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}` : '';

      let textMessage = `🚨 EMERGENCY SOS ALERT — I need immediate assistance.\n\n`;
      textMessage += `Intended for: ${recipientNames}\n`;
      textMessage += `Time of Alert: ${timeStr}\n\n`;
      if (coords) {
        textMessage += `📍 My Current Location: ${mapUrl}\n`;
        textMessage += `Coordinates: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}\n\n`;
      } else {
        textMessage += `📍 Location: ${locMsg || 'Location unavailable or permission denied'}\n\n`;
      }
      textMessage += `Please reach out to me immediately. If you cannot contact me, call India's emergency services at 112.\n(Generated via SPHERe Personal Safety)`;

      setAlertPayload({
        text: textMessage,
        mapUrl,
        timestamp: timeStr,
        coords,
        selectedContacts,
        locationNote: locMsg,
      });
      setIsLocating(false);
      setShowPreviewModal(true);
    };

    if (!navigator.geolocation) {
      setLocationNote('Geolocation is not supported by your browser.');
      buildAlert(null, 'Geolocation unsupported on this browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setLocationCoords(coords);
        setLocationNote(`Location locked (accurate to ±${Math.round(pos.coords.accuracy)}m)`);
        buildAlert(coords, 'Live GPS coordinates captured');
      },
      (err) => {
        let errDesc = 'Location permission denied by user.';
        if (err.code === 2) errDesc = 'Location position unavailable.';
        if (err.code === 3) errDesc = 'Location request timed out.';
        setLocationNote(errDesc);
        buildAlert(null, errDesc);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  };

  // Sharing Actions
  const handleSystemShare = async () => {
    if (!alertPayload) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SPHERe SOS Emergency Alert',
          text: alertPayload.text,
          url: alertPayload.mapUrl || undefined,
        });
        setActionFeedback('Share dialog opened. Complete the send inside your chosen app.');
      } catch (err) {
        if (err.name !== 'AbortError') {
          handleClipboardCopy();
        }
      }
    } else {
      handleClipboardCopy();
    }
  };

  const handleWhatsAppShare = () => {
    if (!alertPayload) return;
    const encoded = encodeURIComponent(alertPayload.text);
    // If a single contact is selected, pre-fill their cleaned number
    let waUrl = `https://wa.me/?text=${encoded}`;
    if (alertPayload.selectedContacts.length === 1) {
      const cleanPhone = alertPayload.selectedContacts[0].phone.replace(/[^\d]/g, '');
      waUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    setActionFeedback('WhatsApp link opened. Remember: You must press SEND in WhatsApp; it is not sent automatically.');
  };

  const handleClipboardCopy = async () => {
    if (!alertPayload) return;
    try {
      await navigator.clipboard.writeText(alertPayload.text);
      setActionFeedback('Alert message copied to clipboard! Paste it into your SMS, messaging, or chat app.');
    } catch {
      setActionFeedback('Could not copy automatically. You can copy the message text manually from the box below.');
    }
  };

  return (
    <div className="trusted-circle-module">
      {/* 112 Direct Hotline Banner */}
      <div className="emergency-banner">
        <div className="emergency-banner-content">
          <div className="card-kicker">NATIONAL EMERGENCY HELPLINE · INDIA</div>
          <h2>Immediate Danger? Call 112</h2>
          <p>
            Dial <strong>112</strong> right away if your physical safety is in jeopardy.
            Local police, medical, and fire units respond directly. Do not wait for digital messages.
          </p>
        </div>
        <a className="call-emergency-btn" href="tel:112" aria-label="Call national emergency number 112">
          <span>☎</span> Call 112 Now
        </a>
      </div>

      {/* Main Feature Layout */}
      <div className="tc-grid">
        {/* Left Column: Trusted Contacts Pool */}
        <div className="tool-main-card">
          <div className="card-kicker">01 / TRUSTED CIRCLE POOL</div>
          <div className="tc-header-row">
            <div>
              <h2>Your Trusted Contacts</h2>
              <p className="card-description">
                Stored privately in your browser. Select which contacts to include when dispatching an SOS.
              </p>
            </div>
            <button
              className="primary-button add-contact-btn"
              onClick={handleOpenAddForm}
              type="button"
            >
              + Add Contact
            </button>
          </div>

          {/* Add / Edit Form Modal / Dropdown */}
          {showAddForm && (
            <form className="contact-form-card" onSubmit={handleSaveContact}>
              <h4>{editingId ? 'Edit Trusted Contact' : 'Add New Trusted Contact'}</h4>
              <div className="form-fields">
                <div className="form-group">
                  <label htmlFor="contact-name">Full Name *</label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    placeholder="e.g. Ananya Sen"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="contact-relationship">Relationship *</label>
                  <select
                    id="contact-relationship"
                    value={formData.relationship}
                    onChange={e => setFormData({ ...formData, relationship: e.target.value })}
                  >
                    {RELATIONSHIP_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="contact-phone">Phone Number *</label>
                  <input
                    id="contact-phone"
                    type="tel"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              {formError && <p className="error" role="alert">{formError}</p>}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  {editingId ? 'Save Changes' : 'Add to Circle'}
                </button>
              </div>
            </form>
          )}

          {/* Contact List */}
          {contacts.length === 0 ? (
            <div className="empty-contacts-state">
              <span className="empty-icon">👥</span>
              <h3>No Trusted Contacts Added Yet</h3>
              <p>
                Add 1 or more friends, relatives, or neighbors. Their details remain strictly on this device
                and will be prepared when you initiate an SOS alert.
              </p>
              <button
                className="secondary-button"
                onClick={handleOpenAddForm}
                type="button"
              >
                Add First Contact
              </button>
            </div>
          ) : (
            <div className="contacts-list-container">
              <div className="select-all-bar">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedContactIds.length === contacts.length && contacts.length > 0}
                    onChange={toggleSelectAll}
                  />
                  <span>Select All ({selectedContactIds.length}/{contacts.length} for SOS)</span>
                </label>
                <span className="privacy-badge">🔒 Stored in browser localStorage</span>
              </div>

              <div className="contact-cards-list">
                {contacts.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <div
                      key={contact.id}
                      className={`contact-item-card ${isSelected ? 'selected' : ''}`}
                    >
                      <label className="contact-checkbox-wrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectContact(contact.id)}
                          aria-label={`Select ${contact.name} for SOS`}
                        />
                      </label>
                      <div className="contact-info">
                        <div className="contact-name-row">
                          <strong>{contact.name}</strong>
                          <span className="rel-tag">{contact.relationship}</span>
                        </div>
                        <div className="contact-phone-row">
                          <span>{contact.phone}</span>
                          <a
                            href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                            className="quick-call-link"
                            title={`Call ${contact.name}`}
                          >
                            📞 Direct Call
                          </a>
                        </div>
                      </div>
                      <div className="contact-actions">
                        <button
                          type="button"
                          className="action-icon-btn"
                          onClick={() => handleOpenEdit(contact)}
                          title="Edit contact"
                          aria-label="Edit contact"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn delete-btn"
                          onClick={() => handleDeleteContact(contact.id)}
                          title="Delete contact"
                          aria-label="Delete contact"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: SOS Trigger & Guide */}
        <div className="tool-main-card sos-dispatch-card">
          <div className="card-kicker">02 / EMERGENCY SOS DISPATCH</div>
          <h2>Prepare Emergency SOS</h2>
          <p className="card-description">
            Pressing SOS captures your current GPS coordinates (with your permission) and compiles an actionable distress alert.
          </p>

          <div className="sos-action-box">
            <div className="sos-status-summary">
              <span className="sos-indicator-dot" />
              <span>
                {selectedContactIds.length > 0
                  ? `${selectedContactIds.length} contact(s) selected for SOS`
                  : 'No contacts selected yet'}
              </span>
            </div>

            <button
              type="button"
              className="sos-big-button"
              onClick={handleInitiateSOS}
              disabled={isLocating}
            >
              <span className="sos-icon">🚨</span>
              <span className="sos-btn-title">
                {isLocating ? 'Locating device...' : 'TRIGGER SOS ALERT'}
              </span>
              <span className="sos-btn-sub">Opens alert review before sharing</span>
            </button>

            {locationNote && (
              <p className="location-hint">
                <span className="location-pin-icon">📍</span> {locationNote}
              </p>
            )}

            {actionFeedback && (
              <div className="feedback-banner" role="status">
                <span className="feedback-icon">ℹ</span>
                <p>{actionFeedback}</p>
              </div>
            )}
          </div>

          <div className="sos-protocol-info">
            <h4>Safety & Verification Notice</h4>
            <ul>
              <li>
                <strong>No False Confirmations:</strong> Triggering or opening a share sheet does <em>not</em> confirm message delivery. Always confirm via phone call if in peril.
              </li>
              <li>
                <strong>No Silent Background Tracking:</strong> Location is fetched only when you press this button, never continuously recorded in the background.
              </li>
              <li>
                <strong>Offline Resilient:</strong> Works even with low cellular bandwidth via standard SMS or WhatsApp text.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* SOS Alert Preview Modal */}
      {showPreviewModal && alertPayload && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-alert-title">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="alert-badge">EMERGENCY PREVIEW</span>
                <h3 id="modal-alert-title">Review SOS Distress Message</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowPreviewModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="recipients-summary">
                <strong>Intended Recipients:</strong>{' '}
                {alertPayload.selectedContacts.map(c => `${c.name} (${c.relationship})`).join(', ')}
              </div>

              <div className="alert-preview-box">
                <label htmlFor="sos-text-display">Prepared Alert Content</label>
                <textarea
                  id="sos-text-display"
                  readOnly
                  rows={8}
                  value={alertPayload.text}
                />
              </div>

              <div className="delivery-warning-box">
                <span className="warning-symbol">⚠️</span>
                <div>
                  <strong>Important Delivery Notice</strong>
                  <p>
                    Opening WhatsApp or the system share sheet transfers this message to your device app.
                    <strong> It is NOT automatically delivered until you tap send inside that app.</strong>
                  </p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowPreviewModal(false)}
              >
                Back to Edit
              </button>

              <button
                type="button"
                className="whatsapp-button"
                onClick={handleWhatsAppShare}
              >
                Share via WhatsApp <span>↗</span>
              </button>

              {typeof navigator !== 'undefined' && 'share' in navigator ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSystemShare}
                >
                  Share via System / Apps <span>↗</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleClipboardCopy}
                >
                  Copy Message Text
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
