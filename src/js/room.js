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
  const API = window.location.port === "5500" ? "http://localhost:5000" : window.location.origin;

  /* ================= SOCKET ================= */

  const socket = io(API, { auth: { token } });

  /* ================= ROOM RESOLUTION ================= */

  const params = new URLSearchParams(window.location.search);
  const roomIdParam = params.get("roomId");
  const invite = params.get("invite");
  let noMediaParam = params.get("nomedia");

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
      const titleEl = document.getElementById("prejoin-room-title");
      if (titleEl && room.hostName) {
        titleEl.textContent = `Join ${room.hostName}'s Room`;
      }
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
  let activeAvatars = {}; // Stores { targetId: { picture: string, isVideoOff: boolean } }
  let isMicHardMuted = false; // True when mic hardware has been fully released

  const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  function updateVideoLayout() {
    if (!videoGrid) return;
    const wrappers = videoGrid.querySelectorAll(".video-wrapper");
    const count = wrappers.length;

    videoGrid.classList.remove("single", "multiple");

    if (count === 0) return;

    if (count === 1) {
      // Single tile: centered, max 70% of width
      videoGrid.style.gridTemplateColumns = "minmax(0, 70%)";
      videoGrid.classList.add("single");
    } else {
      // Discord-style column count
      let cols;
      if (count === 2) cols = 2;
      else if (count <= 4) cols = 2;
      else if (count <= 6) cols = 3;
      else cols = 4;

      videoGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      videoGrid.classList.add("multiple");
    }
  }

  async function initMedia() {
    try {
      if (localStream) return; // Prevent duplicate initialization on reconnects

      try {
        if (noMediaParam === 'true') {
          throw new Error("User requested no-media mode via dashboard toggle");
        }

        // 1st attempt: Camera and Mic
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      } catch (err) {
        if (noMediaParam === 'true') {
          console.log("Initializing in Spectator Mode (No Media Requested)");
        } else {
          console.warn("Camera failed. Trying audio only.", err);
        }

        try {
          if (noMediaParam === 'true') throw new Error("Skipping audio too");

          // 2nd attempt: Mic only
          localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
          });
          alert("No camera detected. Joined room with Audio Only.");
        } catch (audioErr) {
          // 3rd attempt: Empty stream (Spectator)
          localStream = new MediaStream();
        }
      }

      // If we have video tracks, set them up. Otherwise, skip the video element
      if (localStream.getVideoTracks().length > 0) {
        cameraTrack = localStream.getVideoTracks()[0];
        
        // USER REQUEST: Turn off Camera by default upon joining
        cameraTrack.enabled = false;

        // Remove any existing self-video just in case
        const existingVideo = document.getElementById("self-video");
        if (existingVideo) existingVideo.remove();

        const wrapper = document.createElement("div");
        wrapper.className = "video-wrapper";
        wrapper.id = "wrapper-self";

        const myVideo = document.createElement("video");
        myVideo.id = "self-video";
        myVideo.srcObject = localStream;
        myVideo.muted = true;
        myVideo.autoplay = true;
        myVideo.playsInline = true;
        myVideo.style.transform = "scaleX(-1)";

        const muteIcon = document.createElement("div");
        muteIcon.className = "mute-icon-overlay";
        muteIcon.id = "mute-icon-self";
        muteIcon.innerHTML = "🔇";
        muteIcon.style.display = "none"; // hidden by default since we join hot

        const myAvatar = document.createElement("img");
        myAvatar.className = "avatar-placeholder";
        myAvatar.id = "avatar-self";
        myAvatar.src = userData.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${userData.email || userData.name}`;
        const isVideoOff = !localStream.getVideoTracks()[0] || !localStream.getVideoTracks()[0].enabled;
        myVideo.style.display = isVideoOff ? "none" : "block";
        myAvatar.style.display = isVideoOff ? "block" : "none";

        const nameLabel = document.createElement("div");
        nameLabel.className = "name-label";
        nameLabel.id = "name-label-self";
        nameLabel.textContent = userData.name;

        wrapper.appendChild(myAvatar);
        wrapper.appendChild(myVideo);
        wrapper.appendChild(muteIcon);
        wrapper.appendChild(nameLabel);
        videoGrid?.appendChild(wrapper);
        updateVideoLayout();
      } else {
        // No-media mode — still show an avatar tile for this user
        const existingWrapper = document.getElementById("wrapper-self");
        if (!existingWrapper) {
          const wrapper = document.createElement("div");
          wrapper.className = "video-wrapper";
          wrapper.id = "wrapper-self";

          const myAvatar = document.createElement("img");
          myAvatar.className = "avatar-placeholder";
          myAvatar.id = "avatar-self";
          myAvatar.src = userData.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${userData.email || userData.name}`;
          myAvatar.style.display = "block";

          const muteIcon = document.createElement("div");
          muteIcon.className = "mute-icon-overlay";
          muteIcon.id = "mute-icon-self";
          muteIcon.innerHTML = "🔇";
          muteIcon.style.display = "block"; // spectators are always muted

          const nameLabel = document.createElement("div");
          nameLabel.className = "name-label";
          nameLabel.id = "name-label-self";
          nameLabel.textContent = `${userData.name} (spectator)`;

          wrapper.appendChild(myAvatar);
          wrapper.appendChild(muteIcon);
          wrapper.appendChild(nameLabel);
          videoGrid?.appendChild(wrapper);
        }
        updateVideoLayout();
      }

      // Sync local button state
      const micBtn = document.querySelector(`button[onclick="toggleMic()"]`);
      if (micBtn) micBtn.style.opacity = "1";
      
      const camBtn = document.querySelector(`button[onclick="toggleCamera()"]`);
      if (camBtn) camBtn.style.opacity = "0.5";

      monitorAudioLevel(localStream, "self");

      // Signal readiness to peers regardless of what devices we had
      const videoTrack = localStream.getVideoTracks()[0];
      const isVideoOff = !videoTrack || !videoTrack.enabled;
      socket.emit("video-ready", { roomId, isVideoOff });

    } catch (err) {
      console.error("Critical Media error:", err);
    }
  }

  /* ================= AUDIO ANALYZER ================= */
  let globalAudioContext = null;

  function monitorAudioLevel(stream, id) {
    if (stream.getAudioTracks().length === 0) return;
    
    try {
      if (!globalAudioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        globalAudioContext = new AudioContext();
      }
      
      const source = globalAudioContext.createMediaStreamSource(stream);
      const analyser = globalAudioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      function checkLevel() {
        const videoWrap = document.getElementById(`wrapper-${id}`);
        if (!videoWrap) return; // Stop memory loop if user disconnects
        
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        
        const isMicEnabled = stream.getAudioTracks()[0].enabled;
        if (average > 10 && isMicEnabled) {
           videoWrap.style.boxShadow = "0 0 25px 5px #a78bfa";
        } else {
           videoWrap.style.boxShadow = "";
        }
        requestAnimationFrame(checkLevel);
      }
      checkLevel();
    } catch(err) {
      console.warn("Audio analyzer skipped:", err);
    }
  }

  /* ================= WEBRTC SIGNALING ================= */

  function createPeer(targetId, picture, isVideoOff, name) {
    if (peers[targetId]) return peers[targetId];

    // Register active state
    if (picture || name) {
       activeAvatars[targetId] = { 
         picture: picture || (activeAvatars[targetId] ? activeAvatars[targetId].picture : null),
         name: name || (activeAvatars[targetId] ? activeAvatars[targetId].name : "Unknown"),
         isVideoOff: isVideoOff !== undefined ? isVideoOff : (activeAvatars[targetId] ? activeAvatars[targetId].isVideoOff : false)
       };
    }

    const peer = new RTCPeerConnection(rtcConfig);
    peers[targetId] = peer;

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
      });
    }

    if (screenTrack) {
      peer.addTrack(screenTrack, localStream || new MediaStream());
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          target: targetId,
          candidate: event.candidate
        });
      }
    };

    // Eagerly create an avatar tile for this peer.
    // If they have tracks, ontrack will upgrade it to show the video.
    // If they are a spectator (no tracks), this tile is all they get.
    if (!document.getElementById(`wrapper-${targetId}`)) {
      const eagerWrapper = document.createElement("div");
      eagerWrapper.className = "video-wrapper";
      eagerWrapper.id = `wrapper-${targetId}`;

      const eagerAvatar = document.createElement("img");
      eagerAvatar.className = "avatar-placeholder";
      eagerAvatar.id = `avatar-${targetId}`;
      eagerAvatar.src = (activeAvatars[targetId] && activeAvatars[targetId].picture)
        || `https://api.dicebear.com/7.x/identicon/svg?seed=${targetId}`;
      eagerAvatar.style.display = "block";

      const eagerMuteIcon = document.createElement("div");
      eagerMuteIcon.className = "mute-icon-overlay";
      eagerMuteIcon.id = `mute-icon-${targetId}`;
      eagerMuteIcon.innerHTML = "🔇";
      eagerMuteIcon.style.display = "none";

      const eagerNameLabel = document.createElement("div");
      eagerNameLabel.className = "name-label";
      eagerNameLabel.id = `name-label-${targetId}`;
      eagerNameLabel.textContent = (activeAvatars[targetId] && activeAvatars[targetId].name) || "User";

      eagerWrapper.appendChild(eagerAvatar);
      eagerWrapper.appendChild(eagerMuteIcon);
      eagerWrapper.appendChild(eagerNameLabel);
      videoGrid?.appendChild(eagerWrapper);
      updateVideoLayout();
    }

    peer.ontrack = (event) => {
      const stream = event.streams[0];
      let wrapper = document.getElementById(`wrapper-${targetId}`);
      let videoEl = document.getElementById(`video-${targetId}`);

      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "video-wrapper";
        wrapper.id = `wrapper-${targetId}`;

        videoEl = document.createElement("video");
        videoEl.id = `video-${targetId}`;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        
        const remoteAvatar = document.createElement("img");
        remoteAvatar.className = "avatar-placeholder";
        remoteAvatar.id = `avatar-${targetId}`;
        remoteAvatar.src = (activeAvatars[targetId] && activeAvatars[targetId].picture) || `https://api.dicebear.com/7.x/identicon/svg?seed=${targetId}`;
        
        const isOff = activeAvatars[targetId] ? activeAvatars[targetId].isVideoOff : false;
        remoteAvatar.style.display = isOff ? "block" : "none";
        videoEl.style.display = isOff ? "none" : "block";
        
        const muteIcon = document.createElement("div");
        muteIcon.className = "mute-icon-overlay";
        muteIcon.id = `mute-icon-${targetId}`;
        muteIcon.innerHTML = "🔇";
        muteIcon.style.display = "none"; // dynamically toggled by network

        const nameLabel = document.createElement("div");
        nameLabel.className = "name-label";
        nameLabel.id = `name-label-${targetId}`;
        nameLabel.textContent = (activeAvatars[targetId] && activeAvatars[targetId].name) || "User";

        wrapper.appendChild(remoteAvatar);
        wrapper.appendChild(videoEl);
        wrapper.appendChild(muteIcon);
        wrapper.appendChild(nameLabel);
        videoGrid?.appendChild(wrapper);
        updateVideoLayout();
      }

      videoEl.srcObject = stream;
      videoEl.onloadedmetadata = () => {
        videoEl.play().catch(e => console.error("Autoplay thwarted:", e));
      };
      
      if (stream.getAudioTracks().length > 0) {
          monitorAudioLevel(stream, targetId);
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "disconnected" || peer.connectionState === "failed" || peer.connectionState === "closed") {
        const wrapper = document.getElementById(`wrapper-${targetId}`);
        if (wrapper) wrapper.remove();
        delete peers[targetId];
        updateVideoLayout();
      }
    };

    return peer;
  }

  socket.on("video-ready", async ({ sender, picture, isVideoOff, name }) => {
    const peer = createPeer(sender, picture, isVideoOff, name);
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      
      const videoTrack = localStream ? localStream.getVideoTracks()[0] : null;
      socket.emit("video-offer", { target: sender, offer, isVideoOff: !videoTrack || !videoTrack.enabled, picture: userData.picture, name: userData.name });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  });

  socket.on("video-offer", async ({ sender, offer, picture, isVideoOff, name }) => {
    const peer = createPeer(sender, picture, isVideoOff, name);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    
    const videoTrack = localStream ? localStream.getVideoTracks()[0] : null;
    socket.emit("video-answer", { target: sender, answer, isVideoOff: !videoTrack || !videoTrack.enabled, picture: userData.picture, name: userData.name });
  });

  socket.on("video-answer", async ({ sender, answer, picture, isVideoOff, name }) => {
    const peer = createPeer(sender, picture, isVideoOff, name);
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error("Error setting answer:", err);
    }
  });

  socket.on("ice-candidate", ({ sender, candidate }) => {
    const peer = peers[sender];
    if (peer) {
      peer.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(err => console.error("ICE error:", err));
    }
  });

  socket.on("client-state-change", ({ userId, isMuted, isVideoOff }) => {
    const muteIcon = document.getElementById(`mute-icon-${userId}`);
    if (muteIcon && isMuted !== undefined) {
      muteIcon.style.display = isMuted ? "block" : "none";
    }
    
    const videoEl = document.getElementById(`video-${userId}`);
    const avatarEl = document.getElementById(`avatar-${userId}`);
    if (videoEl && avatarEl && isVideoOff !== undefined) {
      videoEl.style.display = isVideoOff ? "none" : "block";
      avatarEl.style.display = isVideoOff ? "block" : "none";
    }
  });

  socket.on("user-disconnected", (id) => {
    const wrapper = document.getElementById(`wrapper-${id}`);
    if (wrapper) wrapper.remove();
    if (peers[id]) {
      peers[id].close();
      delete peers[id];
    }
    updateVideoLayout();
  });

  /* ================= MEDIA CONTROLS ================= */

  window.toggleMic = async function () {
    if (!localStream) return;

    const btn = document.querySelector(`button[onclick="toggleMic()"]`);
    const myIcon = document.getElementById("mute-icon-self");

    if (!isMicHardMuted) {
      // === MUTE: Hard-stop the track to fully release hardware ===
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.stop(); // Releases the OS-level mic lock
        localStream.removeTrack(audioTrack);
      }
      isMicHardMuted = true;

      if (btn) {
        btn.innerHTML = "<span style='color:#ef4444'>🔇</span>";
        btn.style.opacity = "1";
      }
      if (myIcon) myIcon.style.display = "block";
      socket.emit("client-state-change", { roomId, isMuted: true });

    } else {
      // === UNMUTE: Re-acquire mic and hot-swap into all peer connections ===
      try {
        if (btn) { btn.innerHTML = "⏳"; btn.style.opacity = "0.5"; }

        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newAudioTrack = newStream.getAudioTracks()[0];

        // Add track to local stream
        localStream.addTrack(newAudioTrack);
        isMicHardMuted = false;

        // Hot-swap track in every active peer connection
        for (const peerId in peers) {
          const peer = peers[peerId];
          const sender = peer.getSenders().find(s => s.track && s.track.kind === "audio");
          if (sender) {
            await sender.replaceTrack(newAudioTrack);
          } else {
            // If no audio sender exists yet, add it
            peer.addTrack(newAudioTrack, localStream);
          }
        }

        // Restart the glow analyzer on the new track
        monitorAudioLevel(localStream, "self");

        if (btn) {
          btn.innerHTML = "🎤";
          btn.style.opacity = "1";
        }
        if (myIcon) myIcon.style.display = "none";
        socket.emit("client-state-change", { roomId, isMuted: false });

      } catch (err) {
        console.error("Failed to re-acquire microphone:", err);
        if (btn) { btn.innerHTML = "<span style='color:#ef4444'>🔇</span>"; btn.style.opacity = "1"; }
        alert("Could not access your microphone. Please check permissions.");
      }
    }
  };

  window.toggleCamera = function () {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      
      const isVideoOff = !videoTrack.enabled;
      
      const btn = document.getElementById("btn-camera");
      if (btn) btn.style.opacity = !isVideoOff ? "1" : "0.5";
      
      const selfVideo = document.getElementById("self-video");
      const selfAvatar = document.getElementById("avatar-self");
      if (selfVideo && selfAvatar) {
        selfVideo.style.display = isVideoOff ? "none" : "block";
        selfAvatar.style.display = isVideoOff ? "block" : "none";
      }

      socket.emit("client-state-change", { roomId, isVideoOff });
    }
  };

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

  /* ================= PRE-JOIN & SOCKET CONNECT ================= */

  let isMediaDetermined = false;

  function tryJoin() {
    console.log("tryJoin called ->", { connected: !!socket?.connected, media: isMediaDetermined, roomId });
    if (socket.connected && isMediaDetermined && roomId) {
      console.log("tryJoin Executing Emit: join-room ->", roomId);
      socket.emit("join-room", { roomId });
      initMedia();
    } else {
      console.warn("tryJoin Condition Failed: Skipping join-room emit");
    }
  }

  socket.on("connect", () => {
    tryJoin();
  });

  if (noMediaParam === "true" || noMediaParam === "false") {
    isMediaDetermined = true;
    tryJoin();
  } else {
    // Show modal if joining from external link and parameter is missing
    const overlay = document.getElementById("prejoin-modal-overlay");
    const card = overlay?.querySelector(".modal-card");

    if (overlay) {
      overlay.style.display = "flex";
      overlay.classList.add("active");
    }
    if (card) {
      card.classList.add("active");
    }

    document.getElementById("join-media-btn")?.addEventListener("click", () => {
      noMediaParam = "false";
      isMediaDetermined = true;

      if (overlay) overlay.classList.remove("active");
      if (card) card.classList.remove("active");
      setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 300);

      tryJoin();
    });

    document.getElementById("join-nomedia-btn")?.addEventListener("click", () => {
      noMediaParam = "true";
      isMediaDetermined = true;

      if (overlay) overlay.classList.remove("active");
      if (card) card.classList.remove("active");
      setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 300);

      tryJoin();
    });
  }

  /* ================= PRESENCE ================= */

  let roomUsers = [];

  socket.on("presence-update", ({ users, count }) => {
    roomUsers = users.map(u => u.name);
    const list = document.getElementById("participants-list");
    const counter = document.getElementById("online-count");

    if (list) {
      list.innerHTML = "";
      users.forEach(u => {
        const li = document.createElement("li");

        let emoji = "🟢";
        if (u.status === "idle") emoji = "🌙";
        if (u.status === "dnd") emoji = "🔴";

        li.innerHTML = `${emoji} ${u.name}`;
        list.appendChild(li);
      });
    }

    if (counter) counter.textContent = `Online: ${count}`;
  });

  document.getElementById("user-status")?.addEventListener("change", (e) => {
    socket.emit("change-status", { status: e.target.value });
  });

  socket.on("room-full", ({ message }) => {
    alert(`🚫 ${message}\nYou will be redirected to the Dashboard.`);
    window.location.href = "dashboard.html";
  });

  socket.on("room-info", (info) => {
    const roomTypeSpan = document.getElementById("room-type");
    if (roomTypeSpan) {
      roomTypeSpan.innerText = info.type === "private" ? "🔒 Private" : "🌍 Public";
    }

    const stageHeader = document.querySelector(".stage-header h2");
    if (stageHeader) {
      stageHeader.innerText = `📚 ${info.name}`;
    }

    if (info.type === "private" && info.inviteCode) {
      const inviteBox = document.getElementById("invite-box");
      const inviteLink = document.getElementById("invite-link");
      if (inviteBox && inviteLink) {
        inviteBox.style.display = "flex";
        inviteLink.value = `${window.location.origin}/pages/room.html?invite=${info.inviteCode}`;
      }
    } else if (info.type === "public") {
      // Restrict controls for public rooms
      document.getElementById("btn-mic")?.remove();
      document.getElementById("btn-screen")?.remove();
      document.getElementById("btn-bg")?.remove();
      document.getElementById("btn-timer")?.remove();
      document.getElementById("tab-room-btn")?.remove();

      // Force mute audio tracks if established
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
    }
  });

  window.copyInvite = function () {
    const inviteLink = document.getElementById("invite-link");
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink.value)
      .then(() => alert("Invite link copied to clipboard!"))
      .catch(err => console.error("Could not copy text: ", err));
  };

  /* ================= CHAT ================= */

  const input = document.getElementById("chat-input");
  const mentionPopup = document.getElementById("mention-popup");

  let mentionSearch = "";
  let mentionIndex = 0;
  let isMentioning = false;
  let mentionUsersList = [];

  function renderMentionPopup() {
    if (!mentionPopup) return;
    mentionPopup.innerHTML = "";
    mentionUsersList.forEach((u, idx) => {
      const div = document.createElement("div");
      div.className = "mention-item" + (idx === mentionIndex ? " selected" : "");
      div.innerHTML = `<strong>@${u}</strong>`;

      div.onmousedown = (e) => {
        e.preventDefault();
        insertMention(u);
      };

      mentionPopup.appendChild(div);
    });
  }

  function insertMention(username) {
    if (!input) return;
    const val = input.value;
    const cursor = input.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const textAfterCursor = val.slice(cursor);

    const newTextBefore = textBeforeCursor.replace(/@([a-zA-Z0-9_ ]*)$/, `@${username} `);
    input.value = newTextBefore + textAfterCursor;

    if (mentionPopup) mentionPopup.style.display = "none";
    isMentioning = false;
    input.focus();
  }

  input?.addEventListener("input", (e) => {
    const val = input.value;
    const cursor = input.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_ ]*)$/);

    if (lastAtMatch) {
      isMentioning = true;
      mentionSearch = lastAtMatch[1].toLowerCase();
      mentionUsersList = roomUsers.filter(u => u.toLowerCase().startsWith(mentionSearch) && u !== user);

      if (mentionUsersList.length > 0) {
        mentionIndex = 0;
        if (mentionPopup) {
          mentionPopup.style.display = "block";
          renderMentionPopup();
        }
      } else {
        if (mentionPopup) mentionPopup.style.display = "none";
      }
    } else {
      isMentioning = false;
      if (mentionPopup) mentionPopup.style.display = "none";
    }
  });

  input?.addEventListener("blur", () => {
    setTimeout(() => {
      if (mentionPopup) mentionPopup.style.display = "none";
      isMentioning = false;
    }, 150);
  });

  function renderMessage(sender, message, createdAt) {
    const container = document.getElementById("messages");
    if (!container) return;

    const div = document.createElement("div");

    // Check if current user is mentioned
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionPattern = new RegExp(`@${escapeRegExp(user)}(?=\\W|$)`, 'i');
    const isMentioned = mentionPattern.test(message) && sender !== user;

    if (isMentioned) {
      playNotificationSound();
    }

    // Format all @mentions visually for everyone
    let formattedMessage = message;
    const escapedUsers = roomUsers.map(u => escapeRegExp(u));
    if (escapedUsers.length > 0) {
      escapedUsers.sort((a, b) => b.length - a.length);
      const mentionRegex = new RegExp(`@(${escapedUsers.join('|')})(?=\\W|$)`, 'gi');
      formattedMessage = message.replace(mentionRegex, '<span class="mention-tag">@$1</span>');
    } else {
      formattedMessage = message.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention-tag">@$1</span>');
    }

    div.className = sender === user ? "msg own" : "msg";
    if (isMentioned) {
      div.classList.add("mentioned-msg");
    }

    div.innerHTML = `
    <strong>${sender}</strong>
    <span style="font-size:10px;margin-left:6px;">
      ${new Date(createdAt).toLocaleTimeString()}
    </span>
    <div style="margin-top: 4px; word-break: break-word;">${formattedMessage}</div>
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
    if (isMentioning && mentionPopup && mentionPopup.style.display === "block") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionUsersList.length;
        renderMentionPopup();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionIndex = (mentionIndex - 1 + mentionUsersList.length) % mentionUsersList.length;
        renderMentionPopup();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionUsersList[mentionIndex]);
        return;
      }
    }

    if (e.key === "Enter" && input.value.trim()) {
      socket.emit("chat-message", {
        roomId,
        message: input.value.trim()
      });
      input.value = "";
      if (mentionPopup) mentionPopup.style.display = "none";
      isMentioning = false;
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
        // Find existing video sender or null sender if we were audio only
        const sender = peer.getSenders().find(s => s.track === null || s.track?.kind === "video");

        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          // If no sender exists at all, explicitly add the track
          peer.addTrack(screenTrack, localStream || new MediaStream());
        }
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

    // Restore camera to peers if we have one, otherwise replace with null
    Object.values(peers).forEach(peer => {
      const sender = peer.getSenders().find(s => s.track);
      if (sender) {
        sender.replaceTrack(cameraTrack || null);
      }
    });
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

  /* ================= ZEN MODE ================= */

  window.toggleZenMode = function () {
    const room = document.querySelector(".discord-room");
    const btn = document.getElementById("btn-zen");
    if (!room) return;

    room.classList.toggle("zen-mode");

    if (room.classList.contains("zen-mode")) {
      if (btn) btn.innerHTML = "🧘‍♀️";
    } else {
      if (btn) btn.innerHTML = "🧘";
    }
  };

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
