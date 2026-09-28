import csv
import os
from datetime import datetime


ATTENDANCE_FILE = "attendance.csv"


def mark_attendance(name):
    """
    Mark a person as present if they
    have not already been marked today.
    """

    today = datetime.now().strftime("%Y-%m-%d")
    current_time = datetime.now().strftime("%H:%M:%S")

    # Check if attendance file exists
    if not os.path.exists(ATTENDANCE_FILE):

        with open(
            ATTENDANCE_FILE,
            "w",
            newline=""
        ) as file:

            writer = csv.writer(file)

            writer.writerow([
                "Name",
                "Date",
                "Time"
            ])

    # Read existing attendance
    with open(
        ATTENDANCE_FILE,
        "r",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:

            if (
                row["Name"] == name
                and row["Date"] == today
            ):

                return False

    # Mark attendance
    with open(
        ATTENDANCE_FILE,
        "a",
        newline=""
    ) as file:

        writer = csv.writer(file)

        writer.writerow([
            name,
            today,
            current_time
        ])

    return True