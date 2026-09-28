import cv2

# Connect to the MacBook's camera
camera = cv2.VideoCapture(0)

# Check whether the camera opened successfully
if not camera.isOpened():
    print("Could not open camera")
    exit()

while True:

    # Capture one frame
    success, frame = camera.read()

    # Check if frame was captured
    if not success:
        print("Could not read frame")
        break

    # Display the frame
    cv2.imshow("FacePulse", frame)

    # Press q to quit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

# Release the camera
camera.release()

# Close the camera window
cv2.destroyAllWindows()