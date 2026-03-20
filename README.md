# Sign Language Translator

Real-time sign language recognition and translation system. Uses MediaPipe in the browser for hand keypoint extraction, an MLP classifier (FastAPI backend) for sign prediction, and Ollama (gemma3:4b) for natural language processing.

---

## Project Structure

```
├── backend-repo/          # FastAPI backend + ML model
│   ├── api.py             # Main API server
│   ├── model.py           # Model training script
│   ├── data_collection.py # Manual data collection via webcam
│   ├── my_functions.py    # MediaPipe keypoint helpers
│   ├── data/              # Keypoint samples (50 words × 100 samples)
│   ├── my_model/          # Trained Keras MLP model
│   ├── videos_input/      # Sign videos for speech→sign playback
│   └── hand_landmarker.task
├── sign-language-translator/  # React frontend (Vite)
│   └── src/App.jsx            # Single-file UI
│
├── organized/             # Videos organized by word (from WLASL)
├── docker-compose.yml     # Docker setup (backend + frontend + ollama)
└── README.md
```

---

## Requirements

- Python 3.10+
- Node.js 18+
- Webcam
- Internet (for gTTS)
- [Ollama](https://ollama.com) with `gemma3:4b` pulled (optional — rule-based fallback works without it)

---

## Quick Start (Local Dev)

**Backend**
```bash
cd backend-repo
pip install -r requirements.txt
uvicorn api:app --reload
```

**Frontend**
```bash
cd sign-language-translator
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://127.0.0.1:8000`

**Ollama (optional)**
```bash
ollama pull gemma3:4b
ollama serve
```

---

## Docker (Production)

```bash
docker-compose up --build
```

- Frontend → `http://localhost:80`
- Backend → `http://localhost:8000`
- Ollama pulls `gemma3:4b` automatically on first run (~3 GB)

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Status — model mode + LLM mode |
| `/predict` | POST | 15 frames × 126 keypoints → predicted sign + confidence |
| `/ai-layer` | POST | Sign keywords → natural sentence + EN/HI/MR translations |
| `/speech-to-sign` | POST | Speech text → ISL keyword sequence + video URLs |
| `/tts` | POST | Text → MP3 audio via gTTS |
| `/signs/<WORD>.mp4` | GET | Static sign video files |

---

## Model

- Architecture: MLP — 512 → 256 → 128 → 64 → 50 (softmax)
- Input: 126 features (2 hands × 21 landmarks × 3 axes), wrist-normalized
- Training: 5,000 raw samples → 25,000 augmented (4× noise + scale + rotation)
- Test accuracy: 99.17% on 50 words
- Confidence threshold: 0.90
- Word buffer: 15 signs

**50 supported signs:**
```
AFTER, BAD, BEFORE, BOOK, BYE, CALL, CLOSE, COLLEGE, COME, DRINK,
EAT, FAST, FATHER, FOOD, FRIEND, GIVE, GO, GOOD, HELLO, HELP,
HOME, I, MEDICINE, MONEY, MORE, MOTHER, NAME, NO, OPEN, PHONE,
PLAY, PLEASE, READ, SIT, SLEEP, SORRY, STAND, STOP, THANKYOU, TODAY,
TOMORROW, WAIT, WALK, WANT, WASH, WATER, WHERE, WRITE, YES, YOU
```

---

## Adding New Words

**From dataset (WLASL):**
1. Add word to `TARGET_WORDS` in `organize_dataset.py` (in `unnecessary_files/`)
2. Run `organize_dataset.py` → copies videos to `organized/<WORD>/`
3. Run `extract_keypoints.py` → extracts keypoints to `backend-repo/data/<WORD>/`
4. Run `backend-repo/model.py` to retrain

**From webcam:**
1. Add word to `new_actions` in `backend-repo/data_collection.py`
2. Run `python data_collection.py` from `backend-repo/`
3. Run `python model.py` to retrain

---

## Language Support

| Language | Translation | TTS |
|----------|-------------|-----|
| English  | Always available | gTTS |
| Hindi    | Ollama / fallback | gTTS |
| Marathi  | Ollama / fallback | gTTS |

---

## Notes

- MediaPipe runs in the browser — no camera access needed by the backend
- Ollama is optional — app falls back to rule-based keyword extraction if offline
- The Ollama offline badge appears in the header when backend is up but Ollama is unreachable
- `hand_landmarker.task` is auto-downloaded on first run of `data_collection.py`
- If the system does not work, try reloading the tab and restarting the server — Ollama output can sometimes take time on first inference

---

## Dataset

Sign videos are sourced from the **WLASL (Word-Level American Sign Language)** dataset, available on Kaggle:
[https://www.kaggle.com/datasets/risangbaskoro/wlasl-processed](https://www.kaggle.com/datasets/risangbaskoro/wlasl-processed)
