const roomsList = document.getElementById("roomsList");
const createBtn = document.getElementById("createRoom");

const API = "http://localhost:5000";

// 🔒 Auth guard
if (!localStorage.getItem("user") || !localStorage.getItem("token")) {
  window.location.href = "login.html";
}

// Load public rooms
async function loadRooms() {
  const res = await fetch(`${API}/rooms`, {
    headers: {
      "Authorization": "Bearer " + localStorage.getItem("token"),
    },
  });

  if (!res.ok) {
    alert("Session expired. Please login again.");
    localStorage.clear();
    window.location.href = "login.html";
    return;
  }

  const rooms = await res.json();
  roomsList.innerHTML = "";

  if (rooms.length === 0) {
    roomsList.innerHTML = "<p class='muted'>No public rooms available</p>";
    return;
  }

  rooms.forEach(room => {
    const div = document.createElement("div");
    div.className = "room-item glass";
    div.textContent = `🌍 ${room.name}`;

    div.onclick = () => {
      window.location.href = `room.html?roomId=${room._id}`;
    };

    roomsList.appendChild(div);
  });
}

// Create room (public / private)
createBtn.onclick = async () => {
  const name = prompt("Enter room name");
  if (!name) return;

  const isPrivate = confirm("Make this room private?");

  const res = await fetch(`${API}/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + localStorage.getItem("token"),
    },
    body: JSON.stringify({
      name,
      type: isPrivate ? "private" : "public",
    }),
  });

  if (!res.ok) {
    alert("Failed to create room. Please login again.");
    return;
  }

  const room = await res.json();

  if (room.type === "private") {
    const inviteLink =
      `${window.location.origin}/src/pages/room.html?invite=${room.inviteCode}`;

    prompt("Invite link (copy & share):", inviteLink);
  }

  loadRooms();
};

// Initial load
loadRooms();
