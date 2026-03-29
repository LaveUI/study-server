document.addEventListener("DOMContentLoaded", () => {

  const API = window.location.port === "5500" ? "http://localhost:5000" : window.location.origin;

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
          "Cache-Control": "no-cache"
        },
        cache: 'no-store'
      });

      if (!res.ok) throw new Error("Unauthorized");

      const rooms = await res.json();
      roomsList.innerHTML = "";

      if (!rooms.length) {
        roomsList.innerHTML =
          "<p class='muted'>No public rooms available</p>";
        return;
      }

      rooms.forEach((room, index) => {
        const div = document.createElement("div");
        div.className = "room-item glass";
        div.style.animationDelay = `${index * 0.08}s`;
        div.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>🌍 ${room.name}</strong>
              <p class="muted">Public Room</p>
            </div>
            <div class="nomedia-wrapper" style="display: flex; align-items: center; gap: 6px;" title="Join without Mic/Cam">
              <input type="checkbox" class="join-nomedia-cb" id="nomedia-pub-${room._id}" style="margin:0; width:auto; cursor:pointer;" />
              <label for="nomedia-pub-${room._id}" style="margin:0; font-size: 0.75rem; cursor:pointer; color: var(--muted); white-space: nowrap;">No Mic/Cam</label>
            </div>
          </div>
        `;

        div.addEventListener("click", (e) => {
          if (e.target.closest('.nomedia-wrapper')) return;

          const noMedia = div.querySelector('.join-nomedia-cb')?.checked;
          const urlParams = noMedia ? `&nomedia=true` : `&nomedia=false`;
          window.location.href = `room.html?roomId=${room._id}${urlParams}`;
        });

        roomsList.appendChild(div);
      });

    } catch (err) {
      console.error("Load rooms error:", err);
      roomsList.innerHTML = `<p style="color:var(--danger)">Warning: Could not connect to the database. Trying again...</p>`;
    }
  }

  /* ================= LOAD USER'S ROOMS (PRIVATE & PUBLIC) ================= */

  async function loadMyRooms() {
    try {
      if (!user.name) return;

      const res = await fetch(`${API}/rooms/my-rooms/${encodeURIComponent(user.email)}`, {
        headers: {
          Authorization: "Bearer " + token,
          "Cache-Control": "no-cache"
        },
        cache: 'no-store'
      });

      if (!res.ok) return;

      const rooms = await res.json();
      const myRoomsSection = document.getElementById("myRoomsSection");
      const myRoomsList = document.getElementById("myRoomsList");

      if (!rooms.length) {
        if (myRoomsSection) myRoomsSection.style.display = "none";
        return;
      }

      if (myRoomsSection) myRoomsSection.style.display = "block";
      if (myRoomsList) myRoomsList.innerHTML = "";

      rooms.forEach((room, index) => {
        const div = document.createElement("div");
        div.className = "room-item glass";
        div.style.animationDelay = `${index * 0.08}s`;

        div.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <strong>${room.name}</strong>
              <p class="muted">🔒 Private Room</p>
              <p class="muted" style="font-size:0.8rem; margin-top:5px; margin-bottom:0;">Invite Link: <code>?invite=${room.inviteCode}</code></p>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
              <button class="icon-btn delete-btn" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem; padding: 0;" title="Cancel Session">🗑️</button>
              <div class="nomedia-wrapper" style="display: flex; align-items: center; gap: 6px;" title="Join without Mic/Cam">
                <input type="checkbox" class="join-nomedia-cb" id="nomedia-priv-${room._id}" style="margin:0; width:auto; cursor:pointer;" />
                <label for="nomedia-priv-${room._id}" style="margin:0; font-size: 0.75rem; cursor:pointer; color: var(--muted); white-space: nowrap;">No Mic/Cam</label>
              </div>
            </div>
          </div>
        `;

        div.addEventListener("click", (e) => {
          if (e.target.closest('.delete-btn') || e.target.closest('.nomedia-wrapper')) return; // Ignore if user clicked delete or checkbox

          const noMedia = div.querySelector('.join-nomedia-cb')?.checked;
          const urlParams = noMedia ? `&nomedia=true` : `&nomedia=false`;
          window.location.href = `room.html?roomId=${room._id}${urlParams}`;
        });

        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm("Are you sure you want to cancel and delete this private room?")) {
            try {
              const res = await fetch(`${API}/rooms/${room._id}`, {
                method: "DELETE",
                headers: {
                  Authorization: "Bearer " + token,
                },
              });
              if (res.ok) {
                loadMyRooms(); // Refresh the list
              } else {
                alert("Failed to delete the room.");
              }
            } catch (err) {
              console.error("Delete error:", err);
            }
          }
        });

        myRoomsList.appendChild(div);
      });

    } catch (err) {
      console.error("Failed to load user rooms:", err);
    }
  }

  /* ================= CREATE ROOM ================= */

  /* ================= ROOM MODAL LOGIC ================= */

  const modal = document.getElementById("roomModal");
  const overlay = document.getElementById("roomModalOverlay");

  createBtn.addEventListener("click", () => {
    modal.classList.add("active");
    overlay.classList.add("active");
  });

  window.closeRoomModal = function () {
    modal.classList.remove("active");
    overlay.classList.remove("active");
  };

  overlay.addEventListener("click", closeRoomModal);

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
          type: "private",
          host: user.email,
          hostName: user.name
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to create room.");
        return;
      }

      const noMedia = document.getElementById("noMediaCheckbox")?.checked;
      const urlParams = noMedia ? `&nomedia=true` : `&nomedia=false`;

      closeRoomModal();

      window.location.href = `room.html?roomId=${data._id}${urlParams}`;

    } catch (err) {
      alert("Something went wrong.");
    }
  };


  /* ================= INITIAL LOAD ================= */

  loadRooms();
  loadMyRooms();

  /* ================= HANDLE BROWSER BACK BUTTON ================= */
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      loadRooms();
      loadMyRooms();
    }
  });

});
