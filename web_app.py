from flask import Flask, render_template, Response, request, jsonify, redirect, url_for, flash
import os
import cv2
import numpy as np
import sqlite3
from datetime import datetime, timedelta
from ultralytics import YOLO

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'

# --- Database setup ---
DB_PATH = "match_results.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

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

# --- Camera and Model Setup ---
vs = cv2.VideoCapture(0)
vs.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
vs.set(cv2.CAP_PROP_BRIGHTNESS, 150)

MODEL_PATH = os.path.join("petanque-v2-yolov8-0.1", "weights", "best.pt")
print("[+] Loading YOLOv8 model...")
model = YOLO(MODEL_PATH)

REAL_JACK_DIAMETER_CM = 3.0
REAL_BALL_DIAMETER_CM = 7.0

def generate_frames():
    while True:
        success, frame = vs.read()
        if not success:
            continue

        results = model(frame, verbose=False)[0]

        jack = None
        balls = []

        for box in results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = box.conf[0]
            cls = int(box.cls[0])
            label = model.names[cls].lower()
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            r = int(max(x2 - x1, y2 - y1) / 2)

            if label == "hatball":
                jack = {"x": cx, "y": cy, "r": r}
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                cv2.putText(frame, f"hatball ({conf:.2f})", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            elif label in ["plain", "patterned"]:
                balls.append({"cx": cx, "cy": cy, "r": r, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "label": label, "conf": conf})

        cm_per_pixel_jack = None
        if jack:
            jack_diameter_px = jack['r'] * 2
            cm_per_pixel_jack = REAL_JACK_DIAMETER_CM / jack_diameter_px

        for ball in balls:
            color = (0, 255, 0) if ball['label'] == "plain" else (255, 0, 0)
            cv2.rectangle(frame, (ball['x1'], ball['y1']), (ball['x2'], ball['y2']), color, 2)
            cv2.putText(frame, f"{ball['label']} ({ball['conf']:.2f})", (ball['x1'], ball['y1'] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            if jack and cm_per_pixel_jack:
                ball_diameter_px = ball['r'] * 2
                cm_per_pixel_ball = REAL_BALL_DIAMETER_CM / ball_diameter_px
                scale_ratio = cm_per_pixel_jack / cm_per_pixel_ball
                dist_px = np.hypot(ball['cx'] - jack['x'], ball['cy'] - jack['y'])
                dist_cm = dist_px * cm_per_pixel_jack * scale_ratio
                cv2.putText(frame, f"{dist_cm:.1f} cm", (ball['x1'], ball['y2'] + 20),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

# --- Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/dashboard')
def dashboard():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM matches ORDER BY timestamp DESC')
    rows = c.fetchall()
    conn.close()

    thai_months = [
        "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ]

    matches = []
    for row in rows:
        dt = datetime.strptime(row['timestamp'], '%Y-%m-%d %H:%M:%S')
        dt_th = dt + timedelta(hours=7)

        day = dt_th.day
        month = thai_months[dt_th.month]
        year = dt_th.year + 543
        time_str = dt_th.strftime('%H:%M:%S')

        timestamp_th = f"{day} {month} {year} {time_str}"

        match_dict = dict(row)
        match_dict['timestamp'] = timestamp_th
        matches.append(match_dict)

    return render_template('dashboard.html', matches=matches)

@app.route('/save_match', methods=['POST'])
def save_match():
    data = request.get_json()
    match_name = data.get("match_name", "").strip()
    match_type = data.get("match_type", "singles")
    team_a_score = data.get("team_a_score")
    team_b_score = data.get("team_b_score")

    if not match_name:
        return jsonify({"success": False, "error": "กรุณากรอกชื่อแมตช์"})

    try:
        team_a_score = int(team_a_score)
        team_b_score = int(team_b_score)
    except Exception:
        return jsonify({"success": False, "error": "คะแนนต้องเป็นตัวเลข"})

    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO matches (match_name, match_type, team_a_score, team_b_score) VALUES (?, ?, ?, ?)",
        (match_name, match_type, team_a_score, team_b_score),
    )
    conn.commit()
    conn.close()

    return jsonify({"success": True})

@app.route('/delete_match/<int:match_id>', methods=['POST'])
def delete_match(match_id):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM matches WHERE id = ?', (match_id,))
    conn.commit()
    conn.close()
    flash('ลบแมตช์เรียบร้อยแล้ว')
    return redirect(url_for('dashboard'))

@app.route('/delete_all_matches', methods=['POST'])
def delete_all_matches():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM matches')
    conn.commit()
    conn.close()
    flash('ลบข้อมูลแมตช์ทั้งหมดเรียบร้อยแล้ว')
    return redirect(url_for('dashboard'))

# --- API for image detection ---
def detect_from_image(img):
    results = model(img, verbose=False)[0]

    detections = []
    jack = None

    for box, cls, conf in zip(results.boxes.xyxy, results.boxes.cls, results.boxes.conf):
        x1, y1, x2, y2 = map(int, box)
        label = model.names[int(cls)].lower()
        cx = int((x1 + x2) / 2)
        cy = int((y1 + y2) / 2)
        r = int(max(x2 - x1, y2 - y1) / 2)

        if label == 'hatball':
            jack = {"x": cx, "y": cy, "r": r}
        elif label in ['plain', 'patterned']:
            detections.append({
                "x": cx,
                "y": cy,
                "r": r,
                "label": label,
                "conf": float(conf)
            })

    if not jack:
        return jsonify({
            "error": "ไม่พบลูกแก่น (hatball)",
            "detections": detections,
            "jack": {},
            "sorted_by_distance": []
        })

    def distance(p):
        return np.hypot(p['x'] - jack['x'], p['y'] - jack['y'])

    jack_diameter_px = jack['r'] * 2
    cm_per_pixel_jack = REAL_JACK_DIAMETER_CM / jack_diameter_px

    for d in detections:
        ball_diameter_px = d['r'] * 2
        cm_per_pixel_ball = REAL_BALL_DIAMETER_CM / ball_diameter_px
        scale_ratio = cm_per_pixel_jack / cm_per_pixel_ball

        dist_px = distance(d)
        d['distance'] = dist_px
        d['distance_cm'] = round(dist_px * cm_per_pixel_jack * scale_ratio, 1)

    sorted_detections = sorted(detections, key=lambda d: d['distance'])

    score_plain = sum(1 for d in sorted_detections if d['label'] == 'plain' and d['distance'] < 100)
    score_patterned = sum(1 for d in sorted_detections if d['label'] == 'patterned' and d['distance'] < 100)

    return jsonify({
        "detections": detections,
        "jack": jack,
        "sorted_by_distance": sorted_detections,
        "score_plain": score_plain,
        "score_patterned": score_patterned
    })

@app.route('/api/detect', methods=['POST'])
def api_detect():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    file = request.files['image']
    npimg = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    return detect_from_image(img)

@app.route('/api/live_detections')
def api_live_detections():
    success, frame = vs.read()
    if not success:
        return jsonify({'error': 'ไม่สามารถอ่านกล้องได้'}), 500
    return detect_from_image(frame)

# --- RUN APP ---
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
