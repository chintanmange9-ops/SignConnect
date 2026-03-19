import numpy as np
import os

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import keras
from keras.utils import to_categorical
from keras.models import Sequential
from keras.layers import Dense, Dropout, BatchNormalization
from keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

PATH    = os.path.join('data')
actions = np.array(sorted(os.listdir(PATH)))
print(f"Actions ({len(actions)}): {list(actions)}")

label_map = {label: num for num, label in enumerate(actions)}

# ── Load raw data ─────────────────────────────────────────────────────────────
X_raw, Y_raw = [], []
for action in actions:
    action_dir = os.path.join(PATH, action)
    files = sorted([f for f in os.listdir(action_dir) if f.endswith('.npy')],
                   key=lambda f: int(f.replace('.npy', '')))
    for f in files:
        kp = np.load(os.path.join(action_dir, f))
        X_raw.append(kp)
        Y_raw.append(label_map[action])

X_raw = np.array(X_raw, dtype=np.float32)
Y_raw = np.array(Y_raw)
print(f"Raw dataset: {X_raw.shape[0]} samples, {X_raw.shape[1]} features, {len(actions)} classes")

# ── Normalize: make keypoints relative to wrist (landmark 0) ─────────────────
# Keypoints layout: [lh_x0,lh_y0,lh_z0, lh_x1,...,lh_z20, rh_x0,...,rh_z20]
# 63 values per hand = 21 landmarks × 3
def normalize_hand(hand_kp):
    """Translate all landmarks relative to wrist (index 0)."""
    kp = hand_kp.reshape(21, 3)
    wrist = kp[0].copy()
    kp = kp - wrist  # center on wrist
    # Scale by max distance so size-invariant
    scale = np.max(np.linalg.norm(kp, axis=1)) + 1e-6
    kp = kp / scale
    return kp.flatten()

def normalize_sample(sample):
    lh = normalize_hand(sample[:63])
    rh = normalize_hand(sample[63:])
    return np.concatenate([lh, rh])

X_norm = np.array([normalize_sample(s) for s in X_raw], dtype=np.float32)

# ── Data augmentation ─────────────────────────────────────────────────────────
def augment(sample, n=4):
    """Generate n augmented versions of a keypoint sample."""
    augmented = []
    for _ in range(n):
        noise = np.random.normal(0, 0.01, sample.shape).astype(np.float32)
        scale = np.random.uniform(0.92, 1.08)
        rot   = np.random.uniform(-0.08, 0.08)  # small rotation in radians
        aug   = sample.copy()

        # Apply per-hand
        for start in [0, 63]:
            kp = aug[start:start+63].reshape(21, 3)
            # Scale
            kp *= scale
            # Rotate around Z axis (x,y plane)
            cos_r, sin_r = np.cos(rot), np.sin(rot)
            x_new = kp[:, 0] * cos_r - kp[:, 1] * sin_r
            y_new = kp[:, 0] * sin_r + kp[:, 1] * cos_r
            kp[:, 0], kp[:, 1] = x_new, y_new
            aug[start:start+63] = kp.flatten()

        aug += noise
        augmented.append(aug)
    return augmented

print("Augmenting data (4x per sample)...")
X_aug, Y_aug = [], []
for x, y in zip(X_norm, Y_raw):
    X_aug.append(x)
    Y_aug.append(y)
    for aug in augment(x, n=4):
        X_aug.append(aug)
        Y_aug.append(y)

X_aug = np.array(X_aug, dtype=np.float32)
Y_aug = np.array(Y_aug)
print(f"Augmented dataset: {X_aug.shape[0]} samples")

# Shuffle
idx = np.random.permutation(len(X_aug))
X_aug, Y_aug = X_aug[idx], Y_aug[idx]

Y_cat = to_categorical(Y_aug, num_classes=len(actions)).astype(int)

X_train, X_test, Y_train, Y_test = train_test_split(
    X_aug, Y_cat, test_size=0.15, random_state=42, stratify=Y_aug
)
print(f"Train: {X_train.shape[0]}  Test: {X_test.shape[0]}")

# ── Model ─────────────────────────────────────────────────────────────────────
model = Sequential([
    Dense(512, activation='relu', input_shape=(126,)),
    BatchNormalization(),
    Dropout(0.4),
    Dense(256, activation='relu'),
    BatchNormalization(),
    Dropout(0.3),
    Dense(128, activation='relu'),
    BatchNormalization(),
    Dropout(0.2),
    Dense(64, activation='relu'),
    Dense(len(actions), activation='softmax')
])

model.compile(optimizer='adam', loss='categorical_crossentropy',
              metrics=['categorical_accuracy'])
model.summary()

callbacks = [
    EarlyStopping(patience=20, restore_best_weights=True, verbose=1),
    ReduceLROnPlateau(factor=0.5, patience=8, verbose=1)
]

model.fit(X_train, Y_train,
          epochs=300,
          batch_size=64,
          validation_split=0.1,
          callbacks=callbacks,
          verbose=1)

model.save('my_model')
print("Model saved to my_model/")

# ── Evaluation ────────────────────────────────────────────────────────────────
preds = np.argmax(model.predict(X_test, verbose=0), axis=1)
truth = np.argmax(Y_test, axis=1)
print(f"\nTest accuracy: {accuracy_score(truth, preds):.4f}")
print(classification_report(truth, preds, target_names=actions))
