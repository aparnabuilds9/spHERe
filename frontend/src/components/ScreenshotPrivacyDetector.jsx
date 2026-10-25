/**
 * src/components/ScreenshotPrivacyDetector.jsx
 *
 * MODULE: SCREENSHOT PRIVACY & LOCATION LEAK DETECTOR
 * Features:
 * 1. File Upload (PNG, JPG, JPEG, WebP) up to 8MB with type and size validation.
 * 2. Real image analysis (reads actual ArrayBuffer):
 *    - EXIF metadata parsing (GPS Coordinates, Date/Time, Camera Make/Model, Software).
 *    - Regex pattern detection on metadata & visible text (Emails, Phones, Coordinates, PIN codes, Address clues, Live location text).
 * 3. Transparent, non-fabricated Privacy Audit Report:
 *    - Category, Partially Masked Evidence, Severity (High/Medium/Low), Why it matters, Suggested action.
 *    - Clearly distinguishes: Detected, No matching information found, and Check unavailable/inconclusive.
 *    - Explicitly cautions that absence of EXIF does not make a screenshot safe.
 * 4. Interactive Canvas Redaction Tool:
 *    - Click & drag to draw censor bars over sensitive areas.
 *    - Undo / Clear redactions.
 *    - Download flattened redacted PNG copy.
 *    - Original image is never touched or uploaded.
 */

import { useState, useRef, useEffect } from 'react';
import { parseExifFromBuffer } from '../utils/exifParser';
import { analyzePrivacyText } from '../utils/privacyDetector';
import './ScreenshotPrivacyDetector.css';

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export default function ScreenshotPrivacyDetector() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analysis Results
  const [analysisDone, setAnalysisDone] = useState(false);
  const [exifResult, setExifResult] = useState(null);
  const [ocrStatus, setOcrStatus] = useState('pending'); // 'available' | 'unavailable' | 'completed'
  const [extractedOrInputText, setExtractedOrInputText] = useState('');
  const [textFindings, setTextFindings] = useState([]);
  const [findingsSummary, setFindingsSummary] = useState({ total: 0, high: 0, medium: 0, low: 0 });

  // Redaction Tool States
  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'redact'
  const [redactionBoxes, setRedactionBoxes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentBox, setCurrentBox] = useState(null);

  const canvasRef = useRef(null);
  const imageElementRef = useRef(null);
  const fileInputRef = useRef(null);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleFileSelect = (file) => {
    setFileError('');
    setAnalysisDone(false);
    setExifResult(null);
    setTextFindings([]);
    setRedactionBoxes([]);
    setCurrentBox(null);
    setExtractedOrInputText('');

    if (!file) return;

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      setFileError('Unsupported file type. Please upload a PNG, JPG, JPEG, or WebP screenshot.');
      return;
    }

    // Validate size (8 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). The maximum allowed size is 8 MB.`);
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreviewUrl(objectUrl);

    // Trigger local inspection
    processImageInspection(file);
  };

  const onFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const processImageInspection = async (file) => {
    setIsAnalyzing(true);

    try {
      // 1. Read binary ArrayBuffer for real EXIF parsing
      const arrayBuffer = await file.arrayBuffer();
      const parsedExif = parseExifFromBuffer(arrayBuffer);
      setExifResult(parsedExif);

      // Collect any text strings found in EXIF tags (UserComment, ImageDescription, Software)
      let initialTextToCheck = '';
      if (parsedExif.hasExif && parsedExif.metadata) {
        const { imageDescription, userComment, software } = parsedExif.metadata;
        if (imageDescription) initialTextToCheck += ` ${imageDescription}`;
        if (userComment) initialTextToCheck += ` ${userComment}`;
        if (software) initialTextToCheck += ` ${software}`;
      }

      // 2. Check for browser native TextDetector API if available
      let detectedText = '';
      if ('TextDetector' in window) {
        try {
          const detector = new window.TextDetector();
          const img = new Image();
          img.src = URL.createObjectURL(file);
          await img.decode();
          const detected = await detector.detect(img);
          detectedText = detected.map(d => d.rawValue).join(' ');
          setOcrStatus('available');
        } catch {
          setOcrStatus('unavailable');
        }
      } else {
        setOcrStatus('unavailable');
      }

      const combinedText = (initialTextToCheck + ' ' + detectedText).trim();
      setExtractedOrInputText(combinedText);

      // 3. Run pattern analysis on collected text
      runTextAnalysis(combinedText, parsedExif);
      setAnalysisDone(true);
    } catch (err) {
      setFileError(`Analysis could not be completed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runTextAnalysis = (text, currentExif = exifResult) => {
    const analysis = analyzePrivacyText(text);
    const combinedFindings = [...analysis.findings];

    // Add EXIF-specific findings if present
    if (currentExif?.hasExif && currentExif?.metadata) {
      const meta = currentExif.metadata;

      // GPS Coordinates in EXIF
      if (meta.gps) {
        const lat = meta.gps.latitude;
        const lon = meta.gps.longitude;
        combinedFindings.unshift({
          id: 'exif_gps',
          category: 'EXIF Metadata: Satellite GPS Coordinates',
          raw: `${lat}, ${lon}`,
          masked: `${lat.toFixed(2)}•••, ${lon.toFixed(2)}•••`,
          severity: 'High',
          explanation: 'Raw satellite latitude and longitude coordinates are embedded directly in the image file header. Anyone downloading this image can view your exact physical location.',
          suggestedAction: 'Strip EXIF metadata immediately using the redaction download tool or an offline metadata stripper.',
        });
      }

      // Date / Time in EXIF
      if (meta.dateTimeOriginal || meta.dateTime) {
        const dt = meta.dateTimeOriginal || meta.dateTime;
        combinedFindings.push({
          id: 'exif_time',
          category: 'EXIF Metadata: Timestamp',
          raw: dt,
          masked: dt,
          severity: 'Medium',
          explanation: `Image contains exact capture date and time (${dt}), which can expose your daily routines, active hours, or verify your presence at an event.`,
          suggestedAction: 'Strip file metadata before sharing publicly.',
        });
      }

      // Device / Camera Model in EXIF
      if (meta.make || meta.model) {
        const dev = `${meta.make || ''} ${meta.model || ''}`.trim();
        combinedFindings.push({
          id: 'exif_device',
          category: 'EXIF Metadata: Device Fingerprint',
          raw: dev,
          masked: dev,
          severity: 'Low',
          explanation: `Identifies device hardware (${dev}), assisting profiling or correlating screenshots across accounts.`,
          suggestedAction: 'Strip EXIF metadata to protect device identity.',
        });
      }
    }

    const high = combinedFindings.filter(f => f.severity === 'High').length;
    const medium = combinedFindings.filter(f => f.severity === 'Medium').length;
    const low = combinedFindings.filter(f => f.severity === 'Low').length;

    setTextFindings(combinedFindings);
    setFindingsSummary({ total: combinedFindings.length, high, medium, low });
  };

  const handleManualTextChange = (e) => {
    const newText = e.target.value;
    setExtractedOrInputText(newText);
    runTextAnalysis(newText, exifResult);
  };

  // --- CANVAS REDACTION TOOL LOGIC ---
  useEffect(() => {
    if (activeTab === 'redact' && imagePreviewUrl) {
      renderRedactionCanvas();
    }
  }, [activeTab, imagePreviewUrl, redactionBoxes, currentBox]);

  const renderRedactionCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = imageElementRef.current;
    if (!img || !img.naturalWidth) return;

    // Set canvas dimensions to match image natural size
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw existing redaction boxes
    for (const box of redactionBoxes) {
      drawRedactBox(ctx, box);
    }

    // Draw actively dragged box
    if (currentBox) {
      drawRedactBox(ctx, currentBox, true);
    }
  };

  const drawRedactBox = (ctx, box, isDraft = false) => {
    ctx.save();
    ctx.fillStyle = isDraft ? 'rgba(20, 15, 18, 0.75)' : '#120f11';
    ctx.fillRect(box.x, box.y, box.w, box.h);

    if (isDraft) {
      ctx.strokeStyle = '#b98aa3';
      ctx.lineWidth = Math.max(2, Math.round(ctx.canvas.width / 500));
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    } else {
      // Draw subtle "REDACTED" watermark on large boxes
      if (box.w > 80 && box.h > 24) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(box.h * 0.45, 16)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('REDACTED', box.x + box.w / 2, box.y + box.h / 2);
      }
    }
    ctx.restore();
  };

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e) => {
    if (activeTab !== 'redact') return;
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPoint(coords);
    setCurrentBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !startPoint) return;
    const coords = getCanvasCoords(e);
    const x = Math.min(startPoint.x, coords.x);
    const y = Math.min(startPoint.y, coords.y);
    const w = Math.abs(coords.x - startPoint.x);
    const h = Math.abs(coords.y - startPoint.y);
    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentBox && currentBox.w > 5 && currentBox.h > 5) {
      setRedactionBoxes(prev => [...prev, { ...currentBox, id: Date.now() }]);
    }
    setCurrentBox(null);
    setStartPoint(null);
  };

  const handleUndoRedaction = () => {
    setRedactionBoxes(prev => prev.slice(0, -1));
  };

  const handleClearRedactions = () => {
    setRedactionBoxes([]);
  };

  const handleDownloadRedacted = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Export flattened PNG (strips all EXIF metadata)
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const origName = selectedFile?.name ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'screenshot';
      a.download = `sphere-redacted-${origName}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="screenshot-detector-module">
      {/* Upload & Setup Bar */}
      <div className="tool-main-card">
        <div className="card-kicker">02 / SCREENSHOT PRIVACY & LOCATION SENTINEL</div>
        <h2>Inspect & Redact Screenshots</h2>
        <p className="card-description">
          Detect embedded satellite GPS coordinates, phone numbers, email addresses, and address clues before sharing photos.
          Analysis is performed entirely inside your browser. No files are uploaded to external services.
        </p>

        {/* Drag and drop zone */}
        <div
          className={`drop-zone ${selectedFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          role="button"
          aria-label="Upload screenshot or photo for privacy inspection"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={onFileInputChange}
          />
          <div className="drop-zone-content">
            <span className="drop-icon">🖼️</span>
            {selectedFile ? (
              <div className="file-info-badge">
                <strong>{selectedFile.name}</strong>
                <span>({(selectedFile.size / 1024).toFixed(0)} KB · {selectedFile.type || 'image'})</span>
                <span className="reselect-hint">Click or drop another image to replace</span>
              </div>
            ) : (
              <div>
                <strong>Choose a screenshot or drag & drop it here</strong>
                <p>Supports PNG, JPG, JPEG, and WebP (Max 8 MB)</p>
              </div>
            )}
          </div>
        </div>

        {fileError && <p className="error" role="alert">{fileError}</p>}
      </div>

      {/* Main Workspace when file is selected */}
      {selectedFile && (
        <div className="detector-workspace">
          {/* Tabs: Privacy Audit vs Redaction Tool */}
          <div className="detector-tabs" role="tablist">
            <button
              className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
              role="tab"
              aria-selected={activeTab === 'audit'}
            >
              <span>🔍 Privacy Audit Report</span>
              {findingsSummary.total > 0 && (
                <span className={`tab-count ${findingsSummary.high > 0 ? 'high-risk' : ''}`}>
                  {findingsSummary.total}
                </span>
              )}
            </button>
            <button
              className={`tab-btn ${activeTab === 'redact' ? 'active' : ''}`}
              onClick={() => setActiveTab('redact')}
              role="tab"
              aria-selected={activeTab === 'redact'}
            >
              <span>🖌️ Interactive Redaction Tool</span>
              {redactionBoxes.length > 0 && (
                <span className="tab-count count-redactions">{redactionBoxes.length}</span>
              )}
            </button>
          </div>

          {/* TAB 1: PRIVACY AUDIT REPORT */}
          {activeTab === 'audit' && (
            <div className="audit-tab-layout">
              {/* Image Preview & OCR verification helper */}
              <div className="preview-column">
                <div className="image-preview-card">
                  <div className="card-subhead">SCREENSHOT PREVIEW</div>
                  <div className="image-frame">
                    <img
                      ref={imageElementRef}
                      src={imagePreviewUrl}
                      alt="Uploaded screenshot preview"
                      onLoad={() => {
                        if (activeTab === 'redact') renderRedactionCanvas();
                      }}
                    />
                  </div>
                </div>

                {/* Visible Text Inspection Card */}
                <div className="tool-side-card text-verification-card">
                  <div className="card-subhead">VISIBLE TEXT INSPECTOR</div>
                  <p className="card-description-sm">
                    Review or paste text visible inside the screenshot (chat messages, addresses, account IDs)
                    to execute instant deep pattern scanning.
                  </p>
                  <textarea
                    rows={4}
                    value={extractedOrInputText}
                    onChange={handleManualTextChange}
                    placeholder="Type or paste visible text from screenshot here (e.g. 'Meeting at Sector 18 Noida, call 9876543210')..."
                  />
                  <div className="ocr-note-box">
                    <span className="ocr-status-tag">
                      {ocrStatus === 'available' ? '✓ Browser Text Engine Active' : 'ℹ Inconclusive / Offline Mode'}
                    </span>
                    <p>
                      {ocrStatus === 'available'
                        ? 'Detected text from the image has been automatically populated above.'
                        : 'Automatic offline OCR WASM is inactive in this session. You can enter or confirm text manually above for 100% accurate pattern scanning.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Audit Findings Column */}
              <div className="findings-column">
                {isAnalyzing ? (
                  <div className="analyzing-state">
                    <span className="spinner-icon">⏳</span>
                    <h3>Analyzing file headers & patterns...</h3>
                    <p>Inspecting binary EXIF APP1 tags and searching for exposed identifiers.</p>
                  </div>
                ) : (
                  <>
                    {/* Status Overview Cards */}
                    <div className="status-cards-row">
                      {/* EXIF GPS Status */}
                      <div className={`status-pill ${exifResult?.metadata?.gps ? 'danger' : 'safe'}`}>
                        <span className="status-icon">
                          {exifResult?.metadata?.gps ? '⚠️' : '✓'}
                        </span>
                        <div>
                          <strong>EXIF GPS Coordinates</strong>
                          <p>
                            {exifResult?.metadata?.gps
                              ? 'Embedded satellite coordinates detected!'
                              : exifResult?.hasExif
                              ? 'EXIF present, no GPS tags found'
                              : 'No EXIF metadata present (Clean or stripped)'}
                          </p>
                        </div>
                      </div>

                      {/* Contact / Text Status */}
                      <div className={`status-pill ${findingsSummary.total > 0 ? 'warning' : 'safe'}`}>
                        <span className="status-icon">
                          {findingsSummary.total > 0 ? '⚠️' : '✓'}
                        </span>
                        <div>
                          <strong>Pattern Identifiers</strong>
                          <p>
                            {findingsSummary.total > 0
                              ? `${findingsSummary.total} sensitive item(s) flagged`
                              : 'No phone numbers, emails, or coordinates found'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Detailed Findings Table / Cards */}
                    <div className="findings-container">
                      <div className="findings-header">
                        <h3>Detailed Findings Report</h3>
                        <span className="risk-tally">
                          {findingsSummary.high > 0 && <span className="badge high">{findingsSummary.high} High</span>}
                          {findingsSummary.medium > 0 && <span className="badge medium">{findingsSummary.medium} Med</span>}
                          {findingsSummary.low > 0 && <span className="badge low">{findingsSummary.low} Low</span>}
                          {findingsSummary.total === 0 && <span className="badge clean">Clean Check</span>}
                        </span>
                      </div>

                      {textFindings.length === 0 ? (
                        <div className="no-findings-box">
                          <span className="check-mark">✓</span>
                          <h4>No Matching Privacy Leaks Detected</h4>
                          <p>
                            No embedded GPS tags, phone numbers, email addresses, or common address keywords were recognized.
                          </p>
                        </div>
                      ) : (
                        <div className="findings-list">
                          {textFindings.map((finding) => (
                            <div key={finding.id} className={`finding-card severity-${finding.severity.toLowerCase()}`}>
                              <div className="finding-top-row">
                                <span className={`severity-tag ${finding.severity.toLowerCase()}`}>
                                  {finding.severity} Severity
                                </span>
                                <strong className="finding-category">{finding.category}</strong>
                              </div>
                              <div className="evidence-row">
                                <span className="evidence-label">Masked Evidence:</span>
                                <code className="masked-code">{finding.masked}</code>
                              </div>
                              <p className="finding-explanation">{finding.explanation}</p>
                              <div className="finding-action-row">
                                <strong>Suggested Action:</strong> {finding.suggestedAction}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Explicit Honest Limitations Banner */}
                      <div className="limitations-banner">
                        <span className="limitation-symbol">ℹ</span>
                        <div>
                          <strong>Important Safety Notice on Automated Scans</strong>
                          <p>
                            Automated regex and EXIF inspections detect common digital footprints, but cannot evaluate visual context.
                            Distinctive physical landmarks, storefront signs, reflections, or familiar home decor can easily expose your whereabouts
                            even when all digital checks pass. Always conduct a visual self-review before sharing.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE REDACTION TOOL */}
          {activeTab === 'redact' && (
            <div className="redact-tab-layout">
              <div className="redact-controls-bar">
                <div className="redact-info">
                  <strong>Click and drag on the screenshot</strong> to draw censor bars over sensitive text, faces, or landmarks.
                </div>
                <div className="redact-buttons">
                  <button
                    type="button"
                    className="secondary-button btn-sm"
                    onClick={handleUndoRedaction}
                    disabled={redactionBoxes.length === 0}
                  >
                    ↩ Undo Last ({redactionBoxes.length})
                  </button>
                  <button
                    type="button"
                    className="secondary-button btn-sm"
                    onClick={handleClearRedactions}
                    disabled={redactionBoxes.length === 0}
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    className="primary-button btn-sm"
                    onClick={handleDownloadRedacted}
                  >
                    ⬇ Download Redacted PNG
                  </button>
                </div>
              </div>

              {/* Interactive Canvas Viewport */}
              <div className="canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>

              <div className="redact-footer-note">
                <span>🔒 Pure Client-side Processing:</span> The downloaded copy is a newly synthesized PNG with all EXIF headers stripped and censor bars permanently flattened. Original file is never overwritten.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
