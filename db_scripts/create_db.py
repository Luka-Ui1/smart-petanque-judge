from flask import Flask, request, jsonify
import sqlite3
from datetime import datetime

app = Flask(__name__)
DB_PATH = 'match_results.db'

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# สร้างตาราง matches พร้อมคอลัมน์ match_name
def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_name TEXT DEFAULT '',
            match_type TEXT NOT NULL,
            team_a_score INTEGER NOT NULL,
            team_b_score INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# เพิ่มแมตช์ใหม่
@app.route('/api/matches', methods=['POST'])
def add_match():
    data = request.get_json()
    match_name = data.get('match_name', '')
    match_type = data.get('match_type')
    team_a_score = data.get('team_a_score')
    team_b_score = data.get('team_b_score')

    if not match_type or team_a_score is None or team_b_score is None:
        return jsonify({'error': 'กรุณาส่งข้อมูล match_type, team_a_score, team_b_score ให้ครบ'}), 400

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO matches (match_name, match_type, team_a_score, team_b_score, timestamp)
        VALUES (?, ?, ?, ?, ?)
    ''', (match_name, match_type, team_a_score, team_b_score, datetime.now()))
    conn.commit()
    conn.close()

    return jsonify({'message': 'เพิ่มผลการแข่งขันเรียบร้อยแล้ว'})

# ดึงข้อมูลแมตช์ทั้งหมด
@app.route('/api/matches', methods=['GET'])
def get_matches():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM matches ORDER BY timestamp DESC')
    matches = c.fetchall()
    conn.close()

    results = []
    for m in matches:
        results.append({
            'id': m['id'],
            'match_name': m['match_name'],
            'match_type': m['match_type'],
            'team_a_score': m['team_a_score'],
            'team_b_score': m['team_b_score'],
            'timestamp': m['timestamp']
        })
    return jsonify(results)

# ลบแมตช์ตาม id
@app.route('/api/matches/<int:match_id>', methods=['DELETE'])
def delete_match(match_id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM matches WHERE id = ?', (match_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': f'ลบแมตช์ id={match_id} เรียบร้อยแล้ว'})

# ลบแมตช์ทั้งหมด
@app.route('/api/matches', methods=['DELETE'])
def delete_all_matches():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM matches')
    conn.commit()
    conn.close()
    return jsonify({'message': 'ลบแมตช์ทั้งหมดเรียบร้อยแล้ว'})

if __name__ == '__main__':
    app.run(debug=True)
