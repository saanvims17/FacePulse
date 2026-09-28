import cv2
from ultralytics import YOLO

# Load our fine-tuned YOLO face detection model
model = YOLO("models/best.pt")

# Open MacBook camera
camera = cv2.VideoCapture(0)

if not camera.isOpened():
    print("Could not open camera")
    exit()

while True:

    # Capture a frame from the camera
    success, frame = camera.read()

    if not success:
        print("Could not read frame")
        break

    # Run face detection
    results = model(
        frame,
        conf=0.5,
        verbose=False
    )

    # Draw bounding boxes and confidence scores
    annotated_frame = results[0].plot()

    # Display result
    cv2.imshow(
        "FacePulse - Face Detection",
        annotated_frame
    )

    # Press Q to quit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

camera.release()
cv2.destroyAllWindows()