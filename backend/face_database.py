# face_database.py
import sqlite3
import os
from datetime import datetime
from pathlib import Path


# --------------------------------------------------
# DATABASE PATH
# --------------------------------------------------

DATABASE_DIR = Path(os.getenv(
    "FACEPULSE_DATABASE_DIR",
    str(Path(__file__).parent.parent / "database")
))
DATABASE_DIR.mkdir(exist_ok=True)

DATABASE_PATH = DATABASE_DIR / "facepulse.db"


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------

def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)

    # Allows access to columns using their names
    connection.row_factory = sqlite3.Row

    return connection


# --------------------------------------------------
# INITIALIZE DATABASE
# --------------------------------------------------

def initialize_database():

    connection = get_connection()
    cursor = connection.cursor()

    # Students
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            student_id TEXT UNIQUE NOT NULL,

            name TEXT NOT NULL,

            department TEXT NOT NULL,

            year INTEGER NOT NULL,

            section TEXT NOT NULL,

            created_at TEXT NOT NULL
        )
    """)

    # Attendance
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            student_id INTEGER NOT NULL,

            date TEXT NOT NULL,

            time TEXT NOT NULL,

            status TEXT NOT NULL DEFAULT 'Present',

            confidence REAL,

            FOREIGN KEY (student_id)
                REFERENCES students(id)
        )
    """)

    # The application-level check is retained for a friendly message, while
    # this unique index makes concurrent requests safe.
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_per_student_per_day
        ON attendance(student_id, date)
    """)

    connection.commit()
    connection.close()


# --------------------------------------------------
# ADD STUDENT
# --------------------------------------------------

def add_student(
    student_id,
    name,
    department,
    year,
    section
):
    """
    Add a student and return the internal database ID.

    Example:

    BMS001
       ↓
    database ID = 1
    """

    connection = get_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            INSERT INTO students
            (
                student_id,
                name,
                department,
                year,
                section,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            student_id,
            name,
            department,
            year,
            section,
            datetime.now().isoformat()
        ))

        connection.commit()

        # Get automatically generated ID
        database_id = cursor.lastrowid

        return database_id

    except sqlite3.IntegrityError:

        # Student ID already exists
        return None

    finally:

        connection.close()


# --------------------------------------------------
# GET STUDENT BY DATABASE ID
# --------------------------------------------------

def get_student_by_id(student_database_id):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM students
        WHERE id = ?
    """, (student_database_id,))

    student = cursor.fetchone()

    connection.close()

    if student:
        return dict(student)

    return None


# --------------------------------------------------
# GET STUDENT BY STUDENT ID
# --------------------------------------------------

def get_student(student_id):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM students
        WHERE student_id = ?
    """, (student_id,))

    student = cursor.fetchone()

    connection.close()

    if student:
        return dict(student)

    return None


# --------------------------------------------------
# GET ALL STUDENTS
# --------------------------------------------------

def get_all_students():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM students
        ORDER BY name
    """)

    students = cursor.fetchall()

    connection.close()

    return [dict(student) for student in students]


# --------------------------------------------------
# MARK ATTENDANCE
# --------------------------------------------------

def mark_attendance(
    student_database_id,
    confidence
):

    connection = get_connection()
    cursor = connection.cursor()

    now = datetime.now()

    date = now.strftime("%Y-%m-%d")
    time = now.strftime("%H:%M:%S")

    cursor.execute("""
        INSERT OR IGNORE INTO attendance
        (
            student_id,
            date,
            time,
            status,
            confidence
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        student_database_id,
        date,
        time,
        "Present",
        confidence
    ))

    marked = cursor.rowcount == 1
    connection.commit()
    connection.close()

    return marked


# --------------------------------------------------
# TODAY'S ATTENDANCE
# --------------------------------------------------

def get_today_attendance():

    connection = get_connection()
    cursor = connection.cursor()

    today = datetime.now().strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT

            attendance.id,

            students.student_id,

            students.name,

            students.department,

            students.year,

            students.section,

            attendance.date,

            attendance.time,

            attendance.status,

            attendance.confidence

        FROM attendance

        JOIN students

        ON attendance.student_id = students.id

        WHERE attendance.date = ?

        ORDER BY attendance.time DESC
    """, (today,))

    records = cursor.fetchall()

    connection.close()

    return [dict(record) for record in records]


# --------------------------------------------------
# TODAY'S ATTENDANCE COUNT
# --------------------------------------------------

def get_today_attendance_count():

    connection = get_connection()
    cursor = connection.cursor()

    today = datetime.now().strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT COUNT(*)

        FROM attendance

        WHERE date = ?
    """, (today,))

    count = cursor.fetchone()[0]

    connection.close()

    return count


def get_total_student_count():
    connection = get_connection()
    count = connection.execute("SELECT COUNT(*) FROM students").fetchone()[0]
    connection.close()
    return count


def clear_facepulse_data():
    """Remove FacePulse attendance and student records from the active database."""
    connection = get_connection()
    try:
        cursor = connection.cursor()
        # Attendance must be removed first because it references students.
        cursor.execute("DELETE FROM attendance")
        cursor.execute("DELETE FROM students")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('students', 'attendance')")
        connection.commit()
    finally:
        connection.close()


# --------------------------------------------------
# TEST
# --------------------------------------------------

if __name__ == "__main__":

    initialize_database()

    print("FacePulse database initialized.")

    # Add test student
    database_id = add_student(
        student_id="TEST001",
        name="Test Student",
        department="CSBS",
        year=4,
        section="A"
    )

    if database_id:

        print(
            f"Student added with database ID: {database_id}"
        )

    else:

        print(
            "Student already exists."
        )

        student = get_student("TEST001")

        database_id = student["id"]

    # Get student
    student = get_student_by_id(database_id)

    print("\nStudent:")
    print(student)

    # Mark attendance
    marked = mark_attendance(
        student_database_id=database_id,
        confidence=0.91
    )

    if marked:
        print("\nAttendance marked.")
    else:
        print("\nAttendance already marked today.")

    # Show attendance
    records = get_today_attendance()

    print("\nToday's attendance:")

    for record in records:
        print(record)

    print(
        "\nPresent today:",
        get_today_attendance_count()
    )
