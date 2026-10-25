
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="SPHERe Safety Assistant",
    description="A prototype for physical and digital safety support.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class SafetyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    category: Literal["auto", "physical", "digital"] = "auto"


def analyze_digital_text(message: str) -> dict:
    text = message.lower()

    signals = {
        "urgent_payment": any(
            phrase in text
            for phrase in ["send money", "urgent payment", "pay immediately"]
        ),
        "credential_request": any(
            phrase in text
            for phrase in [
                "share your password",
                "enter your password",
                "share otp",
                "send otp",
            ]
        ),
        "suspicious_link": any(
            marker in text for marker in ["http://", "bit.ly/"]
        ),
        "threat_or_harassment": any(
            phrase in text
            for phrase in [
                "i will hurt you",
                "i know where you live",
                "i will leak your photos",
                "i will share your photos",
            ]
        ),
    }

    findings = [name for name, found in signals.items() if found]

    advice = [
        "Do not share passwords or OTPs with unverified contacts.",
        "Verify suspicious requests through an independent, trusted channel.",
        "A lack of detected warning signs does not guarantee a message is safe.",
    ]

    if signals["threat_or_harassment"]:
        advice.insert(
            0,
            "Consider preserving relevant messages and seeking support from "
            "a trusted person. If you are in immediate danger, seek local help.",
        )

    return {
        "signals": signals,
        "findings": findings,
        "assessment": (
            "Potential warning signs detected"
            if findings
            else "No configured warning patterns detected"
        ),
        "advice": advice,
        "limitation": (
            "This is a rule-based prototype, not a trained AI model. "
            "It can miss threats or flag harmless messages."
        ),
    }


def create_physical_safety_plan() -> dict:
    return {
        "steps": [
            "If you are in immediate danger, move toward a safer public place "
            "if possible and contact local emergency services.",
            "Consider contacting someone you trust.",
            "Share your location only with a recipient you trust and after "
            "checking what information will be shared.",
        ],
        "message_draft": (
            "I need support. Please contact me when you can."
        ),
        "requires_user_action": True,
        "note": (
            "This prototype has not sent an alert, shared a location, "
            "or contacted emergency services."
        ),
    }


def choose_tool(request: SafetyRequest) -> str:
    if request.category == "digital":
        return "digital_safety_analyzer"

    if request.category == "physical":
        return "physical_safety_planner"

    text = request.message.lower()
    digital_signals = [
        "message", "link", "password", "otp",
        "phishing", "blackmail", "harass", "threat", "photo",
    ]

    if any(word in text for word in digital_signals):
        return "digital_safety_analyzer"

    return "physical_safety_planner"


@app.get("/")
def root():
    return {
        "project": "SPHERe",
        "status": "running",
        "version": "0.1.0",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


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
            "tool_executed": True,
            "external_actions_taken": False,
        },
    }
