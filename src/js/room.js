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

function extractYouTubeID(url) {
  const regExp =
    /(?:youtube\.com\/.*v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^&]+)/;
  const match = url.match(regExp);
  return match ? match[1] : null;
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
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    cameraTrack = localStream.getVideoTracks()[0];

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

window.onYouTubeIframeAPIReady = function () {
  ytReady = true;
};

window.openMusicModal = function () {
  document.getElementById("musicOverlay")?.classList.add("active");
  document.getElementById("musicModal")?.classList.add("active");
};

window.closeMusicModal = function () {
  document.getElementById("musicOverlay")?.classList.remove("active");
  document.getElementById("musicModal")?.classList.remove("active");
};

window.loadYouTubeMusic = function () {

  if (!ytReady || typeof YT === "undefined") {
    alert("YouTube API still loading...");
    return;
  }

  const link = document.getElementById("ytLinkInput")?.value.trim();
  if (!link) return;

  const videoId = extractYouTubeID(link);
  if (!videoId) {
    alert("Invalid YouTube link");
    return;
  }

  if (ytPlayer) ytPlayer.destroy();

  ytPlayer = new YT.Player("yt-player", {
    height: "0",
    width: "0",
    videoId: videoId,
    playerVars: { autoplay: 1, controls: 0 },
    events: {
      onReady: e => e.target.playVideo(),
      onError: () => alert("Music failed to load")
    }
  });

  closeMusicModal();
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

/* ================= SCREEN SHARE (SAFE RESTORE) ================= */

window.shareScreen = async () => {

  if (!localStream) return;

  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    const selfVideo = document.getElementById("self-video");

    Object.values(peers).forEach(peer => {
      const sender = peer.getSenders()
        .find(s => s.track?.kind === "video");
      if (sender) sender.replaceTrack(screenTrack);
    });

    if (selfVideo) selfVideo.srcObject = screenStream;

    screenTrack.onended = () => {

      if (!cameraTrack) return;

      Object.values(peers).forEach(peer => {
        const sender = peer.getSenders()
          .find(s => s.track);
        if (sender) sender.replaceTrack(cameraTrack);
      });

      if (selfVideo) selfVideo.srcObject = localStream;
    };

  } catch (err) {
    console.error("Screen share error:", err);
  }
};

/* ================= BACKGROUND PANEL ================= */

window.setBackground = function(bgClass) {
  if (!BG_CLASSES.includes(bgClass)) return;
  document.body.classList.remove(...BG_CLASSES);
  document.body.classList.add(bgClass);
  localStorage.setItem("bgTheme", bgClass);
};

window.toggleBgPanel = function() {
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

})();
