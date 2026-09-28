import cv2
import numpy as np
from ultralytics import YOLO
from insightface.app import FaceAnalysis

# Load fine-tuned YOLO face detector
yolo = YOLO("models/best.pt")

# Load ArcFace
app = FaceAnalysis(
    name="buffalo_l",
    providers=["CPUExecutionProvider"]
)

app.prepare(
    ctx_id=0,
    det_size=(640, 640)
)

# Open MacBook camera
camera = cv2.VideoCapture(0)

if not camera.isOpened():
    print("Could not open camera")
    exit()

while True:

    success, frame = camera.read()

    if not success:
        print("Could not read frame")
        break

    # -----------------------------------------
    # 1. YOLO detects faces
    # -----------------------------------------
    results = yolo(
        frame,
        conf=0.5,
        verbose=False
    )

    # -----------------------------------------
    # 2. Extract each detected face
    # -----------------------------------------
    for box in results[0].boxes:

        x1, y1, x2, y2 = (
            box.xyxy[0]
            .cpu()
            .numpy()
            .astype(int)
        )

        # Keep coordinates inside frame
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(frame.shape[1], x2)
        y2 = min(frame.shape[0], y2)

        # Crop face
        face_crop = frame[y1:y2, x1:x2]

        if face_crop.size == 0:
            continue

        # -----------------------------------------
        # 3. Send face crop to ArcFace
        # -----------------------------------------
        faces = app.get(face_crop)

        if len(faces) == 0:
            continue

        face = faces[0]

        # -----------------------------------------
        # 4. Get face embedding
        # -----------------------------------------
        embedding = face.embedding

        print("Embedding shape:", embedding.shape)
        print("First 10 values:", embedding[:10])

        # -----------------------------------------
        # 5. Draw bounding box
        # -----------------------------------------
        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            "Face + Embedding",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

    # Display camera
    cv2.imshow(
        "FacePulse - Face Recognition",
        frame
    )

    # Press Q to quit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

camera.release()
cv2.destroyAllWindows()