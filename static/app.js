/* static/app.js - Smart Petanque Judge (GitHub Pages + Server friendly) */
/* รองรับทั้งโหมด static (ไม่มีเซิร์ฟเวอร์) และโหมดมี API จริง */
/* eslint-disable no-console */
(function () {
  'use strict';

  // ====== ตั้งค่า URL แบ็กเอนด์เมื่อเปิดจาก GitHub Pages ======
  // ตัวอย่าง: const BASE_API = "https://xxxx-xxxx.ngrok-free.app";
  // ถ้ารันบนเซิร์ฟเวอร์ Flask โดยตรง (ไม่ใช่ github.io) ให้ปล่อยเป็น '' ได้
  const BASE_API = location.hostname.endsWith('github.io')
    ? '' // ← ใส่ URL เซิร์ฟเวอร์ Flask ของคุณที่นี่ถ้าต้องการเรียกโมเดลจาก GitHub Pages
    : '';

  const api = (path) => (BASE_API ? `${BASE_API}${path}` : path);

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);

  // เดิม (รองรับหน้าเก่าที่ใช้ <img id="liveImage"> กับ /video_feed)
  const liveImage       = $('liveImage');

  // ใหม่ (ใช้ getUserMedia)
  const liveVideo   = $('liveVideo');     // <video> สำหรับกล้องอุปกรณ์
  const startBtn    = $('startCamBtn');
  const toggleBtn   = $('toggleCamBtn');
  const cameraSel   = $('cameraSelect');
  const torchBtn    = $('torchBtn');

  const canvas          = $('canvas');
  const ctx             = canvas?.getContext('2d');
  const teamAScoreElem  = $('teamAScore');
  const teamBScoreElem  = $('teamBScore');
  const scoreDisplay    = $('scoreDisplay');
  const statusEl        = $('status');

  const uploadBtn       = $('uploadBtn');
  const fileInput       = $('imageInput');
  const resetBtn        = $('resetBtn');
  const filePreview     = $('filePreview');
  const competitionTypeSelect = $('competitionType');
  const matchNameInput  = $('matchNameInput');
  const saveMatchBtn    = $('saveMatchBtn');
  const saveLiveBtn     = $('saveLiveBtn');

  // ---------- Env ----------
  const isStaticFront = location.hostname.endsWith('github.io') || location.protocol === 'file:';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ---------- State ----------
  let stream = null;
  let currentDeviceId = null;
  let useBackCamera = true; // มือถือพยายามเริ่มที่กล้องหลัง
  let torchOn = false;

  // ---------- UI utils ----------
  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#b00020' : '#007f7f';
  }

  function updateScores(scoreA, scoreB) {
    if (teamAScoreElem) teamAScoreElem.textContent = scoreA;
    if (teamBScoreElem) teamBScoreElem.textContent = scoreB;

    const maxScore = Math.max(scoreA, scoreB, 10);
    const pA = $('progressA');
    const pB = $('progressB');
    if (pA) pA.style.width = (scoreA / maxScore) * 100 + "%";
    if (pB) pB.style.width = (scoreB / maxScore) * 100 + "%";

    if (!scoreDisplay) return;
    if (scoreA > scoreB) {
      scoreDisplay.textContent = "🎯 ทีม A (ลูกเปตองลาย) ชนะในรอบนี้!";
    } else if (scoreB > scoreA) {
      scoreDisplay.textContent = "🎯 ทีม B (ลูกเปตองธรรมดา) ชนะในรอบนี้!";
    } else {
      scoreDisplay.textContent = "เสมอกัน!";
    }
  }

  function ensureCanvasFromVideo() {
    if (!liveVideo || !canvas) return;
    const vw = liveVideo.videoWidth || 1280;
    const vh = liveVideo.videoHeight || 720;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw; canvas.height = vh;
    }
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (liveVideo) liveVideo.srcObject = null;
  }

  // ---------- Drawing ----------
  function drawDetections(detections, jack) {
    if (!canvas || !ctx) return;

    // ถ้ามี liveVideo ให้ใช้ขนาดจากวีดีโอ
    if (liveVideo && stream) {
      ensureCanvasFromVideo();
      ctx.drawImage(liveVideo, 0, 0, canvas.width, canvas.height);
    }
    // ถ้ายังใช้ liveImage (ของเดิม)
    else if (liveImage && liveImage.width && liveImage.height) {
      canvas.width  = liveImage.width;
      canvas.height = liveImage.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(liveImage, 0, 0, canvas.width, canvas.height);
    }

    if (!jack || !jack.x) return;

    const REAL_JACK_DIAMETER_CM = 3.0;
    const REAL_PETANQUE_DIAMETER_CM = 7.0;
    const cmPerPixelList = [];

    const jackDiameterPx = jack.r * 2;
    if (jackDiameterPx > 0) cmPerPixelList.push(REAL_JACK_DIAMETER_CM / jackDiameterPx);

    (detections || []).forEach(d => {
      if (d.r && (d.label === "plain" || d.label === "patterned")) {
        const ballDiameterPx = d.r * 2;
        if (ballDiameterPx > 0) cmPerPixelList.push(REAL_PETANQUE_DIAMETER_CM / ballDiameterPx);
      }
    });

    const cmPerPixel = cmPerPixelList.length > 0
      ? cmPerPixelList.reduce((a,b)=>a+b,0) / cmPerPixelList.length
      : 0.1;

    // jack
    ctx.beginPath();
    ctx.strokeStyle = "red";
    ctx.lineWidth = 4;
    ctx.arc(jack.x, jack.y, jack.r, 0, Math.PI*2);
    ctx.stroke();

    ctx.font = "18px Kanit, sans-serif";
    ctx.fillStyle = "red";
    ctx.fillText("Jack", jack.x - 20, jack.y - jack.r - 10);

    // balls
    (detections || []).forEach(d => {
      ctx.beginPath();
      ctx.strokeStyle = d.label === "patterned" ? "blue" : "green";
      ctx.fillStyle   = d.label === "patterned" ? "rgba(0,0,255,0.3)" : "rgba(0,128,0,0.3)";
      ctx.lineWidth = 3;
      ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
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

  function drawVideoFrameToCanvas() {
    if (!liveVideo || !canvas || !ctx) return;
    ensureCanvasFromVideo();
    ctx.drawImage(liveVideo, 0, 0, canvas.width, canvas.height);

    // เป้าเล็ง (ช่วยเล็งลูกเปตอง)
    ctx.strokeStyle = 'rgba(0,180,216,0.9)';
    ctx.lineWidth = 3;
    const cx = canvas.width/2, cy = canvas.height/2, r = Math.min(canvas.width, canvas.height)*0.12;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  }

  // ---------- Upload & Preview ----------
  function previewFiles(selectedFiles) {
    if (!filePreview) return;
    filePreview.innerHTML = "";
    Array.from(selectedFiles).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      img.style.maxWidth = "150px";
      img.style.marginRight = "10px";
      img.style.borderRadius = "8px";
      filePreview.appendChild(img);
    });
  }

  async function uploadAndDetect() {
    if (!fileInput || fileInput.files.length === 0) {
      alert("โปรดเลือกไฟล์ภาพก่อนอัปโหลด");
      return;
    }

    const matchName = (matchNameInput?.value || '').trim();
    if (!matchName) {
      alert("กรุณากรอกชื่อแมตช์ก่อนอัปโหลด");
      return;
    }

    const file = fileInput.files[0];

    // ถ้า front เป็น github.io และยังไม่ได้ตั้ง BASE_API → แค่พรีวิว
    if (isStaticFront && !BASE_API) {
      setStatus("โหมด Static: แสดงภาพบนแคนวาส (ยังไม่เรียกโมเดล/เซิร์ฟเวอร์)");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = URL.createObjectURL(file);
      return;
    }

    // โหมดมีเซิร์ฟเวอร์ (หรือ github.io + BASE_API ถูกตั้งค่า)
    const formData = new FormData();
    formData.append("image", file);
    formData.append("competition_type", competitionTypeSelect?.value || '');
    formData.append("match_name", matchName);

    setStatus("⏳ กำลังส่งภาพไปตรวจจับ...");
    try {
      const res = await fetch(api("/api/detect"), { method: "POST", body: formData, mode: 'cors' });
      const data = await res.json();

      if (data.error) {
        alert("Error: " + data.error);
        setStatus("❌ " + data.error, true);
        return;
      }

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, 0, 0);
        drawDetections(data.detections, data.jack);
        updateScores(data.score_plain, data.score_patterned);
        setStatus("✅ ตรวจจับภาพเสร็จแล้ว");
      };
      img.src = URL.createObjectURL(file);
    } catch (error) {
      alert("เกิดข้อผิดพลาด: " + error.message);
      setStatus("❌ เกิดข้อผิดพลาด: " + error.message, true);
    }
  }

  // ---------- Live (server) ----------
  function loadLiveStream() {
    if (!liveImage) return;
    // เดิม: ดึง /video_feed มาแสดงใน <img> (สำหรับ github.io ให้ใช้ BASE_API)
    const url = api("/video_feed") + "?" + Date.now();
    liveImage.src = url;
  }

  function refreshLiveStream() {
    // ไม่มี live_detections ใน static เว้นแต่ตั้ง BASE_API
    if (isStaticFront && !BASE_API) return;

    if (liveImage) loadLiveStream();
    fetch(api("/api/live_detections"), { mode: 'cors' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setStatus("❌ " + data.error, true);
          return;
        }
        drawDetections(data.detections, data.jack);
        updateScores(data.score_plain, data.score_patterned);
        setStatus("✅ อัพเดตภาพสดและข้อมูลตรวจจับ");
      })
      .catch((e) => {
        console.warn(e);
        setStatus("⚠️ ไม่สามารถโหลดข้อมูลตรวจจับภาพสดได้");
      });
  }

  // ---------- Save match ----------
  function saveMatchToServer({ matchName, matchType, scoreA, scoreB }) {
    // โหมด github.io แต่ไม่มี BASE_API → เก็บ localStorage เป็นเดโม
    if (isStaticFront && !BASE_API) {
      const key = 'spj:matches';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      list.push({ ts: Date.now(), matchName, matchType, scoreA, scoreB });
      localStorage.setItem(key, JSON.stringify(list));
      alert("💾 (โหมด Static) บันทึกแมตช์ลงเบราว์เซอร์แล้ว");
      setStatus("💾 (Local) บันทึกเรียบร้อย");
      return;
    }

    fetch(api("/save_match"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: 'cors',
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
        setStatus("✅ บันทึกแมตช์เรียบร้อย");
        if (matchNameInput) matchNameInput.value = "";
        updateScores(0, 0);
      } else {
        alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + (data.error || ""));
        setStatus("❌ เกิดข้อผิดพลาดในการบันทึก", true);
      }
    })
    .catch((err) => {
      alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์");
      setStatus("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์", true);
      console.error(err);
    });
  }

  // ---------- Camera (getUserMedia) ----------
  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(()=>[]);
    const cams = devices.filter(d => d.kind === 'videoinput');

    if (cameraSel) {
      cameraSel.innerHTML = '';
      cams.forEach((cam, i) => {
        const opt = document.createElement('option');
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `Camera ${i+1}`;
        cameraSel.appendChild(opt);
      });

      // เดากล้องหลังจาก label
      const back = cams.find(c => /back|rear|environment/i.test(c.label));
      if (back) {
        cameraSel.value = back.deviceId;
        currentDeviceId = back.deviceId;
        useBackCamera = true;
      } else if (cams[0]) {
        cameraSel.value = cams[0].deviceId;
        currentDeviceId = cams[0].deviceId;
      }
    }

    return cams;
  }

  async function startWithConstraints({ deviceId, facingMode } = {}) {
    stopStream();

    const constraints = {
      audio: false,
      video: {
        width:  { ideal: 1280 },
        height: { ideal: 720  },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        ...(facingMode ? { facingMode } : {})
      }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);

    if (liveVideo) {
      liveVideo.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings?.() || {};
      const isFront = settings.facingMode === 'user' || (!useBackCamera && isMobile);
      liveVideo.style.transform = isFront ? 'scaleX(-1)' : 'none';
      liveVideo.onloadedmetadata = () => ensureCanvasFromVideo();
    }

    // ได้สิทธิ์แล้ว เรียกใหม่เพื่อให้ labels โผล่
    await listCameras();
    setStatus('✅ เปิดกล้องสำเร็จ');
  }

  async function startCameraPreferred() {
    setStatus('กำลังเปิดกล้อง…');
    try {
      const tryFacing = isMobile ? 'environment' : undefined;
      await startWithConstraints({ facingMode: tryFacing });
      useBackCamera = !!tryFacing;
    } catch (e1) {
      console.warn('facingMode ไม่ได้ผล -> ลอง deviceId', e1);
      await listCameras();
      if (!currentDeviceId) {
        setStatus('ไม่พบกล้องสำหรับอุปกรณ์นี้', true);
        return;
      }
      await startWithConstraints({ deviceId: currentDeviceId });
    }
  }

  async function toggleCamera() {
    useBackCamera = !useBackCamera;
    const targetFacing = useBackCamera ? 'environment' : 'user';
    try {
      await startWithConstraints({ facingMode: targetFacing });
    } catch (eFacing) {
      console.warn('สลับด้วย facingMode ไม่สำเร็จ -> ลอง deviceId', eFacing);
      if (cameraSel) {
        const opts = Array.from(cameraSel.options);
        const target = opts.find(o =>
          useBackCamera ? /back|rear|environment/i.test(o.textContent)
                        : /front|user/i.test(o.textContent)
        ) || opts[0];
        if (target) {
          currentDeviceId = target.value;
          await startWithConstraints({ deviceId: currentDeviceId });
        } else {
          setStatus('ไม่พบกล้องที่ต้องการ', true);
        }
      }
    }
  }

  async function setTorch(on) {
    if (!stream) return setStatus('กรุณาเริ่มกล้องก่อน', true);
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.();
    if (!caps || !caps.torch) {
      return setStatus('อุปกรณ์นี้ไม่รองรับไฟฉายผ่านเบราว์เซอร์', true);
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      torchOn = on;
      setStatus(on ? '💡 เปิดไฟฉาย' : 'ไฟฉายปิด');
    } catch (e) {
      console.error(e);
      setStatus('เปิดไฟฉายไม่สำเร็จ', true);
    }
  }

  // ---------- Events ----------
  uploadBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    uploadAndDetect();
  });

  fileInput?.addEventListener("change", (e) => {
    previewFiles(e.target.files);
  });

  resetBtn?.addEventListener("click", () => {
    if (canvas && ctx) ctx.clearRect(0,0,canvas.width,canvas.height);
    if (filePreview) filePreview.innerHTML = "";
    if (fileInput) fileInput.value = "";
    if (matchNameInput) matchNameInput.value = "";
    updateScores(0,0);
    setStatus('');
  });

  saveMatchBtn?.addEventListener("click", () => {
    const name = (matchNameInput?.value || '').trim();
    const type = competitionTypeSelect?.value || '';
    const scoreA = parseInt(teamAScoreElem?.textContent || '0', 10) || 0;
    const scoreB = parseInt(teamBScoreElem?.textContent || '0', 10) || 0;
    if (!name) return alert("กรุณากรอกชื่อแมตช์ก่อนบันทึก");

    saveMatchToServer({ matchName: name, matchType: type, scoreA, scoreB });
  });

  saveLiveBtn?.addEventListener("click", () => {
    const name = (matchNameInput?.value || '').trim();
    const type = competitionTypeSelect?.value || '';
    const scoreA = parseInt(teamAScoreElem?.textContent || '0', 10) || 0;
    const scoreB = parseInt(teamBScoreElem?.textContent || '0', 10) || 0;

    if (!name) return alert("กรุณากรอกชื่อแมตช์ก่อนบันทึกคะแนนจากภาพสด");

    // ถ้ามี liveVideo ให้จับเฟรมลงแคนวาสก่อน (เพื่อโชว์/เก็บภาพ)
    if (liveVideo && stream) {
      drawVideoFrameToCanvas();
    }
    saveMatchToServer({ matchName: name, matchType: type, scoreA, scoreB });
  });

  // ปุ่มกล้องใหม่
  startBtn?.addEventListener('click', async () => {
    try { await startCameraPreferred(); } catch {}
  });

  toggleBtn?.addEventListener('click', async () => {
    try { await toggleCamera(); } catch {}
  });

  cameraSel?.addEventListener('change', async () => {
    currentDeviceId = cameraSel.value;
    try { await startWithConstraints({ deviceId: currentDeviceId }); } catch {}
  });

  torchBtn?.addEventListener('click', async () => {
    await setTorch(!torchOn);
  });

  // ---------- Init ----------
  (async function init() {
    // ถ้ารันในเซิร์ฟเวอร์ Flask (หรือ github.io + BASE_API) และยังใช้โหมด liveImage เดิม
    if ((!isStaticFront || BASE_API) && liveImage) {
      loadLiveStream();
      setInterval(refreshLiveStream, 1000);
    }

    // เตรียมรายการกล้อง ถ้ามี UI กล้อง
    if (navigator.mediaDevices?.enumerateDevices && (startBtn || cameraSel)) {
      try { await navigator.mediaDevices.enumerateDevices(); } catch {}
      // หมายเหตุ: labels จะโชว์หลังอนุญาตกล้องครั้งแรก
    }

    // คะแนนเริ่มต้น
    updateScores(
      parseInt(teamAScoreElem?.textContent || '0', 10) || 0,
      parseInt(teamBScoreElem?.textContent || '0', 10) || 0
    );

    if (isStaticFront && !BASE_API) {
      if (liveImage) {
        console.warn('คุณอยู่บน GitHub Pages: /video_feed ใช้ไม่ได้ → แนะนำใช้ปุ่ม "เริ่มกล้อง" (getUserMedia)');
      }
      setStatus('โหมด Static: กล้องอุปกรณ์ใช้งานได้, การตรวจจับต้องตั้งค่า BASE_API ให้ชี้ไปที่เซิร์ฟเวอร์ Flask');
    }
  })();

})();
