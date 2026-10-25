import re
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator


APP_VERSION = "0.2.0"

app = FastAPI(
    title="SPHERe Safety Assistant",
    description=(
        "An explainable prototype for digital and physical safety support."
    ),
    version=APP_VERSION,
)

# Supports Vite on either common local hostname.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class SafetyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    category: Literal["auto", "physical", "digital"] = "auto"

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Please enter a message to analyze.")
        return value


class PrivacyAnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Please provide text to analyze.")
        return value


# Each rule has a stable key, user-facing label, severity and phrases.
# These are transparent rules, not a trained ML model.
DIGITAL_RULES = [
    {
        "key": "credential_request",
        "label": "Request for passwords or OTPs",
        "severity": "high",
        "phrases": [
            "share your password",
            "send your password",
            "enter your password",
            "share otp",
            "send otp",
            "tell me your otp",
            "verification code",
            "login credentials",
        ],
    },
    {
        "key": "urgent_payment",
        "label": "Urgent or pressured payment request",
        "severity": "medium",
        "phrases": [
            "send money",
            "urgent payment",
            "pay immediately",
            "transfer money now",
            "account will be blocked",
            "payment is overdue",
            "act immediately",
        ],
    },
    {
        "key": "threat_or_blackmail",
        "label": "Threat, blackmail or image-abuse language",
        "severity": "high",
        "phrases": [
            "i will hurt you",
            "i know where you live",
            "i will leak your photos",
            "i will share your photos",
            "i will post your photos",
            "send me photos or else",
            "do what i say or else",
            "i will expose you",
        ],
    },
    {
        "key": "impersonation_or_secrecy",
        "label": "Possible impersonation or secrecy pressure",
        "severity": "medium",
        "phrases": [
            "i am from your bank",
            "i am customer support",
            "keep this secret",
            "do not tell anyone",
            "don't tell anyone",
            "pretend to be",
        ],
    },
]

URL_PATTERN = re.compile(
    r"(?i)\b(?:https?://|www\.)[^\s<>'\"]+"
    r"|\b[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:/[^\s<>'\"]*)?"
)

SHORTENER_DOMAINS = {
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "is.gd",
    "cutt.ly",
    "rb.gy",
    "shorturl.at",
}

INDIAN_PHONE_REGEX = re.compile(r"(?<!\w)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\w)")
GENERAL_PHONE_REGEX = re.compile(r"(?<!\w)(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\w)")
EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
COORD_DECIMAL_REGEX = re.compile(
    r"[-+]?(?:[1-8]?\d(?:\.\d{3,8})|90(?:\.0{3,8})?)[,\s]+[-+]?(?:180(?:\.0{3,8})?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d{3,8}))"
)
PIN_CODE_REGEX = re.compile(r"(?<!\w)(?:PIN|Pin\s*Code|Postal\s*Code|Pincode)?[\s:]*([1-9][0-9]{2}\s?[0-9]{3})(?!\w)", re.I)

ADDRESS_KEYWORDS = [
    "road", "marg", "street", "nagar", "colony", "sector", "block", "phase",
    "chowk", "lane", "gali", "vihar", "enclave", "society", "apartment",
    "flat no", "house no", "near", "opposite", "behind", "beside"
]


def mask_str(value: str, keep_start: int = 3, keep_end: int = 2) -> str:
    v = value.strip()
    if len(v) <= keep_start + keep_end:
        return "•" * len(v)
    return f"{v[:keep_start]}{'•' * (len(v) - keep_start - keep_end)}{v[-keep_end:]}"


def mask_phone(phone: str) -> str:
    cleaned = phone.strip()
    if len(cleaned) <= 4:
        return "••••"
    prefix = cleaned[: min(4, len(cleaned) - 4)]
    suffix = cleaned[-2:]
    return f"{prefix}{'•' * (len(cleaned) - len(prefix) - len(suffix))}{suffix}"


def mask_email(email: str) -> str:
    parts = email.strip().split("@")
    if len(parts) != 2:
        return "••••@••••"
    u, d = parts
    masked_u = f"{u[:2]}{'•' * max(3, len(u) - 2)}" if len(u) > 2 else f"{u[:1]}•••"
    return f"{masked_u}@{d}"


def extract_urls(text: str) -> list[str]:
    """Extract URLs for local analysis; never fetch or open them."""
    return URL_PATTERN.findall(text)


def get_domain(url: str) -> str:
    candidate = url.strip().rstrip(".,!?;:)")
    if candidate.lower().startswith("www."):
        candidate = "https://" + candidate
    elif not candidate.lower().startswith(("http://", "https://")):
        candidate = "https://" + candidate

    try:
        return (urlparse(candidate).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def analyze_digital_text(message: str) -> dict:
    text = " ".join(message.lower().split())
    findings = []
    signals = {}

    for rule in DIGITAL_RULES:
        matched = any(phrase in text for phrase in rule["phrases"])
        signals[rule["key"]] = matched

        if matched:
            findings.append({
                "key": rule["key"],
                "label": rule["label"],
                "severity": rule["severity"],
                "evidence": "A configured warning phrase was found.",
            })

    urls = extract_urls(message)
    domains = [get_domain(url) for url in urls]
    suspicious_domains = sorted({
        domain for domain in domains
        if domain in SHORTENER_DOMAINS
    })

    signals["contains_link"] = bool(urls)
    signals["known_shortener_detected"] = bool(suspicious_domains)

    if suspicious_domains:
        findings.append({
            "key": "shortened_link",
            "label": "Link uses a known URL-shortening service",
            "severity": "medium",
            "evidence": (
                "A shortened link can hide its destination; "
                "this alone does not prove the link is malicious."
            ),
        })

    # This is a conservative heuristic, not a verdict on a message.
    high_count = sum(
        item["severity"] == "high" for item in findings
    )
    medium_count = sum(
        item["severity"] == "medium" for item in findings
    )

    if high_count:
        risk_level = "high"
        assessment = "Important warning signs detected"
    elif medium_count:
        risk_level = "medium"
        assessment = "Some warning signs detected"
    else:
        risk_level = "undetermined"
        assessment = "No configured warning patterns detected"

    advice = [
        "Never share passwords, OTPs, or verification codes with unverified contacts.",
        "Verify payment or account requests using an independent, trusted channel.",
        "Inspect a link's destination before opening it; do not enter credentials on an unverified site.",
        "A message can be harmful even when this prototype detects no warning signs.",
    ]

    if signals.get("threat_or_blackmail"):
        advice.insert(
            0,
            "Consider preserving relevant messages and seeking help from a trusted person. "
            "If you are in immediate danger, contact local emergency services.",
        )

    return {
        "analysis_type": "rule_based",
        "risk_level": risk_level,
        "assessment": assessment,
        "signals": signals,
        "findings": [item["label"] for item in findings],
        "detailed_findings": findings,
        "advice": advice,
        "link_count": len(urls),
        "shortener_domains": suspicious_domains,
        "limitation": (
            "This prototype uses configured text rules, not a trained AI model. "
            "It does not visit links, verify identities, or determine whether a "
            "message is definitively safe or malicious."
        ),
    }


def create_physical_safety_plan() -> dict:
    return {
        "analysis_type": "safety_guidance",
        "risk_level": "undetermined",
        "assessment": "Safety guidance prepared",
        "steps": [
            "If you are in immediate danger, move toward a safer public place if possible.",
            "Contact local emergency services if urgent help is needed.",
            "Consider contacting a trusted person and agree on a safe way to communicate.",
            "Before sharing location details, check who will receive them and what will be shared.",
        ],
        "message_draft": (
            "I need support. Please contact me when you can. "
            "I will share my location if I choose to."
        ),
        "requires_user_action": True,
        "note": (
            "No alert was sent, location was shared, or emergency service was contacted "
            "by this backend."
        ),
    }


def choose_tool(request: SafetyRequest) -> str:
    if request.category == "digital":
        return "digital_safety_analyzer"

    if request.category == "physical":
        return "physical_safety_planner"

    text = request.message.lower()

    digital_indicators = (
        "message",
        "link",
        "password",
        "otp",
        "phishing",
        "blackmail",
        "harass",
        "threat",
        "photo",
        "payment",
        "bank",
        "account",
        "scam",
    )

    if any(term in text for term in digital_indicators):
        return "digital_safety_analyzer"

    return "physical_safety_planner"


@app.get("/")
def root():
    return {
        "project": "SPHERe",
        "status": "running",
        "version": APP_VERSION,
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "version": APP_VERSION,
    }


@app.post("/api/privacy/analyze")
def analyze_privacy_data(request: PrivacyAnalyzeRequest):
    text = request.text
    findings = []
    seen = set()

    for match in EMAIL_REGEX.finditer(text):
        raw = match.group().strip()
        if raw.lower() not in seen:
            seen.add(raw.lower())
            findings.append({
                "category": "Personal Identifier (Email)",
                "raw": raw,
                "masked": mask_email(raw),
                "severity": "Medium",
                "explanation": "Exposes email address, posing risks of phishing and credential stuffing.",
                "suggested_action": "Censor the email handle or draw a redaction bar over it.",
            })

    for regex in (INDIAN_PHONE_REGEX, GENERAL_PHONE_REGEX):
        for match in regex.finditer(text):
            raw = match.group().strip()
            digits = re.sub(r"\D", "", raw)
            if len(digits) >= 7 and digits not in seen:
                seen.add(digits)
                findings.append({
                    "category": "Personal Identifier (Phone Number)",
                    "raw": raw,
                    "masked": mask_phone(raw),
                    "severity": "High",
                    "explanation": "Direct mobile/phone number can be exploited for unsolicited calls or identity linking.",
                    "suggested_action": "Redact the phone number before publishing.",
                })

    for match in COORD_DECIMAL_REGEX.finditer(text):
        raw = match.group().strip()
        if raw not in seen:
            seen.add(raw)
            findings.append({
                "category": "Geographic Coordinates",
                "raw": raw,
                "masked": re.sub(r"(\d+\.\d{2})\d+", r"\g<1>•••", raw),
                "severity": "High",
                "explanation": "Precise latitude and longitude pinpoint an exact building or street location.",
                "suggested_action": "Remove coordinates and avoid sharing unredacted map pins.",
            })

    for match in PIN_CODE_REGEX.finditer(text):
        raw = match.group().strip()
        if raw not in seen:
            seen.add(raw)
            findings.append({
                "category": "Postal Location (PIN Code)",
                "raw": raw,
                "masked": mask_str(raw, 2, 2),
                "severity": "Medium",
                "explanation": "Isolates your neighborhood or postal delivery zone.",
                "suggested_action": "Mask postal code to prevent neighborhood-level localization.",
            })

    text_lower = text.lower()
    for kw in ADDRESS_KEYWORDS:
        if kw in text_lower and f"addr_{kw}" not in seen:
            seen.add(f"addr_{kw}")
            findings.append({
                "category": "Address / Landmark Clue",
                "raw": kw,
                "masked": kw,
                "severity": "Medium",
                "explanation": f"Mentions location keyword '{kw}', which may help reconstruct transit or home addresses.",
                "suggested_action": "Censor surrounding street, building, or area names.",
            })
            break

    high_count = sum(1 for f in findings if f["severity"] == "High")
    medium_count = sum(1 for f in findings if f["severity"] == "Medium")
    low_count = sum(1 for f in findings if f["severity"] == "Low")

    return {
        "project": "SPHERe",
        "has_exposures": len(findings) > 0,
        "summary": {
            "total": len(findings),
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
        },
        "findings": findings,
        "limitation": (
            "Rule-based regex scanner. Cannot evaluate visual artifacts or physical landmarks. "
            "Absence of findings does not certify complete privacy."
        ),
    }


@app.post("/api/safety")
def handle_safety_request(request: SafetyRequest):
    selected_tool = choose_tool(request)

    if selected_tool == "digital_safety_analyzer":
        result = analyze_digital_text(request.message)
    else:
        result = create_physical_safety_plan()

    return {
        "project": "SPHERe",
        "selected_tool": selected_tool,
        "result": result,
        "execution": {
            "planned": True,
            "analysis_completed": True,
            "analysis_type": result["analysis_type"],
            "external_actions_taken": False,
        },
    }
