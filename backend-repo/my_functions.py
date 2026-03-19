import cv2
import numpy as np

# Hand connections for drawing (21 landmarks)
HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (0,5),(5,6),(6,7),(7,8),
    (5,9),(9,10),(10,11),(11,12),
    (9,13),(13,14),(14,15),(15,16),
    (13,17),(17,18),(18,19),(19,20),
    (0,17)
]

def draw_landmarks(image, detection_result):
    """Draw hand landmarks on image using cv2."""
    if not detection_result or not detection_result.hand_landmarks:
        return
    h, w = image.shape[:2]
    for hand_landmarks in detection_result.hand_landmarks:
        # Draw connections
        for a, b in HAND_CONNECTIONS:
            x1 = int(hand_landmarks[a].x * w)
            y1 = int(hand_landmarks[a].y * h)
            x2 = int(hand_landmarks[b].x * w)
            y2 = int(hand_landmarks[b].y * h)
            cv2.line(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
        # Draw points
        for lm in hand_landmarks:
            cx, cy = int(lm.x * w), int(lm.y * h)
            cv2.circle(image, (cx, cy), 4, (0, 0, 255), -1)

def keypoint_extraction(detection_result):
    """Extract 126 keypoints (left 63 + right 63) from HandLandmarker result."""
    lh = np.zeros(63)
    rh = np.zeros(63)

    if not detection_result or not detection_result.hand_landmarks:
        return np.concatenate([lh, rh])

    for i, hand_landmarks in enumerate(detection_result.hand_landmarks):
        flat = np.array([[lm.x, lm.y, lm.z] for lm in hand_landmarks]).flatten()
        if detection_result.handedness and i < len(detection_result.handedness):
            label = detection_result.handedness[i][0].category_name
            if label == 'Left':
                lh = flat
            else:
                rh = flat
        else:
            rh = flat

    return np.concatenate([lh, rh])
