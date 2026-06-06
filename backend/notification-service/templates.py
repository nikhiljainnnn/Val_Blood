"""
Multilingual message templates.
Supports: WhatsApp, SMS, IVR, confirmation messages.
Languages: hi (Hindi), ta (Tamil), te (Telugu), bn (Bengali), en (English)
"""
from typing import Optional

# ─── WhatsApp templates ───────────────────────────────────────────────────────
WHATSAPP_MAIN: dict[str, str] = {
    "hi": """🩸 नमस्ते {donor_name}!

Blood Warriors आपको याद कर रहा है।

💬 *{story_snippet}*

📅 *अगला स्लॉट:* {slot}
⭐ *आपका Karma Score:* {karma} pts

क्या आप इस बार donate कर सकते हैं?
*1 भेजें* — हाँ, मैं आऊँगा ✅
*2 भेजें* — मुझे बाद में remind करें 🔔

🤝 Blood Warriors | रक्तदाता हमारे हीरो हैं""",

    "ta": """🩸 வணக்கம் {donor_name}!

Blood Warriors உங்களை நினைவுகூர்கிறது.

💬 *{story_snippet}*

📅 *அடுத்த slot:* {slot}
⭐ *உங்கள் Karma:* {karma} pts

இந்த முறை donate செய்ய முடியுமா?
*1* — ஆம், வருவேன் ✅
*2* — பிறகு நினைவூட்டுங்கள் 🔔

🤝 Blood Warriors | இரத்தம் கொடுங்கள், உயிர் காப்பாற்றுங்கள்""",

    "te": """🩸 నమస్కారం {donor_name}!

Blood Warriors మీకు గుర్తు చేస్తోంది.

💬 *{story_snippet}*

📅 *తదుపరి slot:* {slot}
⭐ *మీ Karma:* {karma} pts

మీరు ఈ సారి donate చేయగలరా?
*1* — అవును, వస్తాను ✅
*2* — తర్వాత గుర్తు చేయండి 🔔

🤝 Blood Warriors | రక్తదానం — జీవన దానం""",

    "bn": """🩸 নমস্কার {donor_name}!

Blood Warriors আপনাকে মনে করছে।

💬 *{story_snippet}*

📅 *পরবর্তী slot:* {slot}
⭐ *আপনার Karma:* {karma} pts

আপনি কি এবার donate করতে পারবেন?
*১* পাঠান — হ্যাঁ, আসবো ✅
*২* পাঠান — পরে মনে করিয়ে দিন 🔔

🤝 Blood Warriors | রক্ত দিন, জীবন বাঁচান""",

    "en": """🩸 Hello {donor_name}!

Blood Warriors is reaching out to you.

💬 *{story_snippet}*

📅 *Next slot:* {slot}
⭐ *Your Karma Score:* {karma} pts

Can you donate this time?
Reply *1* — Yes, I'll be there ✅
Reply *2* — Remind me later 🔔

🤝 Blood Warriors | Our donors are our heroes""",

    "mr": """🩸 नमस्कार {donor_name}!

Blood Warriors आपल्याला आठवण करून देत आहे.

💬 *{story_snippet}*

📅 *पुढील slot:* {slot}
⭐ *आपला Karma:* {karma} pts

आपण यावेळी रक्तदान करू शकता का?
*1* — होय, येतो ✅
*2* — नंतर आठवण करा 🔔

🤝 Blood Warriors | रक्तदान म्हणजे जीवनदान""",
}

WHATSAPP_CONFIRM: dict[str, str] = {
    "hi": "🙏 धन्यवाद {donor_name}! आपकी booking confirm हो गई। अपना ID card और previous donation card साथ लेकर आएं। 💪",
    "ta": "🙏 நன்றி {donor_name}! உங்கள் booking confirm ஆயிற்று. ID card மற்றும் donation card கொண்டு வாருங்கள். 💪",
    "te": "🙏 ధన్యవాదాలు {donor_name}! మీ booking confirm అయింది. ID card మరియు donation card తీసుకు రండి. 💪",
    "bn": "🙏 ধন্যবাদ {donor_name}! আপনার booking confirm হয়েছে। ID card এবং donation card নিয়ে আসুন। 💪",
    "en": "🙏 Thank you {donor_name}! Your slot is confirmed. Please bring your ID card and previous donation card. 💪",
}

WHATSAPP_DEFER: dict[str, str] = {
    "hi": "ठीक है {donor_name}। हम 3 दिन बाद remind करेंगे। आपकी सुविधा पर ध्यान रखते हैं। 🙏",
    "ta": "சரி {donor_name}. நாங்கள் 3 நாட்கள் கழித்து நினைவூட்டுவோம். நன்றி. 🙏",
    "te": "సరే {donor_name}. మేము 3 రోజుల తర్వాత గుర్తు చేస్తాము. ధన్యవాదాలు. 🙏",
    "bn": "ঠিক আছে {donor_name}। আমরা ৩ দিন পরে মনে করিয়ে দেব। ধন্যবাদ। 🙏",
    "en": "No problem {donor_name}. We'll remind you in 3 days. Thank you for your time. 🙏",
}

WHATSAPP_CLARIFY: dict[str, str] = {
    "hi": "कृपया *1* (हाँ) या *2* (बाद में) reply करें। अगर कोई सवाल हो तो 1800-xxx-xxx पर call करें।",
    "ta": "தயவுசெய்து *1* (ஆம்) அல்லது *2* (பிறகு) என reply செய்யுங்கள்.",
    "en": "Please reply *1* (Yes) or *2* (Later). Call 1800-xxx-xxx for help.",
}

# ─── SMS templates (under 160 chars) ─────────────────────────────────────────
SMS_MAIN: dict[str, str] = {
    "hi": "{donor_name}, Blood Warriors: एक बच्चे को आपकी ज़रूरत है। {slot} को donate करें। 1=हाँ 2=नहीं। Helpline: 1800-xxx-xxx",
    "ta": "{donor_name}, Blood Warriors: ஒரு குழந்தைக்கு உதவி தேவை. {slot} அன்று donate செய்யுங்கள். 1=ஆம்.",
    "te": "{donor_name}, Blood Warriors: ఒక పిల్లవాడికి సహాయం కావాలి. {slot} రోజున donate చేయండి. 1=అవును.",
    "bn": "{donor_name}, Blood Warriors: একটি শিশুর সাহায্য দরকার। {slot} তে donate করুন। 1=হ্যাঁ 2=না।",
    "en": "{donor_name}, Blood Warriors: A child urgently needs you. Donate at {slot}. Reply 1=Yes 2=No. Help: 1800-xxx-xxx",
}

# ─── IVR scripts ──────────────────────────────────────────────────────────────
IVR_GREETING: dict[str, str] = {
    "hi": "नमस्ते। मैं Blood Warriors की तरफ से बोल रहा हूँ। एक बच्चे को आपकी ज़रूरत है।",
    "ta": "வணக்கம். நான் Blood Warriors சார்பாக பேசுகிறேன். ஒரு குழந்தைக்கு உங்கள் உதவி தேவை.",
    "te": "నమస్కారం. నేను Blood Warriors తరఫున మాట్లాడుతున్నాను. ఒక పిల్లవాడికి మీ సహాయం కావాలి.",
    "bn": "নমস্কার। আমি Blood Warriors এর পক্ষ থেকে কথা বলছি। একটি শিশুর আপনার সাহায্য দরকার।",
    "en": "Hello. I'm calling from Blood Warriors. A child urgently needs your help.",
}

IVR_CONFIRM_PROMPT: dict[str, str] = {
    "hi": "क्या आप इस हफ्ते donate कर सकते हैं? हाँ के लिए 1 दबाएं, नहीं के लिए 2 दबाएं।",
    "ta": "இந்த வாரம் donate செய்ய முடியுமா? ஆம் என்றால் 1 அழுத்துங்கள், இல்லை என்றால் 2.",
    "te": "ఈ వారం donate చేయగలరా? అవును అంటే 1 నొక్కండి, లేదు అంటే 2 నొక్కండి.",
    "bn": "এই সপ্তাহে donate করতে পারবেন? হ্যাঁ হলে 1 চাপুন, না হলে 2 চাপুন।",
    "en": "Can you donate this week? Press 1 for yes, press 2 for no.",
}

IVR_THANK_YOU: dict[str, str] = {
    "hi": "बहुत धन्यवाद। आपकी booking confirm हो गई। Blood Warriors आपका आभारी है।",
    "ta": "மிக்க நன்றி. உங்கள் booking confirm ஆயிற்று. Blood Warriors உங்களுக்கு நன்றி சொல்கிறது.",
    "te": "చాలా ధన్యవాదాలు. మీ booking confirm అయింది. Blood Warriors మీకు కృతజ్ఞులు.",
    "bn": "অনেক ধন্যবাদ। আপনার booking confirm হয়েছে। Blood Warriors আপনার প্রতি কৃতজ্ঞ।",
    "en": "Thank you so much. Your booking is confirmed. Blood Warriors is grateful for your generosity.",
}

IVR_DEFER: dict[str, str] = {
    "hi": "ठीक है। हम 3 दिन बाद आपसे संपर्क करेंगे। धन्यवाद।",
    "ta": "சரி. நாங்கள் 3 நாட்கள் கழித்து தொடர்பு கொள்வோம். நன்றி.",
    "en": "No problem. We'll reach out in 3 days. Thank you.",
}

GENERIC_STORIES: dict[str, str] = {
    "hi": "आपका donation किसी के जीवन की डोर है।",
    "ta": "உங்கள் donation ஒருவரின் உயிரை காப்பாற்றும்.",
    "te": "మీ donation ఒకరి జీవితాన్ని కాపాడుతుంది.",
    "bn": "আপনার donation কারো জীবন বাঁচাবে।",
    "en": "Your donation is someone's lifeline today.",
}


# ─── Template resolver ────────────────────────────────────────────────────────
def get_template(channel: str, language: str, **kwargs) -> str:
    lang = language if language in ["hi", "ta", "te", "bn", "en", "mr"] else "en"

    mapping = {
        "whatsapp":         WHATSAPP_MAIN,
        "whatsapp_confirm": WHATSAPP_CONFIRM,
        "whatsapp_defer":   WHATSAPP_DEFER,
        "whatsapp_clarify": WHATSAPP_CLARIFY,
        "ivr_greeting":     IVR_GREETING,
        "ivr_confirm":      IVR_CONFIRM_PROMPT,
        "ivr_thank_you":    IVR_THANK_YOU,
        "ivr_defer":        IVR_DEFER,
    }

    template_map = mapping.get(channel, WHATSAPP_MAIN)
    template     = template_map.get(lang, template_map.get("en", ""))

    try:
        return template.format(**kwargs)
    except KeyError:
        return template


def get_sms_template(language: str, donor_name: str, slot: str) -> str:
    lang = language if language in SMS_MAIN else "en"
    return SMS_MAIN[lang].format(donor_name=donor_name, slot=slot)


def get_ivr_script(script_key: str, language: str) -> str:
    lang = language if language in ["hi", "ta", "te", "bn", "en"] else "en"
    mapping = {
        "greeting": IVR_GREETING,
        "confirm":  IVR_CONFIRM_PROMPT,
        "thank_you": IVR_THANK_YOU,
        "defer":    IVR_DEFER,
    }
    template_map = mapping.get(script_key, IVR_GREETING)
    return template_map.get(lang, template_map.get("en", ""))


def get_generic_story(language: str) -> str:
    return GENERIC_STORIES.get(language, GENERIC_STORIES["en"])
