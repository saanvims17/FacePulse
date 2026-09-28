// FACEPULSE - TEACHER DASHBOARD

// DOM ELEMENTS

const startButton =
    document.getElementById("start-attendance");

const camera =
    document.getElementById("attendance-camera");

const cameraContainer =
    document.getElementById("camera-container");

const cameraPlaceholder =
    document.getElementById("camera-placeholder");

const sessionStatus =
    document.getElementById("session-status");

const cameraMessage =
    document.getElementById("camera-message");

const pulseDot =
    document.getElementById("pulse-dot");

const presentCount =
    document.getElementById("present-count");

const absentCount =
    document.getElementById("absent-count");

const attendancePercentage =
    document.getElementById("attendance-percentage");

const resultCount =
    document.getElementById("result-count");

const attendanceList =
    document.getElementById("attendance-list");

const recentAttendance =
    document.getElementById("recent-attendance");

const currentDate =
    document.getElementById("current-date");

const currentTime =
    document.getElementById("current-time");


// ============================================================
// VARIABLES
// ============================================================

let cameraStream = null;

let attendanceStarted = false;

let recognitionInterval = null;

let isRecognizing = false;

let presentStudents = 0;


// Temporary value.
// Later this can come from the database.

const totalStudents = 60;


// Keep track of students already
// displayed during this attendance session.

const recognizedStudents =
    new Set();


// ============================================================
// FASTAPI URL
// ============================================================

const API_URL =
    "http://127.0.0.1:8000";


// ============================================================
// CURRENT DATE & TIME
// ============================================================

function updateDateTime() {

    const now =
        new Date();


    currentDate.textContent =
        now.toLocaleDateString(
            "en-IN",
            {
                day: "numeric",
                month: "long",
                year: "numeric"
            }
        );


    currentTime.textContent =
        now.toLocaleTimeString(
            "en-IN",
            {
                hour: "numeric",
                minute: "2-digit",
                hour12: true
            }
        );

}


updateDateTime();


setInterval(
    updateDateTime,
    1000
);


// ============================================================
// START / STOP ATTENDANCE BUTTON
// ============================================================

startButton.addEventListener(
    "click",
    async function () {

        if (!attendanceStarted) {

            await startAttendance();

        }

        else {

            stopAttendance();

        }

    }
);


// ============================================================
// START ATTENDANCE
// ============================================================

async function startAttendance() {

    try {
        // Reset session
        recognizedStudents.clear();

        presentStudents = 0;

        updateAttendanceStats();

        // Clear previous attendance UI
        if (attendanceList) {

            attendanceList.innerHTML =
                "";

        }


        if (recentAttendance) {

            recentAttendance.innerHTML =
                "";

        }

        // Request camera
        cameraStream =
            await navigator.mediaDevices.getUserMedia(
                {
                    video: {
                        facingMode: "user"
                    },

                    audio: false
                }
            );


        // --------------------------------
        // Attach camera stream
        // --------------------------------

        camera.srcObject =
            cameraStream;


        // Make sure video starts
        await camera.play();


        // --------------------------------
        // Update camera UI
        // --------------------------------

        cameraContainer.classList.add(
            "active"
        );


        if (cameraPlaceholder) {

            cameraPlaceholder.style.display =
                "none";

        }


        attendanceStarted =
            true;


        // --------------------------------
        // Update session status
        // --------------------------------

        sessionStatus.classList.add(
            "active"
        );


        sessionStatus.innerHTML = `
            <span></span>
            Session active
        `;


        pulseDot.classList.add(
            "active"
        );


        cameraMessage.textContent =
            "Scanning for students...";


        // --------------------------------
        // Update button
        // --------------------------------

        startButton.classList.add(
            "active"
        );


        startButton.innerHTML =
            "<span>■</span> End Attendance";


        // --------------------------------
        // Start recognition
        // --------------------------------

        if (recognitionInterval) {

            clearInterval(
                recognitionInterval
            );

        }


        /*
            Capture a frame every 2 seconds.

            Camera
                ↓
            FastAPI
                ↓
            Face detection / embedding
                ↓
            FAISS
                ↓
            SQLite
                ↓
            Attendance
        */

        recognitionInterval =
            setInterval(
                recognizeFace,
                2000
            );


        // --------------------------------
        // Perform first recognition
        // immediately
        // --------------------------------

        setTimeout(
            recognizeFace,
            500
        );


        console.log(
            "Attendance session started."
        );

    }


    catch (error) {

        console.error(
            "Camera error:",
            error
        );


        cameraMessage.textContent =
            "Camera permission required.";


        alert(
            "Could not access the camera. Please allow camera permission."
        );

    }

}


// ============================================================
// CAPTURE CAMERA FRAME
// ============================================================

function captureFrame() {

    const canvas =
        document.createElement(
            "canvas"
        );


    canvas.width =
        camera.videoWidth;


    canvas.height =
        camera.videoHeight;


    const context =
        canvas.getContext(
            "2d"
        );


    context.drawImage(
        camera,
        0,
        0,
        canvas.width,
        canvas.height
    );


    return canvas;

}


// ============================================================
// RECOGNIZE FACE
// ============================================================

async function recognizeFace() {

    // --------------------------------
    // Safety checks
    // --------------------------------

    if (!attendanceStarted) {

        return;

    }


    if (!cameraStream) {

        return;

    }


    if (camera.videoWidth === 0) {

        return;

    }


    // --------------------------------
    // Prevent overlapping requests
    // --------------------------------

    if (isRecognizing) {

        return;

    }


    isRecognizing =
        true;


    try {

        // --------------------------------
        // Capture current camera frame
        // --------------------------------

        const canvas =
            captureFrame();


        // --------------------------------
        // Convert frame to JPEG
        // --------------------------------

        const blob =
            await new Promise(
                function (resolve) {

                    canvas.toBlob(
                        resolve,
                        "image/jpeg",
                        0.8
                    );

                }
            );


        if (!blob) {

            console.error(
                "Could not create image blob."
            );

            return;

        }


        // --------------------------------
        // Create FormData
        // --------------------------------

        const formData =
            new FormData();


        formData.append(
            "face_image",
            blob,
            "camera.jpg"
        );


        // --------------------------------
        // Send frame to FastAPI
        // --------------------------------

        const response =
            await fetch(
                `${API_URL}/attendance/recognize`,
                {
                    method: "POST",
                    body: formData
                }
            );


        // --------------------------------
        // Handle HTTP error
        // --------------------------------

        if (!response.ok) {

            const errorData =
                await response
                    .json()
                    .catch(
                        () => null
                    );


            console.error(
                "Backend error:",
                errorData
            );


            cameraMessage.textContent =
                "Recognition error.";

            return;

        }


        // --------------------------------
        // Read backend response
        // --------------------------------

        const result =
            await response.json();


        console.log(
            "Recognition result:",
            result
        );


        // ====================================================
        // STUDENT RECOGNIZED
        // ====================================================

        if (
            result.status ===
            "Present"
        ) {

            const student =
                result.student;


            if (!student) {

                console.error(
                    "Student information missing."
                );

                return;

            }


            const similarity =
                result.similarity !== undefined
                    ? result.similarity
                    : 0;


            // --------------------------------
            // Update camera message
            // --------------------------------

            cameraMessage.textContent =
                `✓ ${student.name} — Present`;


            // --------------------------------
            // Unique student ID
            // --------------------------------

            const studentKey =
                String(
                    student.student_id
                );


            // --------------------------------
            // Add student only once
            // --------------------------------

            if (
                !recognizedStudents.has(
                    studentKey
                )
            ) {

                recognizedStudents.add(
                    studentKey
                );


                addAttendance({

                    name:
                        student.name,

                    id:
                        student.student_id,

                    time:
                        new Date()
                            .toLocaleTimeString(
                                "en-IN",
                                {
                                    hour:
                                        "numeric",

                                    minute:
                                        "2-digit",

                                    hour12:
                                        true
                                }
                            )

                });

            }


            // --------------------------------
            // Console information
            // --------------------------------

            console.log(
                `Recognized: ${student.name}`
            );


            console.log(
                `Student ID: ${student.student_id}`
            );


            console.log(
                `Similarity: ${similarity.toFixed(3)}`
            );

        }


        // ====================================================
        // UNKNOWN FACE
        // ====================================================

        else if (
            result.status ===
            "Unknown"
        ) {

            const similarity =
                result.similarity !== undefined
                    ? result.similarity
                    : 0;


            cameraMessage.textContent =
                `Face not recognized — ${similarity.toFixed(2)}`;


            console.log(
                `Unknown face. Similarity: ${similarity.toFixed(3)}`
            );

        }


        // ====================================================
        // UNEXPECTED RESPONSE
        // ====================================================

        else {

            console.warn(
                "Unexpected backend response:",
                result
            );


            cameraMessage.textContent =
                "Unable to recognize face.";

        }

    }


    catch (error) {

        console.error(
            "Recognition error:",
            error
        );


        cameraMessage.textContent =
            "Connection error.";

    }


    finally {

        isRecognizing =
            false;

    }

}


// ============================================================
// UPDATE ATTENDANCE STATISTICS
// ============================================================

function updateAttendanceStats() {

    // --------------------------------
    // Present
    // --------------------------------

    presentCount.textContent =
        presentStudents;


    // --------------------------------
    // Absent
    // --------------------------------

    absentCount.textContent =
        Math.max(
            totalStudents -
            presentStudents,
            0
        );


    // --------------------------------
    // Percentage
    // --------------------------------

    const percentage =
        totalStudents > 0
            ? Math.round(
                (
                    presentStudents /
                    totalStudents
                ) * 100
            )
            : 0;


    attendancePercentage.textContent =
        percentage + "%";


    // --------------------------------
    // Result count
    // --------------------------------

    resultCount.textContent =
        presentStudents;

}


// ============================================================
// ADD ATTENDANCE TO DASHBOARD
// ============================================================

function addAttendance(student) {

    // --------------------------------
    // Increase present count
    // --------------------------------

    presentStudents++;


    updateAttendanceStats();


    // --------------------------------
    // Remove empty state
    // --------------------------------

    if (
        presentStudents === 1
    ) {

        if (attendanceList) {

            attendanceList.innerHTML =
                "";

        }


        if (recentAttendance) {

            recentAttendance.innerHTML =
                "";

        }

    }


    // --------------------------------
    // Generate initials
    // --------------------------------

    const initials =
        student.name
            .split(" ")
            .map(
                word =>
                    word[0]
            )
            .join("")
            .substring(
                0,
                2
            )
            .toUpperCase();


    // ========================================================
    // LIVE ATTENDANCE LIST
    // ========================================================

    const item =
        document.createElement(
            "div"
        );


    item.className =
        "attendance-item";


    item.innerHTML = `

        <div class="student-info">

            <div class="student-avatar">
                ${initials}
            </div>

            <div>

                <strong>
                    ${student.name}
                </strong>

                <span>
                    ${student.id}
                </span>

            </div>

        </div>

        <span class="attendance-time">
            ${student.time}
        </span>

    `;


    if (attendanceList) {

        attendanceList.prepend(
            item
        );

    }


    // ========================================================
    // RECENT ATTENDANCE TABLE
    // ========================================================

    const row =
        document.createElement(
            "tr"
        );


    row.innerHTML = `

        <td>
            <strong>
                ${student.name}
            </strong>
        </td>

        <td>
            ${student.id}
        </td>

        <td>
            ${student.time}
        </td>

        <td>
            <span class="status-present">
                Present
            </span>
        </td>

    `;


    if (recentAttendance) {

        recentAttendance.prepend(
            row
        );

    }

}


// ============================================================
// STOP ATTENDANCE
// ============================================================

function stopAttendance() {

    // --------------------------------
    // Stop recognition timer
    // --------------------------------

    if (recognitionInterval) {

        clearInterval(
            recognitionInterval
        );

        recognitionInterval =
            null;

    }


    isRecognizing =
        false;


    // --------------------------------
    // Stop camera
    // --------------------------------

    if (cameraStream) {

        cameraStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );

        cameraStream =
            null;

    }


    camera.srcObject =
        null;


    // --------------------------------
    // Update camera UI
    // --------------------------------

    cameraContainer.classList.remove(
        "active"
    );


    if (cameraPlaceholder) {

        cameraPlaceholder.style.display =
            "";

    }


    // --------------------------------
    // Update session state
    // --------------------------------

    attendanceStarted =
        false;


    sessionStatus.classList.remove(
        "active"
    );


    sessionStatus.innerHTML = `
        <span></span>
        Session inactive
    `;


    pulseDot.classList.remove(
        "active"
    );


    cameraMessage.textContent =
        "Camera inactive";


    // --------------------------------
    // Reset button
    // --------------------------------

    startButton.classList.remove(
        "active"
    );


    startButton.innerHTML =
        "<span>▶</span> Start Attendance";


    console.log(
        "Attendance session ended."
    );

}


// ============================================================
// PAGE CLOSE
// ============================================================

window.addEventListener(
    "beforeunload",
    function () {

        // --------------------------------
        // Stop recognition
        // --------------------------------

        if (recognitionInterval) {

            clearInterval(
                recognitionInterval
            );

        }


        // --------------------------------
        // Stop camera
        // --------------------------------

        if (cameraStream) {

            cameraStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

        }

    }
);