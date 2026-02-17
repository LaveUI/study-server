document.addEventListener("DOMContentLoaded", () => {

  const API = "http://localhost:5000";

  const token = localStorage.getItem("token");
  const userData = localStorage.getItem("user");

  if (!token || !userData) {
    localStorage.clear();
    window.location.href = "login.html";
    return;
  }

  const user = JSON.parse(userData);

  const roomsList = document.getElementById("roomsList");
  const createBtn = document.getElementById("createRoom");

  /* ================= HEADER INIT ================= */

  const userName = document.getElementById("user-name");
  const headerAvatar = document.getElementById("header-avatar");
  const welcomeText = document.getElementById("welcome-text");

  if (userName) userName.textContent = user.name;
  if (welcomeText) welcomeText.textContent = `Welcome back, ${user.name} 👋`;
  if (headerAvatar && user.picture) headerAvatar.src = user.picture;

  /* ================= LOGOUT ================= */

  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "login.html";
    });
  }

  /* ================= PROFILE DRAWER ================= */

  const profileTrigger = document.getElementById("profileTrigger");
  const profileOverlay = document.getElementById("profile-overlay");
  const profileDrawer = document.getElementById("profile-drawer");
  const closeProfileBtn = document.getElementById("closeProfileBtn");
  const saveBtn = document.querySelector(".save-profile-btn");

  function openProfile() {

    if (!profileOverlay || !profileDrawer) return;

    profileOverlay.classList.add("active");
    profileDrawer.classList.add("active");

    const profilePic = document.getElementById("profile-pic");
    const profileName = document.getElementById("profile-name");

    if (profilePic) profilePic.src = user.picture || "";
    if (profileName) profileName.value = user.name;

    const savedProfile =
      JSON.parse(localStorage.getItem("profile")) || {};

    const roleSelect = document.getElementById("profile-role");
    const interestsInput = document.getElementById("profile-interests");

    if (roleSelect)
      roleSelect.value = savedProfile.role || "College Student";

    if (interestsInput)
      interestsInput.value = savedProfile.interests || "";
  }

  function closeProfile() {
    profileOverlay?.classList.remove("active");
    profileDrawer?.classList.remove("active");
  }

  if (profileTrigger) {
    profileTrigger.addEventListener("click", openProfile);
  }

  if (profileOverlay) {
    profileOverlay.addEventListener("click", closeProfile);
  }

  if (closeProfileBtn) {
    closeProfileBtn.addEventListener("click", closeProfile);
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {

      const profileData = {
        role: document.getElementById("profile-role")?.value,
        interests: document.getElementById("profile-interests")?.value
      };

      localStorage.setItem("profile", JSON.stringify(profileData));

      closeProfile();
    });
  }

  /* ================= LOAD PUBLIC ROOMS ================= */

  async function loadRooms() {
    try {

      const res = await fetch(`${API}/rooms`, {
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      if (!res.ok) throw new Error("Unauthorized");

      const rooms = await res.json();
      roomsList.innerHTML = "";

      if (!rooms.length) {
        roomsList.innerHTML =
          "<p class='muted'>No public rooms available</p>";
        return;
      }

      rooms.forEach(room => {
        const div = document.createElement("div");
        div.className = "room-item glass";
        div.innerHTML = `
          <strong>🌍 ${room.name}</strong>
          <p class="muted">Public Room</p>
        `;

        div.addEventListener("click", () => {
          window.location.href = `room.html?roomId=${room._id}`;
        });

        roomsList.appendChild(div);
      });

    } catch (err) {
      console.error("Load rooms error:", err);
      alert("Session expired. Please login again.");
      localStorage.clear();
      window.location.href = "login.html";
    }
  }

  /* ================= CREATE ROOM ================= */

/* ================= ROOM MODAL LOGIC ================= */

const modal = document.getElementById("roomModal");
const overlay = document.getElementById("roomModalOverlay");

const publicBtn = document.getElementById("publicBtn");
const privateBtn = document.getElementById("privateBtn");

let selectedType = "public";

createBtn.addEventListener("click", () => {
  modal.classList.add("active");
  overlay.classList.add("active");
});

window.closeRoomModal = function () {
  modal.classList.remove("active");
  overlay.classList.remove("active");
};

overlay.addEventListener("click", closeRoomModal);

publicBtn.addEventListener("click", () => {
  selectedType = "public";
  publicBtn.classList.add("active");
  privateBtn.classList.remove("active");
});

privateBtn.addEventListener("click", () => {
  selectedType = "private";
  privateBtn.classList.add("active");
  publicBtn.classList.remove("active");
});

window.submitRoom = async function () {

  const name = document.getElementById("roomNameInput").value.trim();
  if (!name) return alert("Enter room name");

  try {

    const res = await fetch(`${API}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        name,
        type: selectedType,
        host: user.name
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to create room.");
      return;
    }

    closeRoomModal();

    window.location.href = `room.html?roomId=${data._id}`;

  } catch (err) {
    alert("Something went wrong.");
  }
};


  /* ================= INITIAL LOAD ================= */

  loadRooms();

});
