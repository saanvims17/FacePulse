## FacePulse
**AI-Powered Face Recognition and Attendance System**

FacePulse is a real-time facial recognition and attendance management system that combines a fine-tuned YOLO face detector, ArcFace facial embeddings, FAISS similarity search, SQLite, FastAPI, and a browser-based teacher dashboard.

## System Design

![FacePulse System Architecture](https://github.com/user-attachments/assets/ea511944-494b-43ee-84fa-4596b1e84efd)

## 📑 Documentation

- [Features](#features)
- [Face Recognition Pipeline](#face-recognition-pipeline)
- [Student Registration](#student-registration)
- [Teacher Attendance Dashboard](#teacher-attendance-dashboard)
- [Database Design](#database-design)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Running FacePulse](#running-facepulse)

## Features

* Fine-tuned YOLO face detection
* ArcFace-based facial embeddings
* 512-dimensional face representation
* FAISS vector similarity search
* SQLite student and attendance database
* Browser-based webcam registration
* One-student-at-a-time recognition workflow
* Centralized Dashboard & Live Attendance Analytics
* Multiple-face detection protection
* Persistent FAISS index

## Face Recognition Pipeline

### 1. Face Detection — YOLO
The face detection model used by FacePulse was fine-tuned using YOLO on Google Colab.

> The resulting trained model is saved as:

`models/best.pt`

### Training Notebook

🔗 **[Open the Google Colab Training Notebook](https://colab.research.google.com/drive/12akDd5ruwcYUxL6WtMHv6Q_h8QUYwkWW?usp=sharing)**

### 2. Face Alignment
The YOLO crop is passed to InsightFace's landmark model.

FacePulse obtains facial landmarks and uses five standard facial points:

* Left Eye
* Right Eye
* Nose
* Left Mouth Corner
* Right Mouth Corner

These points are used to normalize and align the face before recognition.

### 3. ArcFace Embedding
The aligned face is passed through the ArcFace recognition model from InsightFace.

The resulting representation is:

512-dimensional embedding

The embedding is L2-normalized before being stored or compared.

FacePulse uses InsightFace's:

`buffalo_l`

model package with CPU execution.

### 4. FAISS Similarity Search

The 512-dimensional embedding is stored in a FAISS index.

The SQLite student's internal database ID is used as the FAISS vector ID.

Because the embeddings are normalized, inner-product similarity can be used for face matching.

#### Recognition Threshold

FacePulse uses a default recognition threshold of 0.60

It can be changed using the environment variable:

export `RECOGNITION_THRESHOLD`=0.60

The backend compares the best FAISS similarity score against this threshold.
```text
similarity >= threshold
        │
        ├── Yes → Student recognized
        │
        └── No  → Unknown face
```
### Student Registration

Students are registered through:

**`frontend/student-registration.html`**

<img width="1000" height="500" alt="student register" src="https://github.com/user-attachments/assets/9b17421f-7136-4d38-9274-8125d5b73be8" />

The registration form collects:

* Full name
* Student ID
* Department
* Year
* Section
* Face images (captured through webcam)

The browser requests webcam access using the MediaDevices API.

During registration, the frontend captures three camera frames and sends them to the FastAPI backend.

**Registration flow**
```text
Student Registration
│
├── Enter Student Details
│   ├── Student ID
│   ├── Name
│   ├── Department
│   ├── Year
│   └── Section
│
├── Enable Camera
│
├── Capture 3 Face Frames
│
├── Send Images to FastAPI
│
├── YOLO Face Detection
│   └── Verify exactly one face
│
├── Face Crop & Alignment
│
├── ArcFace
│   └── Generate 512-D Embedding
│
├── Average & Normalize Embeddings
│
├── Store Student Details
│   └── SQLite
│
└── Store Face Embedding
    └── FAISS
```

Using multiple frames reduces sensitivity to a single blink, pose, or poor frame during enrollment.

The backend accepts between 1 and 5 face images, while the current frontend sends three.

### Updating an Existing Student

The registration page contains an option:

Update the saved face for this existing Student ID

When enabled, the backend can replace the student's current face profile instead of creating a new student record.

The FAISS implementation removes the existing vector associated with that SQLite student ID before inserting the new embedding.

### Teacher Attendance Dashboard

> The teacher interface is:

**`frontend/teacher-dashboard.html`**

<img width="1000" height="500" alt="Dashboard " src="https://github.com/user-attachments/assets/16f90bed-033a-4a69-89ff-f94234443a92" />

The dashboard provides:

* Total students
* Present today
* Absent
* Attendance percentage
* Live camera
* Attendance session status
* Recognize Student button
* Next Student button
* Today's attendance log

The dashboard communicates directly with the FastAPI backend using JavaScript fetch() calls.

### One-Student-at-a-Time Attendance

FacePulse intentionally uses a manual one-student-at-a-time workflow.

**Workflow**

```text
Teacher Dashboard
│
├── Start Attendance Session
│
├── Start Webcam
│
├── Student Stands in Front of Camera
│
├── Capture Current Frame
│
├── YOLO Face Detection
│   └── Verify exactly one face
│
├── Face Crop & Alignment
│
├── ArcFace
│   └── Generate 512-D Embedding
│
├── FAISS Similarity Search
│
├── Check Similarity Score
│
├── Similarity ≥ 0.60?
│   │
│   ├── NO
│   │   └── Unknown Face
│   │
│   └── YES
│       ├── Identify Student
│       │
│       ├── Check Today's Attendance
│       │
│       └── Mark Present
│
└── Next Student
```

The backend rejects frames containing multiple detected faces rather than attempting to assign attendance to an ambiguous group.

### Database Design

FacePulse uses SQLite for structured application data.

**Students**

| Column | Description |
|---|---|
| `id` | Primary key |
| `student_id` | Unique student identifier |
| `name` | Student name |
| `department` | Department |
| `year` | Academic year |
| `section` | Section |
| `created_at` | Registration timestamp |

`student_id` is unique.

**Attendance**

| Column | Description |
|---|---|
| `id` | Primary key |
| `student_id` | Reference to student |
| `date` | Attendance date |
| `time` | Attendance time |
| `status` | Attendance status |
| `confidence` | Face recognition similarity/confidence |

A student can have only one attendance record per day.

### FAISS Database

The persistent vector index is stored at:

**`database/face_index.faiss`**

Each registered student has one current face embedding.

The mapping is:
```text
SQLite Student ID

        │

        └──────────────► FAISS Vector ID
```
This allows FacePulse to perform fast vector similarity searches while keeping student metadata in SQLite.

### FastAPI Backend

The main backend application is:

**`backend/main.py`**

It initializes:

SQLite database
YOLO detector
ArcFace embedding model
FAISS vector database

when the FastAPI application starts.

### Project Structure

```text
FacePulse/
│
├── backend/
│   ├── main.py
│   ├── face_database.py
│   ├── face_embedding.py
│   └── vector_database.py
│
├── database/
│   ├── facepulse.db
│   └── face_index.faiss
│
├── frontend/
│   ├── teacher-dashboard.html
│   ├── dashboard.css
│   ├── dashboard.js
│   ├── student-registration.html
│   ├── registration.css
│   └── registration.js
│
├── models/
│   └── best.pt
│
├── attendance.py
├── camera.py
├── detect_faces.py
├── face_crop.py
├── face_matcher.py
└── recognize_faces.py
```

### Technology Stack

| Layer | Technology |
|---|---|
| **Programming Language** | Python |
| **Face Detection** | Fine-tuned YOLO |
| **Face Recognition** | ArcFace |
| **Face Embeddings** | InsightFace |
| **Vector Search** | FAISS |
| **Database** | SQLite |
| **Backend API** | FastAPI |
| **Computer Vision** | OpenCV |
| **Frontend** | HTML, CSS, JavaScript |
| **Camera** | Browser MediaDevices API |
| **Numerical Computing** | NumPy |
| **Model Runtime** | PyTorch / ONNX-based InsightFace components |

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/saanvims17/FacePulse.git
cd FacePulse
```

### 2. Create a virtual environment

```bash
python3 -m venv .venv
```

Activate the environment:

**macOS / Linux**
```bash
source .venv/bin/activate
```

**Windows**
```powershell
.venv\Scripts\activate
```

### 3. Install the required Python packages

The repository currently does not contain a committed `requirements.txt`, so install the core dependencies manually:

```bash
pip install fastapi
pip install uvicorn
pip install python-multipart
pip install opencv-python
pip install numpy
pip install ultralytics
pip install insightface
pip install onnxruntime
pip install faiss-cpu
```

> **Note:** Depending on the platform and installed PyTorch/InsightFace versions, additional compatibility packages may be required.

## Running FacePulse

FacePulse consists of two local processes:

```text
Browser Frontend
      │
      │ HTTP
      ▼
FastAPI Backend
      │
      ├── YOLO
      ├── ArcFace
      ├── FAISS
      └── SQLite
```

### 1. Start the FastAPI Backend

From the project root:

```bash
python -m uvicorn backend.main:app --reload
```

The API will normally be available at:

🔗 **[FastAPI Backend](http://127.0.0.1:8000)**

FastAPI documentation:

🔗 **[FastAPI Swagger Documentation](http://127.0.0.1:8000/docs)**

### 2. Start the Frontend

Open another terminal from the frontend directory:

```bash
cd frontend
python3 -m http.server 5500
```

Then open:

**Teacher Dashboard:**
http://127.0.0.1:5500/teacher-dashboard.html

**Student Registration:**
http://127.0.0.1:5500/student-registration.html

The frontend JavaScript is configured to communicate with FastAPI at:

🔗 **[FastAPI Backend](http://127.0.0.1:8000)**

The backend permits the local frontend port `5500` through its default CORS configuration.

## Register a Student

Open the **Student Registration** page:

🔗 **[Student Registration](http://127.0.0.1:5500/student-registration.html)**

Enter the following details:

- Full Name
- Student ID
- Department
- Year
- Section

Then:

1. Click **Enable Camera**.
2. Position one face inside the guide.
3. Click **Complete Registration**.
4. The browser captures three frames.
5. FastAPI detects the face using YOLO.
6. ArcFace generates a 512-dimensional embedding for each frame.
7. The embeddings are averaged and normalized.
8. Student metadata is stored in SQLite.
9. The final embedding is stored in FAISS.

## 📸 Mark Attendance

Open the **Teacher Dashboard**:

🔗 **[Teacher Dashboard](http://127.0.0.1:5500/teacher-dashboard.html)**

### Attendance Workflow

1. Click **Start Attendance**.
2. Allow camera access.
3. Ask one student to stand in front of the camera.
4. Click **Recognise Student**.
5. FacePulse captures the current camera frame.
6. YOLO detects the face.
7. ArcFace generates the face embedding.
8. FAISS searches the registered embeddings.
9. The similarity score is compared against the configured threshold.
10. If the student is recognized, attendance is recorded in SQLite.
11. Click **Next Student** and repeat the process.

### Why YOLO + ArcFace?

FacePulse uses two different models because they solve two different problems in the face recognition pipeline.

**YOLO — Face Detection** 

**Question:**  
> **Where is the face?**

YOLO detects faces in the camera frame and returns their **bounding boxes**.

```text
Camera Frame
     ↓
YOLO
     ↓
Face Bounding Box
```

### FacePulse

Detect → Embed → Match → Verify → Record

A modular AI-powered attendance system built around modern face detection, facial embeddings, vector similarity search, and web-based application development.
