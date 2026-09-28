import cv2
from ultralytics import YOLO

model = YOLO("models/best.pt")

camera = cv2.VideoCapture(0)

if not camera.isOpened():
    print("Could not open camera")
    exit()

while True:

    success, frame = camera.read()

    if not success:
        print("Could not read frame")
        break

    results = model(
        frame,
        conf=0.5,
        verbose=False
    )

    for box in results[0].boxes:

        # Get bounding box coordinates
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)

        # Make sure coordinates stay inside the frame
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(frame.shape[1], x2)
        y2 = min(frame.shape[0], y2)

        # Crop the face
        face = frame[y1:y2, x1:x2]

        # Draw bounding box
        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        # Display cropped face
        if face.size > 0:
            cv2.imshow("Face Crop", face)

    cv2.imshow("FacePulse - Face Detection", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

camera.release()
cv2.destroyAllWindows()