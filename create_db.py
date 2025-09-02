import sqlite3

# สร้าง/เชื่อมต่อกับฐานข้อมูล
conn = sqlite3.connect('match_results.db')
c = conn.cursor()

# สร้างตารางเก็บผลการแข่งขัน
c.execute('''
    CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_type TEXT NOT NULL,           -- แบบเดียว, คู่, หรือทีม
        team_a_score INTEGER NOT NULL,
        team_b_score INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
''')

# ปิดการเชื่อมต่อ
conn.commit()
conn.close()

print("✅ สร้างฐานข้อมูล match_results.db และตาราง matches เรียบร้อยแล้ว")
