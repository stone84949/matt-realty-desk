"""Cactus Needle intent router for Matt Realty Desk.

Needle only interprets a request. This module never changes records or sends messages.
"""

from __future__ import annotations

import threading

import needle


TOOLS = [
    {
        "name": "create_contact",
        "description": "Prepare a new real-estate contact or lead for user confirmation. Do not use for searching existing contacts.",
        "triggers": [r"\b(add|create|save|enter)\b.*\b(contact|lead|buyer|seller|client)\b"],
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "The person's full name exactly as spoken"},
                "phone": {"type": "string", "description": "Phone number exactly as spoken"},
                "email": {"type": "string", "description": "Email address exactly as spoken"},
                "street_address": {"type": "string", "description": "Street number and street name exactly as spoken"},
                "address_line_2": {"type": "string", "description": "Apartment, suite, or unit exactly as spoken"},
                "city": {"type": "string", "description": "City exactly as spoken"},
                "state": {"type": "string", "description": "State name or abbreviation exactly as spoken"},
                "postal_code": {"type": "string", "description": "ZIP or postal code exactly as spoken"},
                "relationship": {"type": "string", "enum": ["Prospect", "Buyer", "Seller", "Past Client", "Referral Partner", "Vendor"]},
                "notes": {"type": "string", "description": "Brief notes explicitly stated by the user"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "create_followup",
        "description": "Prepare a reminder or follow-up task for user confirmation.",
        "triggers": [r"\b(remind|follow.?up|task|call)\b"],
        "parameters": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "What Matt needs to do, preserving the user's wording"},
                "due_date": {"type": "string", "format": "date", "description": "Due date in YYYY-MM-DD format"},
                "contact_name": {"type": "string", "description": "Related contact name exactly as spoken"},
                "priority": {"type": "string", "enum": ["Low", "Normal", "High"]},
            },
            "required": ["task"],
        },
    },
    {
        "name": "search_contacts",
        "description": "Find existing contacts, leads, buyers, sellers, or clients without changing records.",
        "triggers": [r"\b(find|search|show|look up)\b.*\b(contact|lead|buyer|seller|client|people|person)\b"],
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Name, email, phone, address, city, ZIP, type, or stage to search for"}},
            "required": ["query"],
        },
    },
    {
        "name": "draft_message",
        "description": "Delegate a request to the local writing assistant to draft a text, email, note, or client update. It will not send anything.",
        "triggers": [r"\b(draft|write|compose)\b"],
        "parameters": {
            "type": "object",
            "properties": {"request": {"type": "string", "description": "The full drafting request and all stated context"}},
            "required": ["request"],
        },
    },
    {
        "name": "ask_assistant",
        "description": "Delegate a general real-estate question, planning request, or request for advice to the local conversational assistant.",
        "parameters": {
            "type": "object",
            "properties": {"question": {"type": "string", "description": "The user's complete question or request"}},
            "required": ["question"],
        },
    },
]

_agent = None
_lock = threading.Lock()


def _get_agent():
    global _agent
    if _agent is None:
        _agent = needle.Needle(tools=TOOLS)
    return _agent


def interpret(text: str) -> dict:
    with _lock:
        agent = _get_agent()
        agent.reset()
        result = agent.complete(text, max_new_tokens=256)
    calls = result.get("function_calls") or result.get("suppressed_calls") or []
    if not calls:
        return {"action": None, "arguments": {}, "confidence": result.get("confidence"), "reasoning": result.get("reasoning", "")}
    call = calls[0]
    return {
        "action": call.get("name"),
        "arguments": call.get("arguments") or {},
        "confidence": result.get("confidence"),
        "reasoning": result.get("reasoning", ""),
        "suppressed": not bool(result.get("function_calls")),
    }
