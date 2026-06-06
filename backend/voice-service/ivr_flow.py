"""
IVR state machine for donor voice interactions.
"""
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import Optional
from templates import get_ivr_script


class IVRState(str, Enum):
    GREETING       = "greeting"
    PLAY_STORY     = "play_story"
    CONFIRM_INTENT = "confirm_intent"
    COLLECT_SLOT   = "collect_slot"
    CONFIRMED      = "confirmed"
    DEFER          = "defer"
    FALLBACK       = "fallback"


@dataclass
class IVRSession:
    session_id:   str
    donor_id:     str
    language:     str
    story:        str
    state:        IVRState = IVRState.GREETING
    donor_phone:  Optional[str] = None
    selected_slot: Optional[str] = None
    retries:      int = 0

    def get_greeting_text(self) -> str:
        return (
            get_ivr_script("greeting", self.language)
            + " " + self.story + " "
            + get_ivr_script("confirm", self.language)
        )

    async def handle_dtmf(self, digit: str, sarvam) -> dict:
        """Process DTMF input and advance state machine."""

        if self.state == IVRState.GREETING:
            self.state = IVRState.CONFIRM_INTENT
            text = get_ivr_script("confirm", self.language)
            audio = await sarvam.tts(text, self.language)
            return {"state": self.state, "audio_url": audio, "text": text}

        if self.state == IVRState.CONFIRM_INTENT:
            if digit == "1":
                self.state = IVRState.COLLECT_SLOT
                slot_text = self._slot_prompt()
                audio = await sarvam.tts(slot_text, self.language)
                return {"state": self.state, "audio_url": audio, "text": slot_text}
            elif digit == "2":
                self.state = IVRState.DEFER
                text  = get_ivr_script("defer", self.language)
                audio = await sarvam.tts(text, self.language)
                return {"state": self.state, "audio_url": audio, "text": text, "done": True}
            else:
                self.retries += 1
                if self.retries >= 3:
                    self.state = IVRState.FALLBACK
                    return {"state": self.state, "done": True}
                text  = get_ivr_script("confirm", self.language)
                audio = await sarvam.tts(text, self.language)
                return {"state": self.state, "audio_url": audio, "text": text}

        if self.state == IVRState.COLLECT_SLOT:
            # Map digit to day
            days = {"1": "Monday", "2": "Tuesday", "3": "Wednesday",
                    "4": "Thursday", "5": "Friday", "6": "Saturday"}
            day = days.get(digit, "Monday")
            self.selected_slot = f"{day}, 10:00 AM"
            self.state = IVRState.CONFIRMED
            text  = get_ivr_script("thank_you", self.language)
            audio = await sarvam.tts(text, self.language)
            return {
                "state":    self.state,
                "audio_url": audio,
                "text":     text,
                "slot":     self.selected_slot,
                "done":     True,
            }

        return {"state": self.state, "done": True}

    def _slot_prompt(self) -> str:
        prompts = {
            "hi": "कौन सा दिन ठीक रहेगा? सोमवार के लिए 1, मंगलवार 2, बुधवार 3, गुरुवार 4, शुक्रवार 5, शनिवार 6 दबाएं।",
            "ta": "எந்த நாள் வசதியாக இருக்கும்? திங்கள்-1, செவ்வாய்-2, புதன்-3, வியாழன்-4, வெள்ளி-5, சனி-6.",
            "en": "Which day works? Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6.",
        }
        return prompts.get(self.language, prompts["en"])

    def to_dict(self) -> dict:
        d = asdict(self)
        d["state"] = self.state.value
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "IVRSession":
        data["state"] = IVRState(data.get("state", "greeting"))
        return cls(**data)
