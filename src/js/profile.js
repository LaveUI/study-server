// Auth guard
if (!sessionStorage.getItem("user") || !sessionStorage.getItem("token")) {
  window.location.href = "login.html";
}

const user = JSON.parse(sessionStorage.getItem("user"));

document.getElementById("name").value = user.name;
document.getElementById("role").value = user.role || "College Student";
document.getElementById("interests").value = user.interests || "";

function saveProfile() {
  user.role = document.getElementById("role").value;
  user.interests = document.getElementById("interests").value;

  sessionStorage.setItem("user", JSON.stringify(user));
  alert("Profile saved");
}

function logout() {
  sessionStorage.clear();
  window.location.href = "login.html";
}
