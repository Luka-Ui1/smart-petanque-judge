const liveImage = document.getElementById("liveImage");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const teamAScoreElem = document.getElementById("teamAScore");
const teamBScoreElem = document.getElementById("teamBScore");
const scoreDisplay = document.getElementById("scoreDisplay");
const status = document.getElementById("status");

const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("imageInput");
const resetBtn = document.getElementById("resetBtn");
const filePreview = document.getElementById("filePreview");

const competitionTypeSelect = document.getElementById("competitionType");
const matchNameInput = document.getElementById("matchNameInput");

const saveMatchBtn = document.getElementById("saveMatchBtn");

// ปุ่มใหม่: บันทึกคะแนนจากภาพสด
const saveLiveBtn = document.getElementById("saveLiveBtn");

function loadLiveStream() {
  liveImage.src = "/video_feed?" + new Date().getTime();
}

function drawDetections(detections, jack) {
  if (!jack || !jack.x) return;

  canvas.width = liveImage.width;
  canvas.height = liveImage.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(liveImage, 0, 0, canvas.width, canvas.height);

  const REAL_JACK_DIAMETER_CM = 3.0;
  const REAL_PETANQUE_DIAMETER_CM = 7.0;

  const cmPerPixelList = [];

  const jackDiameterPx = jack.r * 2;
  if (jackDiameterPx > 0) {
    cmPerPixelList.push(REAL_JACK_DIAMETER_CM / jackDiameterPx);
  }

  detections.forEach((d) => {
    if (d.r && (d.label === "plain" || d.label === "patterned")) {
      const ballDiameterPx = d.r * 2;
      if (ballDiameterPx > 0) {
        cmPerPixelList.push(REAL_PETANQUE_DIAMETER_CM / ballDiameterPx);
      }
    }
  });

  const cmPerPixel =
    cmPerPixelList.length > 0
      ? cmPerPixelList.reduce((a, b) => a + b, 0) / cmPerPixelList.length
      : 0.1;

  ctx.beginPath();
  ctx.strokeStyle = "red";
  ctx.lineWidth = 4;
  ctx.arc(jack.x, jack.y, jack.r, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.font = "18px Kanit, sans-serif";
  ctx.fillStyle = "red";
  ctx.fillText("Jack", jack.x - 20, jack.y - jack.r - 10);

  detections.forEach((d) => {
    ctx.beginPath();
    ctx.strokeStyle = d.label === "patterned" ? "blue" : "green";
    ctx.fillStyle =
      d.label === "patterned" ? "rgba(0,0,255,0.3)" : "rgba(0,128,0,0.3)";
    ctx.lineWidth = 3;
    ctx.arc(d.x, d.y, d.r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.font = "16px Kanit, sans-serif";
    ctx.fillStyle = d.label === "patterned" ? "blue" : "green";
    ctx.fillText(`${d.label}`, d.x - d.r, d.y - d.r - 5);

    const dx = d.x - jack.x;
    const dy = d.y - jack.y;
    const distPx = Math.hypot(dx, dy);
    const distCm = distPx * cmPerPixel;

    ctx.fillStyle = "black";
    ctx.fillText(`${distCm.toFixed(1)} cm`, d.x + d.r + 5, d.y + 16);
  });
}

function updateScores(scoreA, scoreB) {
  teamAScoreElem.textContent = scoreA;
  teamBScoreElem.textContent = scoreB;

  const maxScore = Math.max(scoreA, scoreB, 10);
  document.getElementById("progressA").style.width =
    (scoreA / maxScore) * 100 + "%";
  document.getElementById("progressB").style.width =
    (scoreB / maxScore) * 100 + "%";

  if (scoreA > scoreB) {
    scoreDisplay.textContent = "🎯 ทีม A (ลูกเปตองลาย) ชนะในรอบนี้!";
  } else if (scoreB > scoreA) {
    scoreDisplay.textContent = "🎯 ทีม B (ลูกเปตองธรรมดา) ชนะในรอบนี้!";
  } else {
    scoreDisplay.textContent = "เสมอกัน!";
  }
}

function previewFiles(selectedFiles) {
  filePreview.innerHTML = "";
  Array.from(selectedFiles).forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    img.style.maxWidth = "150px";
    img.style.marginRight = "10px";
    filePreview.appendChild(img);
  });
}

async function uploadAndDetect() {
  if (fileInput.files.length === 0) {
    alert("โปรดเลือกไฟล์ภาพก่อนอัปโหลด");
    return;
  }

  const matchName = matchNameInput.value.trim();
  if (!matchName) {
    alert("กรุณากรอกชื่อแมตช์ก่อนอัปโหลด");
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("image", file);
  formData.append("competition_type", competitionTypeSelect.value);
  formData.append("match_name", matchName);

  status.textContent = "⏳ กำลังส่งภาพไปตรวจจับ...";
  try {
    const res = await fetch("/api/detect", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (data.error) {
      alert("Error: " + data.error);
      status.textContent = "❌ " + data.error;
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      drawDetections(data.detections, data.jack);
      updateScores(data.score_plain, data.score_patterned);
      status.textContent = "✅ ตรวจจับภาพเสร็จแล้ว";
    };
    img.src = URL.createObjectURL(file);
  } catch (error) {
    alert("เกิดข้อผิดพลาด: " + error.message);
    status.textContent = "❌ เกิดข้อผิดพลาด: " + error.message;
  }
}

uploadBtn.addEventListener("click", (e) => {
  e.preventDefault();
  uploadAndDetect();
});

fileInput.addEventListener("change", (e) => {
  previewFiles(e.target.files);
});

resetBtn.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  filePreview.innerHTML = "";
  fileInput.value = "";
  matchNameInput.value = "";
  updateScores(0, 0);
  status.textContent = "";
});

saveMatchBtn.addEventListener("click", () => {
  const matchName = matchNameInput.value.trim();
  const matchType = competitionTypeSelect.value;
  const scoreA = parseInt(teamAScoreElem.textContent) || 0;
  const scoreB = parseInt(teamBScoreElem.textContent) || 0;

  if (!matchName) {
    alert("กรุณากรอกชื่อแมตช์ก่อนบันทึก");
    return;
  }

  fetch("/save_match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      match_name: matchName,
      match_type: matchType,
      team_a_score: scoreA,
      team_b_score: scoreB,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("✅ บันทึกแมตช์สำเร็จแล้ว!");
        matchNameInput.value = "";
        updateScores(0, 0);
      } else {
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + (data.error || ""));
      }
    })
    .catch((err) => {
      alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์");
      console.error(err);
    });
});

function refreshLiveStream() {
  loadLiveStream();

  fetch("/api/live_detections")
    .then((res) => res.json())
    .then((data) => {
      if (data.error) {
        status.textContent = "❌ " + data.error;
        return;
      }
      drawDetections(data.detections, data.jack);
      updateScores(data.score_plain, data.score_patterned);
      status.textContent = "✅ อัพเดตภาพสดและข้อมูลตรวจจับ";
    })
    .catch(() => {
      status.textContent = "⚠️ ไม่สามารถโหลดข้อมูลตรวจจับภาพสดได้";
    });
}

loadLiveStream();
setInterval(refreshLiveStream, 1000);

saveLiveBtn.addEventListener("click", () => {
  const matchName = matchNameInput.value.trim();
  const matchType = competitionTypeSelect.value;
  const scoreA = parseInt(teamAScoreElem.textContent) || 0;
  const scoreB = parseInt(teamBScoreElem.textContent) || 0;

  if (!matchName) {
    alert("กรุณากรอกชื่อแมตช์ก่อนบันทึกคะแนนจากภาพสด");
    return;
  }

  status.textContent = "⏳ กำลังบันทึกคะแนนจากภาพสด...";

  fetch("/save_match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      match_name: matchName,
      match_type: matchType,
      team_a_score: scoreA,
      team_b_score: scoreB,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("✅ บันทึกคะแนนจากภาพสดสำเร็จแล้ว!");
        status.textContent = "✅ บันทึกคะแนนจากภาพสดเรียบร้อย";
      } else {
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + (data.error || ""));
        status.textContent = "❌ เกิดข้อผิดพลาดในการบันทึก";
      }
    })
    .catch((err) => {
      alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์");
      status.textContent = "❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์";
      console.error(err);
    });
});
