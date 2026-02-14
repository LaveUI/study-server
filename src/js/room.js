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

/* ---------- Video Layout ---------- */

function updateVideoLayout() {
  const videos = videoGrid.querySelectorAll("video");
  videoGrid.classList.remove("single", "multiple");

  if (videos.length <= 1) {
    videoGrid.classList.add("single");
  } else {
    videoGrid.classList.add("multiple");
  }
}

/* ---------- Init Media ---------- */

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

    videoGrid.appendChild(myVideo);
    updateVideoLayout();

    socket.emit("video-ready", { roomId });

  } catch (err) {
    console.error("Media error:", err);
    alert("Camera/Microphone permission required.");
  }
}

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
  container.innerHTML = "";
  msgs.forEach(m => renderMessage(m.user, m.message, m.createdAt));
});

socket.on("chat-message", data =>
  renderMessage(data.user, data.message, data.createdAt)
);

if (input) {
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && input.value.trim()) {
      socket.emit("chat-message", {
        roomId,
        message: input.value.trim()
      });
      input.value = "";
    }
  });
}

/* ================= TIMER ================= */

const timerEl = document.getElementById("timer");

window.startTimer = () => socket.emit("timer-start", { roomId });
window.resetTimer = () => socket.emit("timer-reset", { roomId });

socket.on("timer-update", ({ timeLeft }) => {
  const min = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const sec = String(timeLeft % 60).padStart(2, "0");
  timerEl.textContent = `${min}:${sec}`;
});

/* ================= WEBRTC ================= */

socket.on("video-ready", async ({ sender }) => {
  if (sender === socket.id || !localStream) return;

  const peer = new RTCPeerConnection(rtcConfig);
  peers[sender] = peer;

  localStream.getTracks().forEach(track =>
    peer.addTrack(track, localStream)
  );

  peer.ontrack = e => {
    const video = document.createElement("video");
    video.srcObject = e.streams[0];
    video.autoplay = true;
    video.playsInline = true;
    videoGrid.appendChild(video);
    updateVideoLayout();
  };

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("ice-candidate", {
        candidate: e.candidate,
        target: sender
      });
    }
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  socket.emit("video-offer", { offer, target: sender });
});

socket.on("video-offer", async ({ offer, sender }) => {
  if (!localStream) return;

  const peer = new RTCPeerConnection(rtcConfig);
  peers[sender] = peer;

  localStream.getTracks().forEach(track =>
    peer.addTrack(track, localStream)
  );

  peer.ontrack = e => {
    const video = document.createElement("video");
    video.srcObject = e.streams[0];
    video.autoplay = true;
    video.playsInline = true;
    videoGrid.appendChild(video);
    updateVideoLayout();
  };

  await peer.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  socket.emit("video-answer", { answer, target: sender });
});

socket.on("video-answer", async ({ answer, sender }) => {
  if (!peers[sender]) return;
  await peers[sender].setRemoteDescription(
    new RTCSessionDescription(answer)
  );
});

socket.on("ice-candidate", async ({ candidate, sender }) => {
  if (!peers[sender]) return;
  await peers[sender].addIceCandidate(
    new RTCIceCandidate(candidate)
  );
});

/* ================= CONTROLS ================= */

window.toggleMic = () => {
  if (!localStream) return;
  localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
};

window.toggleCamera = async () => {

  if (!localStream) return;

  const existingTrack = localStream.getVideoTracks()[0];
  const myVideo = videoGrid.querySelector("video");

  /* ================= TURN CAMERA OFF ================= */

  if (existingTrack) {

    // Stop hardware completely
    existingTrack.stop();

    // Remove from local stream
    localStream.removeTrack(existingTrack);

    // Remove from peers
    for (let id in peers) {
      const sender = peers[id]
        .getSenders()
        .find(s => s.track && s.track.kind === "video");

      if (sender) sender.replaceTrack(null);
    }

    // Hide video element
    if (myVideo) myVideo.style.display = "none";

    // Create avatar if not exists
    if (!document.getElementById("self-avatar")) {

      const userData = JSON.parse(localStorage.getItem("user"));
      const photo = userData?.picture;

      const avatar = document.createElement("div");
      avatar.id = "self-avatar";
      avatar.className = "video-avatar";

      if (photo) {
        const img = document.createElement("img");
        img.src = photo;
        img.className = "avatar-img";
        avatar.appendChild(img);
      } else {
        const circle = document.createElement("div");
        circle.className = "avatar-circle";
        circle.textContent = user.charAt(0).toUpperCase();
        avatar.appendChild(circle);
      }

      const name = document.createElement("p");
      name.textContent = user;
      avatar.appendChild(name);

      videoGrid.appendChild(avatar);
    }

    console.log("📷 Camera stopped and released");
  }

  /* ================= TURN CAMERA ON ================= */

  else {

    try {

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: true
      });

      const newTrack = newStream.getVideoTracks()[0];

      localStream.addTrack(newTrack);

      // Replace in peers
      for (let id in peers) {
        const sender = peers[id]
          .getSenders()
          .find(s => s.track === null || s.track?.kind === "video");

        if (sender) sender.replaceTrack(newTrack);
      }

      // Restore video element
      if (myVideo) {
        myVideo.srcObject = localStream;
        myVideo.style.display = "block";
      }

      // Remove avatar
      const avatar = document.getElementById("self-avatar");
      if (avatar) avatar.remove();

      console.log("📷 Camera restarted");

    } catch (err) {
      console.error("Camera restart error:", err);
      alert("Unable to access camera.");
    }
  }
};



window.shareScreen = async () => {
  if (!localStream) return;

  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });

  const screenTrack = screenStream.getVideoTracks()[0];

  for (let id in peers) {
    const sender = peers[id]
      .getSenders()
      .find(s => s.track.kind === "video");

    if (sender) sender.replaceTrack(screenTrack);
  }

  screenTrack.onended = () => {
    for (let id in peers) {
      const sender = peers[id]
        .getSenders()
        .find(s => s.track.kind === "video");

      if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
    }
  };
};

/* ================= BACKGROUND PANEL ================= */

window.setBackground = function(bgClass) {
  if (!BG_CLASSES.includes(bgClass)) return;

  document.body.classList.remove(...BG_CLASSES);
  document.body.classList.add(bgClass);
  localStorage.setItem("bgTheme", bgClass);

  const panel = document.getElementById("bg-panel");
  if (panel) panel.classList.remove("active");
};

window.toggleBgPanel = function() {
  const panel = document.getElementById("bg-panel");
  if (!panel) return;
  panel.classList.toggle("active");
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
