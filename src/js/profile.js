// Auth guard
if (!localStorage.getItem("user") || !localStorage.getItem("token")) {
  window.location.href = "login.html";
}

const user = JSON.parse(localStorage.getItem("user"));

document.getElementById("name").value = user.name;
document.getElementById("role").value = user.role || "College Student";
document.getElementById("interests").value = user.interests || "";

function saveProfile() {
  user.role = document.getElementById("role").value;
  user.interests = document.getElementById("interests").value;

  localStorage.setItem("user", JSON.stringify(user));
  alert("Profile saved");
}

function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}
