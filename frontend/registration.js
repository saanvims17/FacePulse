const cameraButton = document.getElementById("camera-button");
const camera = document.getElementById("camera");
const cameraContainer = document.querySelector(".camera-container");
const cameraStatus = document.getElementById("camera-status");
const registrationForm = document.getElementById("registration-form");
const message = document.getElementById("message");

let cameraStream = null;


// ========================================
// ENABLE CAMERA
// ========================================

cameraButton.addEventListener("click", async function () {

    try {

        // Ask browser for camera permission
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user"
            },
            audio: false
        });

        // Connect camera stream to video element
        camera.srcObject = cameraStream;

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

        message.textContent =
            "Unable to access the camera. Please allow camera permission.";

        message.className = "message error";
    }

});


// ========================================
// STUDENT REGISTRATION
// ========================================

registrationForm.addEventListener("submit", function (event) {

    // Prevent page refresh
    event.preventDefault();


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


    // ====================================
    // STUDENT DATA
    // ====================================

    const studentData = {

        name: name,

        studentId: studentId,

        department: department,

        year: year,

        section: section

    };


    console.log("Student registration:", studentData);


    // ====================================
    // TEMPORARY SUCCESS MESSAGE
    // ====================================

    message.textContent =
        "Face registration captured successfully.";

    message.className = "message success";


    /*
        ========================================
        FUTURE BACKEND CONNECTION
        ========================================

        This is where we will eventually:

        1. Capture multiple face frames
        2. Send the frames to FastAPI
        3. YOLO detects the face
        4. Face recognition model generates
           face embeddings
        5. FastAPI sends student information
           to PostgreSQL
        6. Face embedding is stored using pgvector

        Example:

        Browser
           ↓
        Camera Frame
           ↓
        FastAPI
           ↓
        YOLO11
           ↓
        Face Recognition
           ↓
        Face Embedding
           ↓
        PostgreSQL + pgvector
    */

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