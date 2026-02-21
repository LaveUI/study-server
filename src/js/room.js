(async () => {

  /* ================= BACKGROUND INIT ================= */

  const BG_CLASSES = [
    "bg-default",
    "bg-gradient",
    "bg-purple",
    "bg-sunset",
    "bg-green"
  ];

  const savedBg = localStorage.getItem("bgTheme") || "bg-default";
  document.body.classList.remove(...BG_CLASSES);
  document.body.classList.add(savedBg);

  /* ================= AUTH ================= */

  const token = localStorage.getItem("token");
  const userObj = localStorage.getItem("user");

  if (!token || !userObj) {
    window.location.href = "login.html";
    return;
  }

  const userData = JSON.parse(userObj);
  const user = userData.name;
  const API = "http://localhost:5000";

  /* ================= SOCKET ================= */

  const socket = io(API, { auth: { token } });

  /* ================= ROOM RESOLUTION ================= */

  const params = new URLSearchParams(window.location.search);
  const roomIdParam = params.get("roomId");
  const invite = params.get("invite");

  let roomId;

  function parseYouTubeLink(url) {
    const listMatch = url.match(/[?&]list=([^&]+)/);
    if (listMatch) {
      return { type: 'playlist', id: listMatch[1] };
    }
    const videoMatch = url.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^&]+)/);
    if (videoMatch) {
      return { type: 'video', id: videoMatch[1] };
    }
    return null;
  }

  async function resolveRoom() {
    if (invite) {
      const res = await fetch(`${API}/rooms/invite/${invite}`);
      if (!res.ok) {
        alert("Invalid invite link");
        window.location.href = "dashboard.html";
        return null;
      }
      const room = await res.json();
      return room._id;
    }
    return roomIdParam;
  }

  roomId = await resolveRoom();
  if (!roomId) return;

  /* ================= VIDEO SYSTEM ================= */

  const videoGrid = document.getElementById("video-grid");
  let localStream = null;
  let peers = {};
  let cameraTrack = null;

  const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  function updateVideoLayout() {
    if (!videoGrid) return;
    const videos = videoGrid.querySelectorAll("video");
    videoGrid.classList.remove("single", "multiple");
    videoGrid.classList.add(videos.length <= 1 ? "single" : "multiple");
  }

  async function initMedia() {
    try {
      if (localStream) return; // Prevent duplicate initialization on reconnects

      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      cameraTrack = localStream.getVideoTracks()[0];

      // Remove any existing self-video just in case
      const existingVideo = document.getElementById("self-video");
      if (existingVideo) existingVideo.remove();

      const myVideo = document.createElement("video");
      myVideo.id = "self-video";
      myVideo.srcObject = localStream;
      myVideo.muted = true;
      myVideo.autoplay = true;
      myVideo.playsInline = true;
      myVideo.style.transform = "scaleX(-1)";
      myVideo.style.objectFit = "cover";

      videoGrid?.appendChild(myVideo);
      updateVideoLayout();

      socket.emit("video-ready", { roomId });

    } catch (err) {
      console.error("Media error:", err);
      alert("Camera/Microphone permission required.");
    }
  }

  /* ================= MUSIC SYSTEM (FIXED PROPERLY) ================= */

  let ytPlayer = null;
  let ytReady = false;

  // Dynamically load YouTube IFrame API
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = function () {
    ytReady = true;
  };

  /* --- Music Panel UI --- */

  window.toggleMusicPanel = function () {
    const panel = document.getElementById("music-panel");
    if (!panel) return;
    panel.classList.toggle("active");
  };

  /* --- Music Panel Dragging --- */

  const musicPanel = document.getElementById("music-panel");
  const musicHeader = document.getElementById("music-header");

  let isDraggingMusic = false;
  let currentX_music;
  let currentY_music;
  let initialX_music;
  let initialY_music;
  let xOffset_music = 0;
  let yOffset_music = 0;

  if (musicPanel && musicHeader) {
    musicHeader.addEventListener("mousedown", dragStartMusic);
    document.addEventListener("mouseup", dragEndMusic);
    document.addEventListener("mousemove", dragMusic);
  }

  function dragStartMusic(e) {
    if (e.target === musicHeader || e.target.parentNode === musicHeader) {
      initialX_music = e.clientX - xOffset_music;
      initialY_music = e.clientY - yOffset_music;
      isDraggingMusic = true;
    }
  }

  function dragEndMusic() {
    initialX_music = currentX_music;
    initialY_music = currentY_music;
    isDraggingMusic = false;
  }

  function dragMusic(e) {
    if (isDraggingMusic) {
      e.preventDefault();
      currentX_music = e.clientX - initialX_music;
      currentY_music = e.clientY - initialY_music;

      xOffset_music = currentX_music;
      yOffset_music = currentY_music;

      musicPanel.style.transform = `translate(${currentX_music}px, ${currentY_music}px)`;
    }
  }

  /* --- YT Player Controls --- */

  let isYtPlaying = false;

  window.loadYouTubeMusic = function () {
    if (!ytReady || typeof YT === "undefined") {
      alert("YouTube API still loading...");
      return;
    }

    const link = document.getElementById("ytLinkInput")?.value.trim();
    if (!link) return;

    const ytData = parseYouTubeLink(link);
    if (!ytData) {
      alert("Invalid YouTube link");
      return;
    }

    if (ytPlayer) {
      ytPlayer.destroy();
    }

    let playerParams = {
      height: "0",
      width: "0",
      playerVars: { autoplay: 1, controls: 0 },
      events: {
        onReady: e => {
          e.target.setVolume(document.getElementById("ytVolume").value);
          e.target.playVideo();
          isYtPlaying = true;
          document.getElementById("playPauseIcon").textContent = "⏸";
        },
        onError: (e) => {
          console.error("YouTube Error Data:", e.data);
          let errMsg = `Music failed to load (Error ${e.data}).`;
          if (e.data === 101 || e.data === 150) {
            errMsg += " The artist or owner has blocked this song from being played in embedded players outside of YouTube.";
          } else if (e.data === 2) {
            errMsg += " The YouTube link or Playlist ID is invalid.";
          }
          alert(errMsg);
        }
      }
    };

    if (ytData.type === 'playlist') {
      playerParams.playerVars.listType = 'playlist';
      playerParams.playerVars.list = ytData.id;
    } else {
      playerParams.videoId = ytData.id;
    }

    ytPlayer = new YT.Player("yt-player", playerParams);

    // Reveal the controls
    const controlsArea = document.getElementById("musicControlsArea");
    if (controlsArea) controlsArea.style.display = "flex";
  };

  window.ytPlay = function () {
    if (!ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return;

    const state = ytPlayer.getPlayerState();
    const icon = document.getElementById("playPauseIcon");

    // state 1 = playing, state 2 = paused
    if (state === 1) {
      ytPlayer.pauseVideo();
      isYtPlaying = false;
      if (icon) icon.textContent = "⏵";
    } else {
      ytPlayer.playVideo();
      isYtPlaying = true;
      if (icon) icon.textContent = "⏸";
    }
  };

  window.ytStop = function () {
    if (!ytPlayer || typeof ytPlayer.stopVideo !== 'function') return;
    ytPlayer.stopVideo();
    isYtPlaying = false;
    const icon = document.getElementById("playPauseIcon");
    if (icon) icon.textContent = "⏵";
  };

  window.ytNext = function () {
    if (ytPlayer && typeof ytPlayer.nextVideo === 'function') {
      ytPlayer.nextVideo();
    }
  };

  window.ytPrev = function () {
    if (ytPlayer && typeof ytPlayer.previousVideo === 'function') {
      ytPlayer.previousVideo();
    }
  };

  window.changeYtVolume = function (val) {
    if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
      ytPlayer.setVolume(val);
    }
  };

  /* ================= SOCKET CONNECT ================= */

  socket.on("connect", () => {
    socket.emit("join-room", { roomId });
    initMedia();
  });

  /* ================= PRESENCE ================= */

  socket.on("presence-update", ({ users, count }) => {
    const list = document.getElementById("participants-list");
    const counter = document.getElementById("online-count");

    if (list) {
      list.innerHTML = "";
      users.forEach(u => {
        const li = document.createElement("li");
        li.innerHTML = `🟢 ${u}`;
        list.appendChild(li);
      });
    }

    if (counter) counter.textContent = `Online: ${count}`;
  });

  /* ================= CHAT ================= */

  const input = document.getElementById("chat-input");

  function renderMessage(sender, message, createdAt) {
    const container = document.getElementById("messages");
    if (!container) return;

    const div = document.createElement("div");
    div.className = sender === user ? "msg own" : "msg";

    div.innerHTML = `
    <strong>${sender}</strong>
    <span style="font-size:10px;margin-left:6px;">
      ${new Date(createdAt).toLocaleTimeString()}
    </span>
    <div>${message}</div>
  `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  socket.on("chat-history", msgs => {
    const container = document.getElementById("messages");
    if (!container) return;
    container.innerHTML = "";
    msgs.forEach(m => renderMessage(m.user, m.message, m.createdAt));
  });

  socket.on("chat-message", data =>
    renderMessage(data.user, data.message, data.createdAt)
  );

  input?.addEventListener("keydown", e => {
    if (e.key === "Enter" && input.value.trim()) {
      socket.emit("chat-message", {
        roomId,
        message: input.value.trim()
      });
      input.value = "";
    }
  });

  /* ================= TIMER SYSTEM ================= */

  const timerModal = document.getElementById("timerModal");
  const timerOverlay = document.getElementById("timerOverlay");

  window.openTimerModal = function () {
    timerModal?.classList.add("active");
    timerOverlay?.classList.add("active");
  };

  window.closeTimerModal = function () {
    timerModal?.classList.remove("active");
    timerOverlay?.classList.remove("active");
  };

  timerOverlay?.addEventListener("click", closeTimerModal);

  window.startCustomTimer = function () {

    const minutes = parseInt(
      document.getElementById("timerInput")?.value
    );

    if (!minutes || minutes < 1 || minutes > 180) {
      alert("Enter valid time (1–180)");
      return;
    }

    socket.emit("timer-start", {
      roomId,
      duration: minutes * 60
    });

    closeTimerModal();
  };

  socket.on("timer-update", ({ timeLeft }) => {
    const timerEl = document.getElementById("timer");
    if (!timerEl) return;

    const min = String(Math.floor(timeLeft / 60)).padStart(2, "0");
    const sec = String(timeLeft % 60).padStart(2, "0");

    timerEl.textContent = `${min}:${sec}`;
  });

  let currentPhase = null;

  function showPhaseToast(phase) {
    const toast = document.getElementById("phase-toast");
    const msg = document.getElementById("toast-message");
    const icon = document.getElementById("toast-icon");
    if (!toast || !msg || !icon) return;

    if (phase === "focus") {
      msg.textContent = "Time to focus!";
      icon.textContent = "🧠";
      toast.style.borderLeftColor = "#22c55e"; // Green for focus
    } else {
      msg.textContent = "Time for a break!";
      icon.textContent = "☕";
      toast.style.borderLeftColor = "#f97316"; // Orange for break
    }

    toast.classList.add("show");

    // Hide after 4 seconds
    setTimeout(() => {
      toast.classList.remove("show");
    }, 10000);
  }

  function playNotificationSound() {
    const audioEl = document.getElementById("alarmSound");
    if (audioEl && audioEl.readyState >= 2) {
      audioEl.play().catch(err => console.log("Audio play failed:", err));
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  }

  socket.on("pomodoro-update", ({ timeLeft, phase }) => {
    const timerEl = document.getElementById("timer");
    if (!timerEl) return;

    const min = String(Math.floor(timeLeft / 60)).padStart(2, "0");
    const sec = String(timeLeft % 60).padStart(2, "0");

    timerEl.textContent = `${min}:${sec}`;
    timerEl.setAttribute("data-phase", phase);

    if (currentPhase && currentPhase !== phase) {
      playNotificationSound();
      showPhaseToast(phase);
    }
    currentPhase = phase;
  });

  window.startPomodoro = function () {

    const focus = parseInt(document.getElementById("focusInput").value);
    const brk = parseInt(document.getElementById("breakInput").value);

    if (!focus || !brk) {
      alert("Enter valid values");
      return;
    }

    socket.emit("pomodoro-start", {
      roomId,
      focus: focus * 60,
      breakTime: brk * 60
    });

    closeTimerModal();
  };


  /* ================= CAMERA TOGGLE (STABLE) ================= */

  window.toggleCamera = async () => {

    if (!localStream) return;

    const selfVideo = document.getElementById("self-video");
    const track = localStream.getVideoTracks()[0];

    if (track) {
      track.stop();
      localStream.removeTrack(track);
      cameraTrack = null;

      Object.values(peers).forEach(peer => {
        const sender = peer.getSenders()
          .find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(null);
      });

      if (selfVideo) selfVideo.style.display = "none";

    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true
        });

        const newTrack = newStream.getVideoTracks()[0];
        localStream.addTrack(newTrack);
        cameraTrack = newTrack;

        Object.values(peers).forEach(peer => {
          const sender = peer.getSenders()
            .find(s => s.track === null || s.track?.kind === "video");
          if (sender) sender.replaceTrack(newTrack);
        });

        if (selfVideo) {
          selfVideo.srcObject = localStream;
          selfVideo.style.display = "block";
        }

      } catch {
        alert("Unable to access camera.");
      }
    }
  };

  /* ================= SCREEN SHARE (SEPARATE WINDOW) ================= */

  let screenTrack = null;
  const screenPanel = document.getElementById("screen-share-panel");
  const screenVideo = document.getElementById("screenshare-video");

  window.shareScreen = async () => {
    if (!localStream) {
      alert("Initialize camera first.");
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      });

      screenTrack = screenStream.getVideoTracks()[0];

      // Route the screen share to the separate widget instead of camera
      if (screenVideo) {
        screenVideo.srcObject = screenStream;
        screenPanel.classList.add("active");
      }

      // Send to peers (replaces the outgoing video track with screen briefly)
      // *Note: A full dual-stream (cam+screen simultaneously for everyone) requires 
      //  adding a second RtcSender for each peer, but this simple replaceTrack 
      //  method keeps bandwidth low.
      Object.values(peers).forEach(peer => {
        const sender = peer.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });

      // Handle user clicking "Stop sharing" natively in browser UI
      screenTrack.onended = () => {
        stopScreenShare();
      };

    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  window.stopScreenShare = () => {
    if (screenTrack) {
      screenTrack.stop();
      screenTrack = null;
    }
    if (screenPanel) screenPanel.classList.remove("active");
    if (screenVideo) screenVideo.srcObject = null;

    // Restore camera to peers
    if (cameraTrack) {
      Object.values(peers).forEach(peer => {
        const sender = peer.getSenders().find(s => s.track);
        if (sender) sender.replaceTrack(cameraTrack);
      });
    }
  };

  /* --- Screen Share Dragging --- */

  const screenHeader = document.getElementById("screenshare-header");
  let isDraggingScreen = false;
  let currentX_screen, currentY_screen, initialX_screen, initialY_screen;
  let xOffset_screen = 0; let yOffset_screen = 0;

  if (screenPanel && screenHeader) {
    screenHeader.addEventListener("mousedown", dragStartScreen);
    document.addEventListener("mouseup", dragEndScreen);
    document.addEventListener("mousemove", dragScreen);
  }

  function dragStartScreen(e) {
    if (e.target === screenHeader || e.target.parentNode === screenHeader) {
      initialX_screen = e.clientX - xOffset_screen;
      initialY_screen = e.clientY - yOffset_screen;
      isDraggingScreen = true;
    }
  }

  function dragEndScreen() {
    initialX_screen = currentX_screen;
    initialY_screen = currentY_screen;
    isDraggingScreen = false;
  }

  function dragScreen(e) {
    if (isDraggingScreen) {
      e.preventDefault();
      currentX_screen = e.clientX - initialX_screen;
      currentY_screen = e.clientY - initialY_screen;
      xOffset_screen = currentX_screen;
      yOffset_screen = currentY_screen;
      screenPanel.style.transform = `translate(calc(-50% + ${currentX_screen}px), ${currentY_screen}px)`;
    }
  }

  /* --- Screen Share Resizing --- */

  const screenResize = document.getElementById("screenshare-resize");
  let isResizingScreen = false;
  let initialWidth_screen = 640;
  let initialHeight_screen = 400;

  if (screenResize) {
    screenResize.addEventListener("mousedown", (e) => {
      isResizingScreen = true;
      initialWidth_screen = screenPanel.offsetWidth;
      initialHeight_screen = screenPanel.offsetHeight;
      initialX_screen = e.clientX;
      initialY_screen = e.clientY;
      e.stopPropagation();
    });

    document.addEventListener("mouseup", () => {
      isResizingScreen = false;
    });

    document.addEventListener("mousemove", (e) => {
      if (isResizingScreen) {
        e.preventDefault();
        const newWidth = initialWidth_screen + (e.clientX - initialX_screen);
        const newHeight = initialHeight_screen + (e.clientY - initialY_screen);

        // Boundaries
        if (newWidth > 300) screenPanel.style.width = `${newWidth}px`;
        if (newHeight > 200) screenPanel.style.height = `${newHeight}px`;
      }
    });
  }

  /* ================= BACKGROUND PANEL ================= */

  window.setBackground = function (bgClass) {
    if (!BG_CLASSES.includes(bgClass)) return;
    document.body.classList.remove(...BG_CLASSES);
    document.body.classList.add(bgClass);
    localStorage.setItem("bgTheme", bgClass);
  };

  window.toggleBgPanel = function () {
    const panel = document.getElementById("bg-panel");
    panel?.classList.toggle("active");
  };

  document.addEventListener("click", (e) => {
    const panel = document.getElementById("bg-panel");
    const toggleBtn = document.querySelector("button[onclick='toggleBgPanel()']");
    if (!panel || !toggleBtn) return;
    if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) {
      panel.classList.remove("active");
    }
  });

  /* ================= GOALS SYSTEM ================= */

  const goalsPanel = document.getElementById("goals-panel");
  const goalsHeader = document.getElementById("goals-header");

  let isDraggingGoals = false;
  let currentX_goals;
  let currentY_goals;
  let initialX_goals;
  let initialY_goals;
  let xOffset_goals = 0;
  let yOffset_goals = 0;

  if (goalsPanel && goalsHeader) {
    goalsHeader.addEventListener("mousedown", dragStartGoals);
    document.addEventListener("mouseup", dragEndGoals);
    document.addEventListener("mousemove", dragGoals);
  }

  function dragStartGoals(e) {
    if (e.target === goalsHeader || e.target.parentNode === goalsHeader) {
      initialX_goals = e.clientX - xOffset_goals;
      initialY_goals = e.clientY - yOffset_goals;
      isDraggingGoals = true;
    }
  }

  function dragEndGoals() {
    initialX_goals = currentX_goals;
    initialY_goals = currentY_goals;
    isDraggingGoals = false;
  }

  function dragGoals(e) {
    if (isDraggingGoals) {
      e.preventDefault();
      currentX_goals = e.clientX - initialX_goals;
      currentY_goals = e.clientY - initialY_goals;

      xOffset_goals = currentX_goals;
      yOffset_goals = currentY_goals;

      goalsPanel.style.transform = `translate(${currentX_goals}px, ${currentY_goals}px)`;
    }
  }

  window.toggleGoalsPanel = function () {
    const panel = document.getElementById("goals-panel");
    if (!panel) return;
    panel.classList.toggle("active");
  };

  window.switchGoalTab = function (tab) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".goals-tab-content").forEach(content => content.classList.remove("active"));

    const activeBtn = Array.from(document.querySelectorAll(".tab-btn")).find(btn => btn.textContent.toLowerCase() === tab);
    activeBtn?.classList.add("active");
    document.getElementById(`tab-${tab}`)?.classList.add("active");
  };

  /* --- Personal Goals --- */

  let personalGoals = JSON.parse(localStorage.getItem("personalTasks")) || [];

  function savePersonalGoals() {
    localStorage.setItem("personalTasks", JSON.stringify(personalGoals));
  }

  window.renderPersonalGoals = function () {
    const list = document.getElementById("personal-goals-list");
    if (!list) return;
    list.innerHTML = "";

    personalGoals.forEach((goal) => {
      const li = document.createElement("li");
      li.className = `goal-item ${goal.checked ? "checked" : ""}`;
      li.innerHTML = `
      <input type="checkbox" class="goal-checkbox" ${goal.checked ? "checked" : ""} onclick="togglePersonalGoal('${goal.id}')">
      <span>${goal.text}</span>
      <button class="goal-delete" onclick="deletePersonalGoal('${goal.id}')">✖</button>
    `;
      list.appendChild(li);
    });
  };

  window.addPersonalGoal = function () {
    const input = document.getElementById("personalGoalInput");
    const text = input?.value.trim();
    if (!text) return;

    personalGoals.push({
      id: Date.now().toString(),
      text,
      checked: false
    });

    input.value = "";
    savePersonalGoals();
    renderPersonalGoals();
  };

  window.handlePersonalGoalKey = function (e) {
    if (e.key === "Enter") addPersonalGoal();
  };

  window.togglePersonalGoal = function (id) {
    const goal = personalGoals.find(g => g.id === id);
    if (goal) {
      goal.checked = !goal.checked;
      savePersonalGoals();
      renderPersonalGoals();
    }
  };

  window.deletePersonalGoal = function (id) {
    personalGoals = personalGoals.filter(g => g.id !== id);
    savePersonalGoals();
    renderPersonalGoals();
  };

  renderPersonalGoals(); // Initial render

  /* --- Room Goals (Socket Synced) --- */

  window.renderRoomGoals = function (goals) {
    const list = document.getElementById("room-goals-list");
    if (!list) return;
    list.innerHTML = "";

    goals.forEach((goal) => {
      const li = document.createElement("li");
      li.className = `goal-item ${goal.checked ? "checked" : ""}`;
      li.innerHTML = `
      <input type="checkbox" class="goal-checkbox" ${goal.checked ? "checked" : ""} onclick="toggleRoomGoal('${goal.id}')">
      <span>${goal.text}</span>
      <button class="goal-delete" onclick="deleteRoomGoal('${goal.id}')">✖</button>
    `;
      list.appendChild(li);
    });
  };

  window.addRoomGoal = function () {
    const input = document.getElementById("roomGoalInput");
    const text = input?.value.trim();
    if (!text) return;

    socket.emit("add-room-goal", { roomId, text });
    input.value = "";
  };

  window.handleRoomGoalKey = function (e) {
    if (e.key === "Enter") addRoomGoal();
  };

  window.toggleRoomGoal = function (id) {
    socket.emit("toggle-room-goal", { roomId, goalId: id });
  };

  window.deleteRoomGoal = function (id) {
    socket.emit("delete-room-goal", { roomId, goalId: id });
  };

  socket.on("room-goals-update", (goals) => {
    renderRoomGoals(goals);
  });

})();
