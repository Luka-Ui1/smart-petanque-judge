from ultralytics import YOLO
import cv2

# โหลดโมเดล
model = YOLO("runs/detect/train4/weights/best.pt")

# ทำนาย
#results = model.predict(source="your_image.jpg", conf=0.5)
results = model.predict(source=0, show=True)  # กล้อง webcam

# แสดงภาพผลลัพธ์
for r in results:
    im = r.plot()  # วาดกรอบ detection ลงในภาพ
    cv2.imshow("Result", im)
    cv2.waitKey(0)  # 0 = รอจนกว่าจะกดปุ่ม
    cv2.destroyAllWindows()
