const cameraButton = document.getElementById("camera-button");
const camera = document.getElementById("camera");
const cameraContainer = document.querySelector(".camera-container");
const cameraStatus = document.getElementById("camera-status");
const registrationForm = document.getElementById("registration-form");
const message = document.getElementById("message");

let cameraStream = null;

const FRONTEND_URL =
    "http://127.0.0.1:5500/student-registration.html";

function describeCameraError(error) {
    switch (error.name) {
        case "NotAllowedError":
        case "SecurityError":
            return "Camera access is blocked. Use the camera icon in the address bar and set it to Allow, then reload this page.";
        case "NotFoundError":
            return "No camera was found. Connect a camera and try again.";
        case "NotReadableError":
            return "The camera is being used by another app. Close it and try again.";
        default:
            return "Could not access the camera. Check browser camera permissions and try again.";
    }
}

function waitForCameraReady() {
    if (camera.readyState >= HTMLMediaElement.HAVE_METADATA) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error("Camera preview did not start in time.")),
            8000
        );
        camera.addEventListener("loadedmetadata", () => {
            clearTimeout(timeout);
            resolve();
        }, { once: true });
    });
}

async function requestCamera() {
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "user" } },
            audio: false
        });
    } catch (error) {
        // A desktop camera may not support a user-facing constraint. Fall back
        // to the browser's default camera, but do not hide permission errors.
        if (error.name !== "OverconstrainedError") throw error;
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
}


// ========================================
// ENABLE CAMERA
// ========================================

cameraButton.addEventListener("click", async function () {

    try {

        // Ask browser for camera permission.
        cameraStream = await requestCamera();

        // Connect camera stream to video element
        camera.srcObject = cameraStream;
        await waitForCameraReady();
        await camera.play();

        // Show camera
        cameraContainer.classList.add("active");

        // Update camera status
        cameraStatus.classList.add("active");

        cameraStatus.innerHTML = `
            <span class="status-dot"></span>
            Camera ready
        `;

        // Update button
        cameraButton.textContent = "Camera Enabled";
        cameraButton.disabled = true;

        // Clear previous error
        message.textContent = "";
        message.className = "message";

    } catch (error) {

        console.error("Camera error:", error);

        message.textContent = describeCameraError(error);

        message.className = "message error";
    }

});


// ========================================
// STUDENT REGISTRATION
// ========================================

registrationForm.addEventListener("submit", async function (event) {

    // Prevent page refresh
    event.preventDefault();

    if (window.location.protocol === "file:") {
        message.textContent = `Open ${FRONTEND_URL} in your browser. Registration cannot call FastAPI when opened as a file.`;
        message.className = "message error";
        return;
    }


    // Get student details
    const name =
        document.getElementById("student-name").value.trim();

    const studentId =
        document.getElementById("student-id").value.trim();

    const department =
        document.getElementById("department").value;

    const year =
        document.getElementById("year").value;

    const section =
        document.getElementById("section").value.trim();

    const replaceFace =
        document.getElementById("replace-face").checked;


    // ====================================
    // VALIDATION
    // ====================================

    if (!name || !studentId || !department || !year || !section) {

        message.textContent =
            "Please fill in all student details.";

        message.className = "message error";

        return;
    }


    // Camera must be enabled

    if (!cameraStream) {

        message.textContent =
            "Please enable the camera before registering.";

        message.className = "message error";

        return;
    }


    if (!camera.videoWidth || !camera.videoHeight) {
        message.textContent = "Camera is still starting. Please try again.";
        message.className = "message error";
        return;
    }

    const captureFrame = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = camera.videoWidth;
        canvas.height = camera.videoHeight;
        canvas.getContext("2d").drawImage(camera, 0, 0, canvas.width, canvas.height);
        return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    };

    const formData = new FormData();
    formData.append("name", name);
    formData.append("student_id", studentId);
    formData.append("department", department);
    formData.append("year", year);
    formData.append("section", section);
    formData.append("replace_face", replaceFace);
    message.textContent = "Capturing three face frames…";
    message.className = "message";

    for (let frame = 1; frame <= 3; frame++) {
        const blob = await captureFrame();
        if (!blob) {
            message.textContent = "Could not capture the camera image.";
            message.className = "message error";
            return;
        }
        formData.append("face_image", blob, `registration-${frame}.jpg`);
        if (frame < 3) await new Promise(resolve => setTimeout(resolve, 350));
    }
    message.textContent = "Registering face…";

    try {
        const response = await fetch("http://127.0.0.1:8000/students/register", {
            method: "POST",
            body: formData
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.detail || "Registration failed.");
        }
        message.textContent = `Registered ${payload.student.name} successfully.`;
        message.className = "message success";
        registrationForm.reset();
    } catch (error) {
        console.error("Registration error:", error);
        message.textContent = error.message || "Could not connect to FacePulse.";
        message.className = "message error";
    }

});


// ========================================
// STOP CAMERA WHEN PAGE CLOSES
// ========================================

window.addEventListener("beforeunload", function () {

    if (cameraStream) {

        cameraStream
            .getTracks()
            .forEach(function (track) {
                track.stop();
            });

    }

});
