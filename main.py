import numpy as np
import argparse
import os
import cv2
import time
from imutils.video import VideoStream
from imutils.video import FPS
from ultralytics import YOLO

CONFIDENCE_MIN = 0.4
MODEL_BASE_PATH = "yolo-v8"

ap = argparse.ArgumentParser()
ap.add_argument("-i", "--input", required=True, help="Endereco do streaming do drone")
streaming_path = vars(ap.parse_args())['input']

print("[+] Carregando o modelo YOLOv8...")
model = YOLO(os.path.join(MODEL_BASE_PATH, 'yolov8n.pt'))

vs = VideoStream(streaming_path).start()
time.sleep(2.0)
fps = FPS().start()

while True:
    frame = vs.read()
    if frame is None:
        break

    results = model(frame, verbose=False)[0]

    for box in results.boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = box.conf[0]
        cls = int(box.cls[0])
        label = model.names[cls]

        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

        cv2.putText(
    frame,
    f"{label} {conf:.2f}",
    (x1, y1 - 10),
    cv2.FONT_HERSHEY_SIMPLEX,
    0.5,
    (0, 255, 0),
    2
)
    if frame is None: 
        print("Frame is None")
        continue

    cv2.imshow("YOLOv8 Detection", frame)
    key = cv2.waitKey(1) & 0xFF
    if key == ord("q"):
        break

    fps.update()

fps.stop()
cv2.destroyAllWindows()
vs.stop()
