from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import os
import random
import json
import io
import threading
from gtts import gTTS

# Suppress TensorFlow oneDNN verbose logs
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

app = FastAPI(title="AI Sign Language API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve sign videos as static files at /signs/WORD.mp4
VIDEOS_DIR = os.path.join(os.path.dirname(__file__), "videos_input")
app.mount("/signs", StaticFiles(directory=VIDEOS_DIR), name="signs")

# ── Grammar tool (loaded once) ──────────────────────────────────────────────
# ── Grammar tool — disabled (requires Java 17+; Ollama handles correction) ──
GRAMMAR_TOOL = None

# ── Ollama client (gemma3:4b running locally) ────────────────────────────────
OLLAMA_MODEL = "gemma3:4b"
try:
    import ollama
    import threading
    print(f"Ollama import OK — will check liveness per-request.")
except Exception as e:
    print(f"Ollama package not installed: {e}. Using rule-based fallback.")
    ollama = None

# ── LSTM model (loaded once) ─────────────────────────────────────────────────
MODEL_LOADED = False
model = None
actions = None
try:
    try:
        from keras.models import load_model as tf_load_model
    except ImportError:
        from tensorflow.keras.models import load_model as tf_load_model
    if os.path.exists('my_model'):
        model = tf_load_model('my_model')
        if os.path.exists('data'):
            actions = np.array(sorted(os.listdir('data')))  # sorted to match training label order
            MODEL_LOADED = True
            print(f"Model loaded. Labels: {actions}")
        else:
            print("my_model found but 'data' directory missing.")
    else:
        print("my_model not found. Running in MOCK mode.")
except Exception as e:
    print(f"Model load error: {e}. Running in MOCK mode.")

# ── Pydantic schemas ─────────────────────────────────────────────────────────
class InferenceRequest(BaseModel):
    keypoints: List[List[float]]   # 15 frames × 126 keypoints

class AILayerRequest(BaseModel):
    words: List[str]

class SpeechToSignRequest(BaseModel):
    text: str
    language: Optional[str] = "english"

# ── Helpers ──────────────────────────────────────────────────────────────────

def normalize_hand(hand_kp: np.ndarray) -> np.ndarray:
    """Translate landmarks relative to wrist and scale to unit size."""
    kp = hand_kp.reshape(21, 3)
    wrist = kp[0].copy()
    kp = kp - wrist
    scale = np.max(np.linalg.norm(kp, axis=1)) + 1e-6
    return (kp / scale).flatten()

def normalize_sample(sample: np.ndarray) -> np.ndarray:
    return np.concatenate([normalize_hand(sample[:63]), normalize_hand(sample[63:])])

TRANSLATIONS = {
    "hello":    {"english": "Hello there! How are you?",          "hindi": "नमस्ते! आप कैसे हैं?",           "marathi": "नमस्कार! तुम्ही कसे आहात?"},
    "bye":      {"english": "Goodbye, see you later.",            "hindi": "अलविदा, फिर मिलेंगे।",           "marathi": "निरोप, नंतर भेटू."},
    "water":    {"english": "Can you please bring me water?",     "hindi": "क्या आप मुझे पानी दे सकते हैं?","marathi": "तुम्ही मला पाणी देऊ शकता का?"},
    "food":     {"english": "I am hungry, I want food.",          "hindi": "मुझे भूख लगी है, मुझे खाना चाहिए।","marathi": "मला भूक लागली आहे, मला जेवण हवे आहे."},
    "drink":    {"english": "I want something to drink.",         "hindi": "मुझे कुछ पीना है।",              "marathi": "मला काहीतरी प्यायचे आहे."},
    "thanks":   {"english": "Thank you very much.",               "hindi": "बहुत बहुत धन्यवाद।",             "marathi": "खूप खूप धन्यवाद."},
    "thankyou": {"english": "Thank you very much.",               "hindi": "बहुत बहुत धन्यवाद।",             "marathi": "खूप खूप धन्यवाद."},
    "help":     {"english": "Please help me.",                    "hindi": "कृपया मेरी मदद करें।",           "marathi": "कृपया माझी मदत करा."},
    "please":   {"english": "Please help me with this.",          "hindi": "कृपया इसमें मेरी मदद करें।",    "marathi": "कृपया यात मला मदत करा."},
    "yes":      {"english": "Yes, that is correct.",              "hindi": "हाँ, यह सही है।",                "marathi": "होय, ते बरोबर आहे."},
    "no":       {"english": "No, that is not right.",             "hindi": "नहीं, यह सही नहीं है।",          "marathi": "नाही, ते बरोबर नाही."},
    "more":     {"english": "I want more, please.",               "hindi": "मुझे और चाहिए।",                 "marathi": "मला आणखी हवे आहे."},
    "good":     {"english": "That is good.",                      "hindi": "यह अच्छा है।",                   "marathi": "ते चांगले आहे."},
    "bad":      {"english": "That is bad.",                       "hindi": "यह बुरा है।",                    "marathi": "ते वाईट आहे."},
    "where":    {"english": "Where is it?",                       "hindi": "यह कहाँ है?",                    "marathi": "ते कुठे आहे?"},
    "name":     {"english": "What is your name?",                 "hindi": "आपका नाम क्या है?",              "marathi": "तुमचे नाव काय आहे?"},
    "money":    {"english": "I need money.",                      "hindi": "मुझे पैसे चाहिए।",               "marathi": "मला पैसे हवे आहेत."},
    "sit":      {"english": "Please sit down.",                   "hindi": "कृपया बैठ जाइए।",                "marathi": "कृपया बसा."},
    "stand":    {"english": "Please stand up.",                   "hindi": "कृपया खड़े हो जाइए।",            "marathi": "कृपया उभे राहा."},
    "walk":     {"english": "Let us walk.",                       "hindi": "चलो चलते हैं।",                  "marathi": "चला चालूया."},
    "sleep":    {"english": "I want to sleep.",                   "hindi": "मुझे नींद आ रही है।",            "marathi": "मला झोप येत आहे."},
    "wash":     {"english": "I need to wash my hands.",           "hindi": "मुझे हाथ धोने हैं।",             "marathi": "मला हात धुवायचे आहेत."},
    "open":     {"english": "Please open it.",                    "hindi": "कृपया इसे खोलें।",               "marathi": "कृपया ते उघडा."},
    "close":    {"english": "Please close it.",                   "hindi": "कृपया इसे बंद करें।",            "marathi": "कृपया ते बंद करा."},
    "call":     {"english": "Please call for help.",              "hindi": "कृपया मदद के लिए बुलाएं।",       "marathi": "कृपया मदतीसाठी कॉल करा."},
    "write":    {"english": "Please write it down.",              "hindi": "कृपया इसे लिख दें।",             "marathi": "कृपया ते लिहून द्या."},
    "wait":     {"english": "Please wait.",                       "hindi": "कृपया प्रतीक्षा करें।",          "marathi": "कृपया थांबा."},
}

STOP_WORDS = {'a','an','the','is','are','am','was','were','be','been',
              'can','could','would','should','will','shall',
              'i','you','we','they','he','she','it',
              'please','to','for','me','some','my','your','of','in','on','at',
              'this','that','these','those','do','does','did','have','has','had',
              'not','but','and','or','so','if','as','by','with','from','about'}

SYSTEM_PROMPT = (
    "You are a sign language interpreter assistant. "
    "Users communicate using Indian Sign Language (ISL). "
    "You receive a list of sign keywords detected in sequence and must produce "
    "a single short, natural English sentence that best captures the intent. "
    "Always use proper grammar, punctuation, commas, and conjunctions like 'and' or 'but' where appropriate. "
    "The person signing is typically asking for help, expressing a need, or giving a simple instruction. "
    "Keep sentences concise and literal — do not add extra context or assumptions. "
    "Reply with only the sentence, nothing else."
)

def _is_ollama_alive() -> bool:
    """Quick liveness check — returns True if Ollama responds within 3 seconds."""
    if ollama is None:
        return False
    result = [False]
    def _check():
        try:
            ollama.list()  # lightweight — just lists models, no inference
            result[0] = True
        except Exception:
            pass
    t = threading.Thread(target=_check, daemon=True)
    t.start()
    t.join(timeout=3)
    return result[0]

def _ollama(prompt: str, system: str = SYSTEM_PROMPT, timeout: int = 90) -> str:
    """Send a prompt to gemma3:4b via Ollama with a timeout. Raises on failure."""
    result = [None]
    error  = [None]
    def _call():
        try:
            resp = ollama.chat(
                model=OLLAMA_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": prompt},
                ],
                options={"temperature": 0.2},
            )
            result[0] = resp["message"]["content"].strip()
        except Exception as e:
            error[0] = e
    t = threading.Thread(target=_call, daemon=True)
    t.start()
    t.join(timeout=timeout)
    if t.is_alive():
        raise TimeoutError(f"Ollama did not respond within {timeout}s")
    if error[0]:
        raise error[0]
    return result[0]

def llm_to_sentence(words: List[str]) -> str:
    """Convert sign keywords → natural English sentence."""
    if _is_ollama_alive():
        try:
            deduped = [w for i, w in enumerate(words) if i == 0 or w != words[i - 1]]
            prompt = (
                f"These are sign language keywords detected in order: {', '.join(deduped)}\n"
                "Translate ALL of these keywords into one grammatically correct, natural English sentence. "
                "Every keyword must contribute to the meaning — do not ignore any. "
                "Use proper punctuation, commas, and conjunctions where needed. "
                "Reply with only the final sentence, nothing else."
            )
            return _ollama(prompt)
        except Exception as e:
            print(f"Ollama sentence error: {e}")

    # Rule-based fallback — join the detected words as-is
    raw = " ".join(w.capitalize() if i == 0 else w.lower() for i, w in enumerate(words)) + "."
    return raw

def llm_translate(sentence: str, words: List[str]) -> dict:
    """Translate English sentence → Hindi + Marathi."""
    if _is_ollama_alive():
        try:
            prompt = (
                f'Translate this sentence into Hindi and Marathi.\n'
                f'Sentence: "{sentence}"\n'
                'Reply in JSON only with keys "hindi" and "marathi". No extra text, no markdown.'
            )
            raw = _ollama(prompt, system="You are a translator. Reply only with valid JSON.")
            raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            data = json.loads(raw)
            return {
                "english": sentence,
                "hindi":   data.get("hindi", sentence),
                "marathi": data.get("marathi", sentence),
            }
        except Exception as e:
            print(f"Ollama translation error: {e}")

    return {"english": sentence, "hindi": sentence, "marathi": sentence}

AVAILABLE_SIGNS = {
    # original 190
    "BED","ONE","OPEN","VEGETABLE","DIRTY","HAPPY","SHOW","PRESSURE","YOUR","CLEAN",
    "LATER","DROP","STUDY","BREAD","EASY","PEOPLE","GIVE","HUNGRY","HEART","YES",
    "SMALL","OLD","AND","LEFT","SIX","THREE","CLOTHES","FOUR","TAKE","WALK",
    "MOVE","DOCTOR","CONFUSED","FOOD","START","HEADACHE","HOLD","WORK","MORNING","NEED",
    "STOP","TODAY","ME","THANKYOU","DIFFERENT","BABY","EIGHT","HOT","MOTHER","DO",
    "SHE","THIRSTY","HELP","EMERGENCY","GOOD","PLEASE","FATHER","LEAVE","BUS","PUSH",
    "OR","NOT","WHICH","MY","HE","GO","CLOSE","OUR","HARD","FIND",
    "NEW","AMBULANCE","HERE","DOOR","FIVE","RECEIVE","TEA","BOOK","THERE","INJURY",
    "PHONE","LISTEN","ANGRY","EXCITED","WE","BRING","NOW","YOU","SPEAK","AGAIN",
    "DOWN","BUY","SAME","SIT","RICE","I","SORRY","CALL","PERSON","TIRED",
    "SCARED","GET","NO","PAY","TRAIN","BEFORE","COLD","STILL","INSIDE","RIGHT",
    "NINE","ASK","THEY","CHECK","UP","WANT","LEARN","MAKE","NIGHT","SLOW",
    "YESTERDAY","CHANGE","TELL","WELCOME","TABLE","HELLO","WHEN","HOW","FAMILY","TABLET",
    "BLOOD","BAG","COOK","FEVER","AFTER","CHILD","READ","KEEP","TWO","USE",
    "STAND","CAR","DRINK","TURN","SEVEN","SAD","PLAY","HAVE","FRUIT","SICK",
    "PAIN","SUGAR","NEVER","COME","NURSE","OUTSIDE","ALWAYS","WATER","TRY","MEDICINE",
    "TEST","MONEY","ARRIVE","BAD","SEND","MORE","SOMETIMES","FAR","WHERE","NEAR",
    "REPORT","CHAIR","WHY","LESS","KEY","BIG","FAST","WATCH","WHO","COUGH",
    "SLEEP","WAIT","SISTER","MILK","OKAY","WHAT","ROAD","TOMORROW","BROTHER","HOSPITAL",
    "PULL","WRITE","EAT","FRIEND","TEN",
    # newly added
    "HUG","QUESTION","BRAVE","SAFE","CRY","SMILE","NORMAL","SAVE","FREE","LOVE",
    "IGNORE","QUICKLY","KISS","SUDDEN","TEAM","DISTRACT","DREAM","SHY","SILENT","STRESS",
    "BELIEVE","LOSE","ALONE","NERVOUS","STOPPED","FOCUS","LATE","THINK","GROUP","FORGET",
    "BORED","PREPARE","ENCOURAGE","HATE","WIN","RISK","CHOOSE","WEIRD","AFRAID","TOGETHER",
    "MISS","FRUSTRATED","SUPPORT","CARE","DECIDE","STRONG","OVERWHELMED","IMPORTANT","FORGIVE","LAUGH",
    "CALM","SLOWLY","EMBARRASSED","TALK","CONFIDENT","CONTINUE","CHAT","ANSWER","GUESS","SPECIAL",
    "TRYAGAIN","MEMORY","ATTENTION","WORRY","PLAN","WEAK","RELAX","HOPE","READY","ACHIEVE",
    "PROUD","SURPRISED","DISCUSS","LONELY","THOUGHT","FINISH","DOUBT","DANGER","WHISPER","REMEMBER",
    "WAITING","STRANGE","WISH","JEALOUS","KNOW","PARTNER","TRUST","IDEA","EXPLAIN","SUCCESS",
    "BUSY","PROTECT","EARLY","COURAGE","COMPLETE","FEEL","SHOUT","DISLIKE","FAIL","UNDERSTAND","LIKE",
    # extra files found in videos_input
    "LOVEYOU","FASTLY","QUICK","ATTENTION",
}

# Rule-based lemmatization map: common inflections → base sign (deduplicated)
LEMMA_MAP = {
    # verb inflections
    "eating":"EAT","eaten":"EAT","eats":"EAT","ate":"EAT",
    "sleeping":"SLEEP","slept":"SLEEP","sleeps":"SLEEP",
    "taking":"TAKE","taken":"TAKE","takes":"TAKE","took":"TAKE",
    "going":"GO","goes":"GO","went":"GO","gone":"GO",
    "coming":"COME","comes":"COME","came":"COME",
    "drinking":"DRINK","drinks":"DRINK","drank":"DRINK","drunk":"DRINK",
    "walking":"WALK","walks":"WALK","walked":"WALK",
    "sitting":"SIT","sits":"SIT","sat":"SIT",
    "standing":"STAND","stands":"STAND","stood":"STAND",
    "working":"WORK","works":"WORK","worked":"WORK",
    "helping":"HELP","helps":"HELP","helped":"HELP",
    "calling":"CALL","calls":"CALL","called":"CALL",
    "writing":"WRITE","writes":"WRITE","wrote":"WRITE","written":"WRITE",
    "reading":"READ","reads":"READ",
    "listening":"LISTEN","listens":"LISTEN","listened":"LISTEN",
    "speaking":"SPEAK","speaks":"SPEAK","spoke":"SPEAK","spoken":"SPEAK",
    "learning":"LEARN","learns":"LEARN","learned":"LEARN","learnt":"LEARN",
    "making":"MAKE","makes":"MAKE","made":"MAKE",
    "buying":"BUY","buys":"BUY","bought":"BUY",
    "paying":"PAY","pays":"PAY","paid":"PAY",
    "playing":"PLAY","plays":"PLAY","played":"PLAY",
    "cooking":"COOK","cooks":"COOK","cooked":"COOK",
    "checking":"CHECK","checks":"CHECK","checked":"CHECK",
    "changing":"CHANGE","changes":"CHANGE","changed":"CHANGE",
    "arriving":"ARRIVE","arrives":"ARRIVE","arrived":"ARRIVE",
    "sending":"SEND","sends":"SEND","sent":"SEND",
    "finding":"FIND","finds":"FIND","found":"FIND",
    "keeping":"KEEP","keeps":"KEEP","kept":"KEEP",
    "bringing":"BRING","brings":"BRING","brought":"BRING",
    "asking":"ASK","asks":"ASK","asked":"ASK",
    "telling":"TELL","tells":"TELL","told":"TELL",
    "wanting":"WANT","wants":"WANT","wanted":"WANT",
    "needing":"NEED","needs":"NEED","needed":"NEED",
    "trying":"TRY","tries":"TRY","tried":"TRY",
    "using":"USE","uses":"USE","used":"USE",
    "getting":"GET","gets":"GET","got":"GET","gotten":"GET",
    "having":"HAVE","has":"HAVE","had":"HAVE",
    "doing":"DO","does":"DO","did":"DO","done":"DO",
    "stopping":"STOP","stops":"STOP","stopped":"STOP",
    "starting":"START","starts":"START","started":"START",
    "moving":"MOVE","moves":"MOVE","moved":"MOVE",
    "dropping":"DROP","drops":"DROP","dropped":"DROP",
    "holding":"HOLD","holds":"HOLD","held":"HOLD",
    "pushing":"PUSH","pushes":"PUSH","pushed":"PUSH",
    "pulling":"PULL","pulls":"PULL","pulled":"PULL",
    "turning":"TURN","turns":"TURN","turned":"TURN",
    "watching":"WATCH","watches":"WATCH","watched":"WATCH",
    "waiting":"WAIT","waits":"WAIT","waited":"WAIT",
    "showing":"SHOW","shows":"SHOW","showed":"SHOW","shown":"SHOW",
    "leaving":"LEAVE","leaves":"LEAVE","left":"LEAVE",
    "receiving":"RECEIVE","receives":"RECEIVE","received":"RECEIVE",
    "studying":"STUDY","studies":"STUDY","studied":"STUDY",
    "giving":"GIVE","gives":"GIVE","gave":"GIVE","given":"GIVE",
    # noun plurals
    "medicines":"MEDICINE","tablets":"TABLET","doctors":"DOCTOR",
    "nurses":"NURSE","hospitals":"HOSPITAL","ambulances":"AMBULANCE",
    "friends":"FRIEND","families":"FAMILY","children":"CHILD","babies":"BABY",
    "brothers":"BROTHER","sisters":"SISTER","mothers":"MOTHER","fathers":"FATHER",
    "bags":"BAG","books":"BOOK","cars":"CAR","buses":"BUS","trains":"TRAIN",
    "roads":"ROAD","chairs":"CHAIR","tables":"TABLE","doors":"DOOR","keys":"KEY",
    "phones":"PHONE","reports":"REPORT","tests":"TEST","clothes":"CLOTHES",
    "fruits":"FRUIT","vegetables":"VEGETABLE","injuries":"INJURY","pains":"PAIN",
    "headaches":"HEADACHE","fevers":"FEVER","coughs":"COUGH","sugars":"SUGAR",
    "bloods":"BLOOD","hearts":"HEART","milks":"MILK","waters":"WATER",
    "rices":"RICE","breads":"BREAD","foods":"FOOD","teas":"TEA",
    "nights":"NIGHT","mornings":"MORNING","coins":"MONEY","rupees":"MONEY",
    "ideas":"IDEA","thoughts":"THOUGHT","memories":"MEMORY","partners":"PARTNER",
    "teams":"TEAM","groups":"GROUP","persons":"PERSON","people":"PEOPLE",
    # synonyms & informal
    "dad":"FATHER","daddy":"FATHER","papa":"FATHER","pop":"FATHER",
    "mom":"MOTHER","mum":"MOTHER","mama":"MOTHER","mummy":"MOTHER",
    "bro":"BROTHER","sis":"SISTER","kid":"CHILD","kids":"CHILD",
    "dinner":"FOOD","lunch":"FOOD","breakfast":"FOOD","meal":"FOOD","snack":"FOOD","supper":"FOOD","brunch":"FOOD",
    "wake":"UP","waking":"UP","woke":"UP","woken":"UP","wakes":"UP","awake":"UP","arise":"UP",
    "pill":"TABLET","pills":"TABLET","capsule":"TABLET","capsules":"TABLET",
    "drug":"MEDICINE","drugs":"MEDICINE","medication":"MEDICINE","medications":"MEDICINE",
    "physician":"DOCTOR","surgeon":"DOCTOR","specialist":"DOCTOR",
    "clinic":"HOSPITAL","ward":"HOSPITAL",
    "cab":"CAR","taxi":"CAR","auto":"CAR","vehicle":"CAR",
    "shop":"BUY","shopping":"BUY","purchase":"BUY","purchasing":"BUY","purchased":"BUY",
    "say":"SPEAK","said":"SPEAK","saying":"SPEAK",
    "ill":"SICK","unwell":"SICK","disease":"SICK","illness":"SICK",
    "ache":"PAIN","aching":"PAIN","hurt":"PAIN","hurting":"PAIN","hurts":"PAIN",
    "temperature":"FEVER",
    "cash":"MONEY","fee":"MONEY","fees":"MONEY","cost":"MONEY","price":"MONEY","payment":"PAY",
    "travel":"GO","travelling":"GO","traveled":"GO","trip":"GO","journey":"WALK",
    "home":"HERE","house":"HERE","room":"HERE","place":"HERE",
    "evening":"NIGHT","midnight":"NIGHT","dawn":"MORNING","sunrise":"MORNING",
    "fun":"HAPPY","enjoy":"HAPPY","enjoying":"HAPPY","enjoyed":"HAPPY","enjoyment":"HAPPY",
    "joy":"HAPPY","joyful":"HAPPY","delight":"HAPPY","delighted":"HAPPY",
    "celebrate":"EXCITED","celebrating":"EXCITED","celebration":"EXCITED","party":"EXCITED",
    "exhausted":"TIRED","sleepy":"SLEEP","drowsy":"SLEEP",
    "thirst":"THIRSTY","hunger":"HUNGRY","starving":"HUNGRY",
    "warm":"HOT","heat":"HOT","cool":"COLD","chilly":"COLD",
    "wash":"CLEAN","washing":"CLEAN","washed":"CLEAN","washes":"CLEAN","messy":"DIRTY",
    "shut":"CLOSE","shutting":"CLOSE",
    "begin":"START","beginning":"START","began":"START","begun":"START",
    "end":"STOP","ending":"STOP","ended":"STOP",
    "reach":"ARRIVE","reached":"ARRIVE","reaching":"ARRIVE",
    "search":"FIND","searching":"FIND","searched":"FIND","look":"FIND","looking":"FIND",
    "game":"PLAY","sport":"PLAY","job":"WORK",
    "rest":"RELAX","resting":"RELAX",
    "great":"GOOD","nice":"GOOD","fine":"GOOD","well":"GOOD",
    "wrong":"BAD","terrible":"BAD",
    "huge":"BIG","large":"BIG","tiny":"SMALL","little":"SMALL",
    "glad":"HAPPY","unhappy":"SAD","upset":"SAD",
    "mad":"ANGRY","furious":"ANGRY",
    "frightened":"AFRAID","fear":"AFRAID","fearing":"AFRAID","feared":"AFRAID",
    "hi":"HELLO","goodbye":"BYE",
    "thanks":"THANKYOU","thank":"THANKYOU",
    "weep":"CRY","weeping":"CRY","wept":"CRY",
    "grin":"SMILE","grinning":"SMILE",
    "adore":"LOVE","adoring":"LOVE",
    "neglect":"IGNORE","neglecting":"IGNORE",
    "rescue":"SAVE","rescuing":"SAVE",
    "freedom":"FREE","release":"FREE","released":"FREE",
    "abrupt":"SUDDEN","abruptly":"SUDDEN","suddenly":"SUDDEN",
    "silence":"SILENT","quiet":"SILENT","quietly":"SILENT","silently":"SILENT",
    "anxiety":"STRESS","anxious":"STRESS","stressful":"STRESS","stressed":"STRESS",
    "belief":"BELIEVE","faith":"BELIEVE",
    "loneliness":"LONELY","lonesome":"LONELY","isolated":"ALONE",
    "concentrate":"FOCUS","concentrating":"FOCUS",
    "delayed":"LATE","delay":"LATE","lately":"LATE",
    "boredom":"BORED","boring":"BORED",
    "encouragement":"ENCOURAGE",
    "victory":"WIN","succeed":"SUCCESS","succeeded":"SUCCESS","successful":"SUCCESS",
    "select":"CHOOSE","selecting":"CHOOSE",
    "odd":"WEIRD","oddly":"WEIRD","strangely":"STRANGE",
    "jointly":"TOGETHER","united":"TOGETHER",
    "annoy":"FRUSTRATED","annoyed":"FRUSTRATED","frustration":"FRUSTRATED",
    "assist":"SUPPORT","assisting":"SUPPORT",
    "decision":"DECIDE","choice":"CHOOSE",
    "strength":"STRONG","powerful":"STRONG",
    "overwhelming":"OVERWHELMED","overwhelm":"OVERWHELMED",
    "crucial":"IMPORTANT","critical":"IMPORTANT","importance":"IMPORTANT",
    "peaceful":"CALM","peacefully":"CALM","calmly":"CALM",
    "ashamed":"EMBARRASSED","embarrassment":"EMBARRASSED",
    "confidence":"CONFIDENT","proceed":"CONTINUE","proceeding":"CONTINUE",
    "messaging":"CHAT","texting":"CHAT",
    "reply":"ANSWER","replying":"ANSWER","replied":"ANSWER",
    "estimate":"GUESS","estimating":"GUESS",
    "unique":"SPECIAL","uniquely":"SPECIAL","specialty":"SPECIAL",
    "recall":"REMEMBER","recalling":"REMEMBER",
    "memorize":"MEMORY","memorizing":"MEMORY",
    "concern":"WORRY","concerned":"WORRY",
    "weakness":"WEAK","feeble":"WEAK",
    "readiness":"READY",
    "accomplish":"ACHIEVE","accomplishing":"ACHIEVE","accomplished":"ACHIEVE",
    "pride":"PROUD",
    "shocked":"SURPRISED","shocking":"SURPRISED",
    "debate":"DISCUSS","debating":"DISCUSS",
    "unsure":"DOUBT","uncertain":"DOUBT",
    "hazard":"DANGER","hazardous":"DANGER","dangerous":"DANGER",
    "envy":"JEALOUS","envious":"JEALOUS","jealousy":"JEALOUS",
    "teammate":"PARTNER","colleague":"PARTNER",
    "concept":"IDEA",
    "clarify":"EXPLAIN","clarifying":"EXPLAIN",
    "guard":"PROTECT","guarding":"PROTECT",
    "emotion":"FEEL","emotions":"FEEL",
    "yell":"SHOUT","yelling":"SHOUT","yelled":"SHOUT","scream":"SHOUT","screaming":"SHOUT",
    "failure":"FAIL",
    "timid":"SHY","shyness":"SHY",
    "nervousness":"NERVOUS","anxiously":"NERVOUS",
    "bravery":"BRAVE","courageous":"BRAVE","bravely":"BRAVE",
    "safety":"SAFE","secure":"SAFE","secured":"SAFE",
    "ordinary":"NORMAL","regular":"NORMAL",
    # pronouns
    "i":"I","me":"ME","my":"MY","we":"WE","our":"OUR",
    "you":"YOU","your":"YOUR","he":"HE","she":"SHE","they":"THEY",
}

def _rule_based_keywords(text: str) -> List[str]:
    """Lemmatize each word and match against AVAILABLE_SIGNS, preserving order."""
    # All contractions that strip to a word that could falsely match LEMMA_MAP or AVAILABLE_SIGNS
    CONTRACTION_SKIP = {
        "i'll","he'll","she'll","we'll","they'll",   # ill, hell, shell, well
        "i'd","he'd","she'd","we'd","they'd",         # id, hed, shed, wed
        "it's","that's","what's","who's","let's",     # its, thats, whats, whos, lets
        "don't","won't","can't","isn't","aren't",     # dont, wont, cant
        "wasn't","weren't","didn't","doesn't",        # wasnt, werent, didnt, doesnt
        "haven't","hasn't","hadn't",                  # havent, hasnt, hadnt
        "wouldn't","couldn't","shouldn't",            # wouldnt, couldnt, shouldnt
        "we're","you're","they're","i'm",             # were, youre, theyre, im
        "i've","we've","you've","they've",            # ive, weve, youve, theyve
    }
    result = []
    for token in text.split():
        token_lower = token.lower().strip(".,!?;:\"'")
        # Skip contractions entirely — they carry no sign meaning
        if token_lower in CONTRACTION_SKIP or "'" in token:
            continue
        word = ''.join(c for c in token if c.isalpha()).lower()
        if not word:
            continue
        upper = word.upper()
        if upper in AVAILABLE_SIGNS:
            result.append(upper)
        elif word in LEMMA_MAP and LEMMA_MAP[word] in AVAILABLE_SIGNS:
            result.append(LEMMA_MAP[word])
    return result or ["SORRY"]

def simplify_to_sign_keywords(text: str) -> List[str]:
    """Speech text → ISL/ASL root keywords matched against available sign videos."""
    if _is_ollama_alive():
        try:
            sign_list = ', '.join(sorted(AVAILABLE_SIGNS))
            prompt = (
                f"You are an ISL (Indian Sign Language) expert with deep knowledge of English vocabulary, synonyms, and semantics.\n\n"
                f"SIGN VOCABULARY (the only words you can use in your output):\n{sign_list}\n\n"
                f"INPUT SENTENCE: {text}\n\n"
                "YOUR JOB:\n"
                "Translate the input sentence into a sequence of signs that preserves the full meaning.\n"
                "You have complete freedom to use your language knowledge — treat this like a translation task, not a word lookup.\n\n"
                "Think like this:\n"
                "- What is the speaker trying to communicate?\n"
                "- For each idea or concept, which sign in the vocabulary best represents it?\n"
                "- Words like 'dad', 'fun', 'dinner', 'yell', 'exhausted' all have obvious sign equivalents — find them yourself.\n"
                "- A concept represented by an approximate sign is always better than a missing concept.\n\n"
                "ONLY skip: a, an, the, is, are, was, were, be, been, will, would, could, should, shall, which, that\n\n"
                "Return ONLY a JSON array of uppercase sign names from the vocabulary. No explanation, no markdown.\n"
                'Example: ["FATHER","WANT","GO","OUTSIDE","PLAY","MY","FRIEND","HAVE","HAPPY","AFTER","I","EAT","MY","FOOD"]'
            )
            raw = _ollama(prompt)
            raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            import re as _re
            m = _re.search(r'\[.*?\]', raw, _re.DOTALL)
            if m:
                raw = m.group(0)
            words = json.loads(raw)
            result = [w.upper() for w in words if w.upper() in AVAILABLE_SIGNS]
            if result:
                return result
        except Exception as e:
            print(f"Ollama keyword error: {e}")

    # Rule-based fallback with lemmatization
    return _rule_based_keywords(text)

# ── Routes ───────────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {
        "status": "running",
        "model_mode": "REAL" if MODEL_LOADED else "MOCK",
        "llm_mode": "ollama/gemma3:4b" if _is_ollama_alive() else "rule-based",
    }

@app.post("/predict")
def predict_sign(req: InferenceRequest):
    if len(req.keypoints) != 15:
        raise HTTPException(status_code=400, detail="Expected 15 frames of 126 keypoints")
    for k in req.keypoints:
        if len(k) != 126:
            raise HTTPException(status_code=400, detail="Each frame must have 126 keypoints")

    if MODEL_LOADED:
        arr = np.array(req.keypoints, dtype=np.float32)  # shape: (15, 126)
        # Detect model input shape and feed accordingly
        expected = model.input_shape  # e.g. (None, 126) or (None, 15, 126)
        if len(expected) == 2:
            # MLP — normalize last frame (most stable pose) then predict
            raw_frame = arr[-1]
            inp = normalize_sample(raw_frame)[np.newaxis, :]
        else:
            # LSTM — normalize each frame
            inp = np.array([normalize_sample(f) for f in arr])[np.newaxis, :, :]
        prediction = model.predict(inp, verbose=0)
        confidence = float(np.amax(prediction))
        predicted_label = str(actions[np.argmax(prediction)])
        print(f"Prediction: {predicted_label} ({confidence:.2f})")
        if confidence > 0.90:
            return {"predicted": predicted_label, "confidence": confidence}
        return {"predicted": None, "confidence": confidence}

    # MOCK mode — always return null (no trained model available)
    return {"predicted": None, "confidence": 0.0, "mock": True}

@app.post("/ai-layer")
def process_language(req: AILayerRequest):
    if not req.words:
        return {"original": [], "sentence": "", "translations": {}}

    sentence = llm_to_sentence(req.words)
    translations = llm_translate(sentence, req.words)

    return {
        "original": req.words,
        "sentence": sentence,
        "translations": translations,
    }

@app.post("/speech-to-sign")
def speech_to_sign(req: SpeechToSignRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    keywords = simplify_to_sign_keywords(req.text)
    # Attach video URL for each keyword that has a matching video
    result = []
    for kw in keywords:
        word = kw.upper()
        video_path = os.path.join(VIDEOS_DIR, f"{word}.mp4")
        result.append({
            "word": word,
            "video_url": f"/signs/{word}.mp4" if os.path.exists(video_path) else None,
        })
    return {
        "original_text": req.text,
        "keywords": result,
    }

class TTSRequest(BaseModel):
    text: str
    lang: str = "english"  # "english" | "hindi" | "marathi"

@app.post("/tts")
def text_to_speech(req: TTSRequest):
    lang_map = {"english": "en", "hindi": "hi", "marathi": "mr"}
    tld_map  = {"english": "com", "hindi": "co.in", "marathi": "co.in"}
    lang_code = lang_map.get(req.lang, "en")
    tld       = tld_map.get(req.lang, "com")
    try:
        tts = gTTS(text=req.text, lang=lang_code, tld=tld, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return StreamingResponse(buf, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
