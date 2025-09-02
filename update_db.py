import sqlite3

conn = sqlite3.connect('matches.db')  # หรือชื่อไฟล์ฐานข้อมูลของคุณ
c = conn.cursor()

try:
    c.execute("ALTER TABLE matches ADD COLUMN match_name TEXT")
    print("เพิ่มคอลัมน์ match_name สำเร็จ")
except sqlite3.OperationalError as e:
    print("เกิดข้อผิดพลาด:", e)

conn.commit()
conn.close()
