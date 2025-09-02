from ultralytics import YOLO

model = YOLO("runs/detect/train4/weights/last.pt")  # โหลดโมเดลจากจุดล่าสุดที่เทรนไว้

model.train(
    data="petanque-vs-hatball-/data.yaml",
    epochs=150,
    imgsz=800,
    batch=4,
    device='cpu'  # ถ้ามี GPU ใส่ '0' แทนผ
)
