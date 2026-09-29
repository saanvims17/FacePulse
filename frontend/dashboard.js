// FACEPULSE - TEACHER DASHBOARD

// DOM ELEMENTS

const startButton =
    document.getElementById("start-attendance");

const recognizeButton =
    document.getElementById("recognize-current");

const nextButton =
    document.getElementById("next-student");

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

const totalStudentsCount =
    document.getElementById("total-students");

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

let isRecognizing = false;

let presentStudents = 0;


let totalStudents = 0;

let recognitionThreshold = 0.60;


// Keep track of students already
// displayed during this attendance session.

const recognizedStudents =
    new Set();


// ============================================================
// FASTAPI URL
// ============================================================

const API_URL =
    "http://127.0.0.1:8000";

const FRONTEND_URL =
    "http://127.0.0.1:5500/teacher-dashboard.html";


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

async function loadDashboard() {
    try {
        const [summaryResponse, attendanceResponse, healthResponse] = await Promise.all([
            fetch(`${API_URL}/dashboard/summary`),
            fetch(`${API_URL}/attendance/today`),
            fetch(`${API_URL}/health`)
        ]);
        if (!summaryResponse.ok || !attendanceResponse.ok || !healthResponse.ok) return;
        const summary = await summaryResponse.json();
        const attendance = await attendanceResponse.json();
        const health = await healthResponse.json();
        recognitionThreshold = health.recognition_threshold ?? recognitionThreshold;
        totalStudents = summary.total_students;
        presentStudents = summary.present_today;
        updateAttendanceStats();
        if (attendanceList) attendanceList.innerHTML = "";
        if (recentAttendance) recentAttendance.innerHTML = "";
        attendance.attendance.slice().reverse().forEach(record => addAttendance({
            name: record.name,
            id: record.student_id,
            time: record.time
        }, false));
    } catch (error) {
        console.warn("Could not load dashboard data:", error);
    }
}

loadDashboard();


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

recognizeButton.addEventListener("click", recognizeFace);
nextButton.addEventListener("click", prepareNextStudent);


// ============================================================
// START ATTENDANCE
// ============================================================

async function startAttendance() {

    if (window.location.protocol === "file:") {
        cameraMessage.textContent =
            `Open ${FRONTEND_URL} in your browser. The dashboard cannot call FastAPI when opened as a file.`;
        return;
    }

    try {
        // Start a manual, one-student-at-a-time session. Existing attendance
        // stays visible; it is stored for the whole day in SQLite.
        recognizedStudents.clear();

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
            "Ready for one student. Ask them to face the camera, then click Recognise Student.";


        // --------------------------------
        // Update button
        // --------------------------------

        startButton.classList.add(
            "active"
        );


        startButton.innerHTML =
            "<span>■</span> End Attendance";


        recognizeButton.disabled = false;
        nextButton.disabled = true;


        console.log(
            "Attendance session started."
        );

    }


    catch (error) {

        console.error(
            "Camera error:",
            error
        );


        cameraMessage.textContent = describeCameraError(error);

        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }

        recognizeButton.disabled = true;
        nextButton.disabled = true;

    }

}


function prepareNextStudent() {
    if (!attendanceStarted) return;

    cameraMessage.textContent =
        "Ready for the next student. Ask them to face the camera, then click Recognise Student.";
    recognizeButton.disabled = false;
    nextButton.disabled = true;
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

    recognizeButton.disabled = true;


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

            cameraMessage.textContent = "Could not capture the camera frame. Click Next Student and try again.";
            nextButton.disabled = false;

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
                errorData?.detail || "Recognition error. Check that FastAPI is running.";

            nextButton.disabled = false;

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


            cameraMessage.textContent = result.attendance_marked
                ? `✓ Recognised: ${student.name} — Present (${similarity.toFixed(2)})`
                : `✓ Recognised: ${student.name} — already marked today`;


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

            if (result.attendance_marked && !recognizedStudents.has(studentKey)) {

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

            nextButton.disabled = false;

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
                `Unknown: similarity ${similarity.toFixed(2)} is below the ${recognitionThreshold.toFixed(2)} threshold. Register this student first, or improve lighting and face position.`;

            nextButton.disabled = false;


            console.log(
                `Unknown face. Similarity: ${similarity.toFixed(3)}`
            );

        }


        // ====================================================
        // MORE THAN ONE PERSON IN FRAME
        // ====================================================

        else if (result.status === "MultipleFaces") {

            cameraMessage.textContent =
                "More than one face is visible. Keep one student in frame, then click Next Student.";

            nextButton.disabled = false;

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

            nextButton.disabled = false;

        }

    }


    catch (error) {

        console.error(
            "Recognition error:",
            error
        );


        cameraMessage.textContent =
            "Connection error. Start FastAPI on port 8000, then try again.";

        nextButton.disabled = false;

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

    totalStudentsCount.textContent = totalStudents;

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

function addAttendance(student, increment = true) {

    // --------------------------------
    // Increase present count
    // --------------------------------

    if (increment) presentStudents++;


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
    isRecognizing =
        false;

    recognizeButton.disabled = true;
    nextButton.disabled = true;


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
