/* static/app.js - Smart Petanque Judge (มือถือเต็มฟีเจอร์) */
(function() {
  'use strict';

  // ====== ตั้งค่า URL แบ็กเอนด์เมื่อเปิดจาก GitHub Pages ======
  const BASE_API = location.hostname.endsWith('github.io')
    ? ''
    : '';

  const api = path => (BASE_API ? `${BASE_API}${path}` : path);

  const $ = id => document.getElementById(id);

  // ======= DOM Elements =======
  const liveVideo   = $('liveVideo');   
  const startBtn    = $('startCamBtn');
  const toggleBtn   = $('toggleCamBtn');
  const cameraSel   = $('cameraSelect');
  const torchBtn    = $('torchBtn');

  const canvas      = $('canvas');
  const ctx         = canvas?.getContext('2d');
  const teamAScoreElem = $('teamAScore');
  const teamBScoreElem = $('teamBScore');
  const scoreDisplay   = $('scoreDisplay');
  const statusEl      = $('status');

  const uploadBtn       = $('uploadBtn');
  const fileInput       = $('imageInput');
  const resetBtn        = $('resetBtn');
  const filePreview     = $('filePreview');
  const competitionTypeSelect = $('competitionType');
  const matchNameInput  = $('matchNameInput');
  const saveMatchBtn    = $('saveMatchBtn');
  const saveLiveBtn     = $('saveLiveBtn');

  const isStaticFront = location.hostname.endsWith('github.io') || location.protocol==='file:';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  let stream = null;
  let currentDeviceId = null;
  let useBackCamera = true;
  let torchOn = false;

  // ======= Helpers =======
  function setStatus(msg, isError=false){
    if(!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError?'#b00020':'#007f7f';
  }

  function updateScores(scoreA, scoreB){
    if(teamAScoreElem) teamAScoreElem.textContent = scoreA;
    if(teamBScoreElem) teamBScoreElem.textContent = scoreB;
    if(!scoreDisplay) return;
    if(scoreA>scoreB) scoreDisplay.textContent = "🎯 ทีม A ชนะ!";
    else if(scoreB>scoreA) scoreDisplay.textContent = "🎯 ทีม B ชนะ!";
    else scoreDisplay.textContent = "เสมอกัน!";
  }

  function ensureCanvasFromVideo(){
    if(!liveVideo||!canvas) return;
    const vw = liveVideo.videoWidth || 1280;
    const vh = liveVideo.videoHeight || 720;
    if(canvas.width!==vw||canvas.height!==vh){
      canvas.width = vw;
      canvas.height = vh;
    }
  }

  function stopStream(){
    if(stream){
      stream.getTracks().forEach(t=>t.stop());
      stream=null;
    }
    if(liveVideo) liveVideo.srcObject=null;
  }

  // ======= Drawing =======
  function drawDetections(detections, jack){
    if(!canvas||!ctx) return;
    if(liveVideo && stream){
      ensureCanvasFromVideo();
      ctx.drawImage(liveVideo,0,0,canvas.width,canvas.height);
    }
    if(!jack||!jack.x) return;
    const REAL_JACK_DIAMETER_CM=3.0;
    const REAL_PETANQUE_DIAMETER_CM=7.0;
    const cmPerPixelList=[];
    const jackDiameterPx = jack.r*2;
    if(jackDiameterPx>0) cmPerPixelList.push(REAL_JACK_DIAMETER_CM/jackDiameterPx);

    (detections||[]).forEach(d=>{
      if(d.r&&(d.label==="plain"||d.label==="patterned")){
        const ballDiameterPx=d.r*2;
        if(ballDiameterPx>0) cmPerPixelList.push(REAL_PETANQUE_DIAMETER_CM/ballDiameterPx);
      }
    });

    const cmPerPixel = cmPerPixelList.length>0
      ? cmPerPixelList.reduce((a,b)=>a+b,0)/cmPerPixelList.length
      : 0.1;

    // jack
    ctx.beginPath();
    ctx.strokeStyle="red"; ctx.lineWidth=4;
    ctx.arc(jack.x,jack.y,jack.r,0,Math.PI*2); ctx.stroke();
    ctx.font="18px Kanit, sans-serif"; ctx.fillStyle="red";
    ctx.fillText("Jack",jack.x-20,jack.y-jack.r-10);

    (detections||[]).forEach(d=>{
      ctx.beginPath();
      ctx.strokeStyle = d.label==="patterned"?"blue":"green";
      ctx.fillStyle = d.label==="patterned"?"rgba(0,0,255,0.3)":"rgba(0,128,0,0.3)";
      ctx.lineWidth=3;
      ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.font="16px Kanit, sans-serif"; ctx.fillStyle=d.label==="patterned"?"blue":"green";
      ctx.fillText(d.label,d.x-d.r,d.y-d.r-5);
      const dx=d.x-jack.x; const dy=d.y-jack.y;
      const distPx=Math.hypot(dx,dy); const distCm=distPx*cmPerPixel;
      ctx.fillStyle="black"; ctx.fillText(distCm.toFixed(1)+" cm",d.x+d.r+5,d.y+16);
    });
  }

  function drawVideoFrameToCanvas(){
    if(!liveVideo||!canvas||!ctx) return;
    ensureCanvasFromVideo(); ctx.drawImage(liveVideo,0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(0,180,216,0.9)'; ctx.lineWidth=3;
    const cx=canvas.width/2,cy=canvas.height/2,r=Math.min(canvas.width,canvas.height)*0.12;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  }

  // ======= Camera =======
  async function listCameras(){
    const devices = await navigator.mediaDevices.enumerateDevices().catch(()=>[]);
    const cams = devices.filter(d=>d.kind==='videoinput');
    if(cameraSel){ cameraSel.innerHTML='';
      cams.forEach((cam,i)=>{
        const opt=document.createElement('option'); opt.value=cam.deviceId;
        opt.textContent=cam.label||`Camera ${i+1}`; cameraSel.appendChild(opt);
      });
      const back = cams.find(c=>/back|rear|environment/i.test(c.label));
      if(back){ cameraSel.value=back.deviceId; currentDeviceId=back.deviceId; useBackCamera=true; }
      else if(cams[0]){ cameraSel.value=cams[0].deviceId; currentDeviceId=cams[0].deviceId; }
    }
    return cams;
  }

  async function startWithConstraints({deviceId,facingMode}={}){
    stopStream();
    const constraints={audio:false,video:{width:{ideal:1280},height:{ideal:720},...(deviceId?{deviceId:{exact:deviceId}}:{}),...(facingMode?{facingMode}:{})}};
    stream=await navigator.mediaDevices.getUserMedia(constraints);
    if(liveVideo){
      liveVideo.srcObject=stream;
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings?.()||{};
      const isFront=settings.facingMode==='user'||(!useBackCamera&&isMobile);
      liveVideo.style.transform=isFront?'scaleX(-1)':'none';
      liveVideo.onloadedmetadata=()=>ensureCanvasFromVideo();
    }
    await listCameras();
    setStatus('✅ เปิดกล้องสำเร็จ');
  }

  async function startCameraPreferred(){
    setStatus('กำลังเปิดกล้อง…');
    try{ const tryFacing = isMobile?'environment':undefined; await startWithConstraints({facingMode:tryFacing}); useBackCamera=!!tryFacing; }
    catch(e1){ console.warn('facingMode ไม่ได้ผล -> deviceId',e1); await listCameras(); if(!currentDeviceId){ setStatus('ไม่พบกล้อง',true); return; } await startWithConstraints({deviceId:currentDeviceId}); }
  }

  async function toggleCamera(){
    useBackCamera=!useBackCamera;
    const targetFacing = useBackCamera?'environment':'user';
    try{ await startWithConstraints({facingMode:targetFacing}); }
    catch(eFacing){ console.warn('toggle fail -> deviceId',eFacing); if(cameraSel){ const opts=Array.from(cameraSel.options); const target=opts.find(o=>useBackCamera?/back|rear|environment/i.test(o.textContent):/front|user/i.test(o.textContent))||opts[0]; if(target){ currentDeviceId=target.value; await startWithConstraints({deviceId:currentDeviceId}); }else{ setStatus('ไม่พบกล้องที่ต้องการ',true); } } }
  }

  async function setTorch(on){
    if(!stream) return setStatus('กรุณาเริ่มกล้องก่อน',true);
    const track = stream.getVideoTracks()[0]; const caps=track.getCapabilities?.();
    if(!caps||!caps.torch) return setStatus('อุปกรณ์นี้ไม่รองรับไฟฉาย',true);
    try{ await track.applyConstraints({advanced:[{torch:on}]}); torchOn=on; setStatus(on?'💡 เปิดไฟฉาย':'ไฟฉายปิด'); }
    catch(e){ console.error(e); setStatus('เปิดไฟฉายไม่สำเร็จ',true); }
  }

  // ======= Events =======
  startBtn?.addEventListener('click',async()=>{ try{ await startCameraPreferred(); }catch{} });
  toggleBtn?.addEventListener('click',async()=>{ try{ await toggleCamera(); }catch{} });
  torchBtn?.addEventListener('click',async()=>{ await setTorch(!torchOn); });

  // ======= Upload / Save =======
  uploadBtn?.addEventListener('click',async e=>{ e.preventDefault(); if(!fileInput||fileInput.files.length===0){ alert('โปรดเลือกไฟล์'); return; } const matchName=(matchNameInput?.value||'').trim(); if(!matchName){ alert('กรุณากรอกชื่อแมตช์'); return; } const file=fileInput.files[0]; if(isStaticFront&&!BASE_API){ const img=new Image(); img.onload=()=>{canvas.width=img.width; canvas.height=img.height; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0);}; img.src=URL.createObjectURL(file); setStatus('โหมด Static: แสดงภาพบนแคนวาส'); return; } const formData=new FormData(); formData.append('image',file); formData.append('competition_type',competitionTypeSelect?.value||''); formData.append('match_name',matchName); setStatus('⏳ กำลังส่งภาพไปตรวจจับ...'); try{ const res=await fetch(api('/api/detect'),{method:'POST',body:formData,mode:'cors'}); const data=await res.json(); if(data.error){ alert('Error: '+data.error); setStatus('❌ '+data.error,true); return; } const img=new Image(); img.onload=()=>{canvas.width=img.width; canvas.height=img.height; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0); drawDetections(data.detections,data.jack); updateScores(data.score_plain,data.score_patterned); setStatus('✅ ตรวจจับภาพเสร็จแล้ว');}; img.src=URL.createObjectURL(file);}catch(error){ alert('เกิดข้อผิดพลาด: '+error.message); setStatus('❌ '+error.message,true); }});

  saveMatchBtn?.addEventListener('click',()=>{
    const name=(matchNameInput?.value||'').trim();
    const type=competitionTypeSelect?.value||'';
    const scoreA=parseInt(teamAScoreElem?.textContent||'0',10)||0;
    const scoreB=parseInt(teamBScoreElem?.textContent||'0',10)||0;
    if(!name) return alert('กรุณากรอกชื่อแมตช์'); saveMatchToServer({matchName:name,matchType:type,scoreA,scoreB});
  });

  saveLiveBtn?.addEventListener('click',()=>{
    const name=(matchNameInput?.value||'').trim();
    const type=competitionTypeSelect?.value||'';
    const scoreA=parseInt(teamAScoreElem?.textContent||'0',10)||0;
    const scoreB=parseInt(teamBScoreElem?.textContent||'0',10)||0;
    if(!name) return alert('กรุณากรอกชื่อแมตช์'); if(liveVideo&&stream) drawVideoFrameToCanvas(); saveMatchToServer({matchName:name,matchType:type,scoreA,scoreB});
  });

  // ======= Init =======
  (async function init(){
    updateScores(parseInt(teamAScoreElem?.textContent||'0',10)||0, parseInt(teamBScoreElem?.textContent||'0',10)||0);
    if(isStaticFront&&!BASE_API) setStatus('โหมด Static: กล้องมือถือใช้งานได้, ตรวจจับต้องตั้ง BASE_API');
  })();

})();
