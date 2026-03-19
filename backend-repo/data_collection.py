import os
import shutil
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from my_functions import draw_landmarks, keypoint_extraction

# ── Actions to collect ───────────────────────────────────────────────────────
new_actions = np.array([
    'FATHER', 'MOTHER', 'FRIEND', 'TODAY', 'TOMORROW',
    'AFTER', 'BEFORE', 'PLAY', 'EAT', 'HOME',
    'READ', 'PHONE', 'BOOK', 'FAST', 'COLLEGE',
])

# Existing data for these will be wiped and re-recorded from scratch
FORCE_RERECORD = set()  # set to action names to force re-record, e.g. {'FAST'}

samples_per_action = 100
PATH = os.path.join('data')

# Create/reset directories
for action in new_actions:
    action_dir = os.path.join(PATH, action)
    if action in FORCE_RERECORD and os.path.exists(action_dir):
        shutil.rmtree(action_dir)
        print(f"  Cleared existing data for {action} (force re-record)")
    os.makedirs(action_dir, exist_ok=True)

# ── Download hand landmarker model if not present ────────────────────────────
MODEL_PATH = 'hand_landmarker.task'
if not os.path.exists(MODEL_PATH):
    import urllib.request
    print("Downloading hand_landmarker.task model...")
    urllib.request.urlretrieve(
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        MODEL_PATH
    )
    print("Model downloaded.")

# ── Setup HandLandmarker ──────────────────────────────────────────────────────
base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
options = mp_vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=2,
    min_hand_detection_confidence=0.3,
    min_hand_presence_confidence=0.3,
    min_tracking_confidence=0.3
)
landmarker = mp_vision.HandLandmarker.create_from_options(options)

# ── Camera ────────────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("Cannot access camera.")
    exit()

cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

for _ in range(30):
    cap.read()

# ── Sign reference hints ──────────────────────────────────────────────────────
SIGN_HINTS = {
    'FATHER':   'Thumb touches forehead, open hand',
    'MOTHER':   'Thumb touches chin, open hand',
    'FRIEND':   'Hook index fingers together, swap',
    'TODAY':    'Both flat hands move down together',
    'TOMORROW': 'Thumb on cheek, arc forward',
    'AFTER':    'One flat hand slides forward over other',
    'BEFORE':   'One flat hand slides back toward body',
    'PLAY':     'Both hands Y-shape, shake side to side',
    'EAT':      'Fingers pinched, tap mouth twice',
    'HOME':     'Fingers pinched, touch cheek then chin',
    'READ':     'Two fingers point down, move over open palm',
    'PHONE':    'Y-hand (thumb+pinky), hold to ear',
    'BOOK':     'Both flat hands together, open like a book',
    'FAST':     'Index fingers hooked, flick forward quickly',
    'COLLEGE':  'One palm on top of other, circle upward',
}

def show_info(image, action, collected, total, waiting=False):
    h, w = image.shape[:2]
    cv2.rectangle(image, (0, 0), (w, 110), (0, 0, 0), -1)
    cv2.putText(image, f'Action: {action}', (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    hint = SIGN_HINTS.get(action, '')
    cv2.putText(image, hint, (10, 55),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
    cv2.putText(image, f'Samples: {collected}/{total}', (10, 80),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 1)
    bar_w = int((collected / total) * (w - 20))
    cv2.rectangle(image, (10, 90), (w - 10, 104), (50, 50, 50), -1)
    cv2.rectangle(image, (10, 90), (10 + bar_w, 104), (0, 200, 100), -1)
    if waiting:
        cv2.putText(image, 'Hold sign steady  |  SPACE = start recording',
                    (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2)

print("\n=== Data Collection ===")
print(f"Actions: {list(new_actions)}")
print(f"Force re-record: {FORCE_RERECORD}")
print(f"Samples per action: {samples_per_action}\n")

for action in new_actions:
    action_dir = os.path.join(PATH, action)
    existing = len([f for f in os.listdir(action_dir) if f.endswith('.npy')])
    if existing >= samples_per_action:
        print(f"  [{action}] Already has {existing} samples, skipping.")
        continue

    start_idx = existing
    hint = SIGN_HINTS.get(action, 'Perform the sign')
    print(f"\n[{action}] {hint}")
    print(f"  Starting from sample {start_idx}. Press SPACE when ready.")

    # Wait for SPACE
    while True:
        ret, image = cap.read()
        if not ret:
            break
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_img)
        draw_landmarks(image, result)
        show_info(image, action, start_idx, samples_per_action, waiting=True)
        cv2.imshow('Camera', image)
        key = cv2.waitKey(1) & 0xFF
        if key == ord(' '):
            break
        if cv2.getWindowProperty('Camera', cv2.WND_PROP_VISIBLE) < 1:
            break

    # Countdown
    for countdown in [3, 2, 1]:
        for _ in range(10):
            ret, image = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect(mp_img)
            draw_landmarks(image, result)
            show_info(image, action, start_idx, samples_per_action)
            cv2.putText(image, str(countdown),
                        (image.shape[1] // 2 - 20, image.shape[0] // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 3, (0, 255, 255), 4)
            cv2.imshow('Camera', image)
            cv2.waitKey(30)

    # Collect
    collected = start_idx
    skipped = 0
    while collected < samples_per_action:
        ret, image = cap.read()
        if not ret:
            break
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_img)
        draw_landmarks(image, result)
        show_info(image, action, collected, samples_per_action)

        keypoints = keypoint_extraction(result)
        if np.any(keypoints != 0):
            np.save(os.path.join(action_dir, str(collected)), keypoints)
            collected += 1
        else:
            skipped += 1
            cv2.putText(image, 'No hands! Show your hand.',
                        (10, image.shape[0] - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)

        cv2.imshow('Camera', image)
        cv2.waitKey(50)

        if cv2.getWindowProperty('Camera', cv2.WND_PROP_VISIBLE) < 1:
            break

    print(f"  Done: {action} — {collected} saved, {skipped} skipped")

    if cv2.getWindowProperty('Camera', cv2.WND_PROP_VISIBLE) < 1:
        break

landmarker.close()
cap.release()
cv2.destroyAllWindows()
print("\nCollection complete. Run model.py to retrain.")
